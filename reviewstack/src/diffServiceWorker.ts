/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {BroadcastMessage} from './broadcast';
import type {DiffStats} from './diffStats';
import type GitHubClient from './github/GitHubClient';
import type {Blob, GitObjectID} from './github/types';
import type {LineToPosition} from './lineToPosition';
import type {SupportedPrimerColorMode} from './themeState';
import type {ParsedDiff} from 'diff';
import type GrammarStore from 'shared/textmate-lib/GrammarStore';
import type {HighlightedToken} from 'shared/textmate-lib/tokenize';

import BoundedCache from './boundedCache';
import {AVAILABILITY_METHOD, createDiffServiceBroadcastChannel} from './broadcast';
import {NUM_LINES_OF_CONTEXT} from './constants';
import {countBlobChanges} from './diffStats';
import {grammars} from './generated/textmate/TextMateGrammarManifest';
import CachingGitHubClient, {openDatabase} from './github/CachingGitHubClient';
import RejectingGitHubClient from './github/RejectingGitHubClient';
import {subscribeToLogout} from './github/logoutBroadcastChannel';
import lineToPosition from './lineToPosition';
import VSCodeDarkPlusTheme from './textmate/VSCodeDarkPlusTheme';
import VSCodeLightPlusTheme from './textmate/VSCodeLightPlusTheme';
import createGrammarStore from './textmate/createGrammarStore';
import {structuredPatch} from 'diff';
import lazyInit from 'shared/lazyInit';
import {tokenizeFileContents} from 'shared/textmate-lib/tokenize';

/*
 * This file is the entry point for a SharedWorker that provides support for
 * various diff-related computations so they can be offloaded from the main
 * thread.
 *
 * Clients should post a message matching the type `Message` defined in this
 * file where:
 * - `id` is a property that will be included in the response so the client can
 *   pair a response with a request
 * - `method` is the name of the method in the service to call
 * - `params` is an object with the properties the method expects
 *
 * The result of the remote method call will be sent as type `Response` via
 * `postMessage()`.
 */

export type Message =
  | {
      id: number;
      method: 'cancel';
      params: null;
    }
  | {
      id: number;
      method: 'lineToPosition';
      params: LineToPositionParams;
    }
  | {
      id: number;
      method: 'diffStats';
      params: DiffStatsParams;
    }
  | {
      id: number;
      method: 'colorMap';
      params: ColorMapParams;
    }
  | {
      id: number;
      method: 'diffAndTokenize';
      params: DiffAndTokenizeParams;
    }
  | {
      id: number;
      method: 'lineRange';
      params: LineRangeParams;
    }
  | {
      id: -1;
      method: 'publishAvailability';
      params: null;
    };

export type LineToPositionParams = {
  oldOID: GitObjectID | null;
  newOID: GitObjectID | null;
};

export type ColorMapParams = {
  colorMode: SupportedPrimerColorMode;
};

export type DiffAndTokenizeParams = {
  path: string;
  scopeName: string | null;
  colorMode: SupportedPrimerColorMode;
  before: GitObjectID | null;
  after: GitObjectID | null;
};

export type DiffAndTokenizeResponse = {
  patch: ParsedDiff;
  tokenization: TokenizedSplitDiff;
};

export type DiffStatsParams = {
  key: string;
  files: Array<{before: GitObjectID | null; after: GitObjectID | null}>;
};

export type DiffStatsResponse = DiffStats;

export type TokenizedSplitDiff = {
  before: HighlightedToken[][] | null;
  after: HighlightedToken[][] | null;
};

/**
 * Caller is responsible for ensuring a Blob matching the specified oid is
 * available in IndexedDB.
 */
export type LineRangeParams = {
  oid: GitObjectID;
  // 1-based line number.
  start: number;
  numLines: number;
};

export type LineRangeResponse = {
  /**
   * Caller must call unsplitLines.split('\n') to get the individual lines.
   *
   * Note this will be null if `notFound` or `isBinary` is true.
   */
  unsplitLines: string | null;
  /**
   * The Blob for the specified oid was not found in IndexedDB. Note this does
   * not mean no such Blob exists on GitHub (or will never exist), just that no
   * Blob matching the specified GitObjectID is cached locally.
   */
  notFound: boolean;
  /**
   * true if the Blob is binary and therefore does not support a LineRange
   * query.
   */
  isBinary: boolean;
};

export type Response = {
  id: number;
} & Result;

export type Result = {
  ok: unknown;
  err?: Error | null;
};

const globalScope = self as unknown as SharedWorkerGlobalScope;

// If the user logs out, we should shut this worker down immediately.
// It will get re-created if the user logs back in.
subscribeToLogout(() => globalScope.close());

/**
 * When a user loads ReviewStack, even if they are logged out, they will create
 * one SharedWorker because a colorMap will be requested as a byproduct of
 * requesting the theme for the page. We do not want a visit from a logged out
 * user to have the side-effect of opening/creating an IndexedDB, so we only
 * create the CachingGitHubClient once a logged-in user sends a request that
 * needs it.
 */
const getGitHubClient: () => Promise<GitHubClient> = lazyInit(async () => {
  const db = await openDatabase();
  return new CachingGitHubClient(
    db,
    new RejectingGitHubClient(),
    /* owner */ null,
    /* name */ null,
  );
});

const broadcastChannel = createDiffServiceBroadcastChannel();

let numActiveRequests = 0;

function broadcastAvailability() {
  const message: BroadcastMessage = {
    method: AVAILABILITY_METHOD,
    workerName: globalScope.name,
    available: numActiveRequests == 0,
  };
  broadcastChannel.postMessage(message);
}

function updateRequestCount(delta: 1 | -1) {
  numActiveRequests += delta;
  if (numActiveRequests === 0 || (numActiveRequests === 1 && delta === 1)) {
    broadcastAvailability();
  }
}

const cancelledRequests = new WeakMap<MessagePort, Set<number>>();

function respond<T>(port: MessagePort, id: number, request: Promise<T>): void {
  updateRequestCount(1);
  request
    .then(ok => {
      if (!cancelledRequests.get(port)?.has(id)) {
        port.postMessage({id, ok});
      }
    })
    .catch(err => {
      if (!cancelledRequests.get(port)?.has(id)) {
        port.postMessage({id, ok: null, err: String(err)});
      }
    })
    .finally(() => {
      cancelledRequests.get(port)?.delete(id);
      updateRequestCount(-1);
    });
}

function onMessage(port: MessagePort, {data}: {data: Message}) {
  const {id, method, params} = data;
  switch (method) {
    case 'cancel': {
      const requests = cancelledRequests.get(port) ?? new Set<number>();
      requests.add(id);
      cancelledRequests.set(port, requests);
      break;
    }
    case 'lineToPosition': {
      respond(port, id, fetchLineToPosition(params));
      break;
    }
    case 'colorMap': {
      const {colorMode} = params;
      respond(
        port,
        id,
        getGrammarStore(colorMode).then(store => store.getColorMap()),
      );
      break;
    }
    case 'diffAndTokenize': {
      respond(port, id, diffAndTokenize(params));
      break;
    }
    case 'diffStats': {
      respond(port, id, calculateDiffStats(params));
      break;
    }
    case 'lineRange': {
      respond(port, id, findlineRange(params));
      break;
    }
    case 'publishAvailability': {
      broadcastAvailability();
      break;
    }
  }
}

globalScope.addEventListener('connect', (event: MessageEvent) => {
  const port = event.ports[0];
  port.onmessage = (event: MessageEvent) => onMessage(port, event);
  // Explicitly start the port to ensure messages flow
  port.start();
});

broadcastAvailability();

// Limits are per worker. With at most six workers this caps derived diff data
// near 48 MiB, and results larger than one worker's budget are not retained.
const MAX_DIFF_CACHE_ENTRIES = 12;
const MAX_DIFF_CACHE_WEIGHT = 8 * 1024 * 1024;
const diffAndTokenizeCache = new BoundedCache<string, Promise<DiffAndTokenizeResponse>>(
  MAX_DIFF_CACHE_ENTRIES,
  MAX_DIFF_CACHE_WEIGHT,
);

function diffAndTokenize(params: DiffAndTokenizeParams): Promise<DiffAndTokenizeResponse> {
  const key = `${params.before ?? ''}:${params.after ?? ''}:${params.path}:${params.scopeName ?? ''}:${params.colorMode}`;
  const cached = diffAndTokenizeCache.get(key);
  if (cached != null) {
    return cached;
  }
  const request = diffAndTokenizeUncached(params);
  diffAndTokenizeCache.set(key, request, 1);
  request.then(
    result => diffAndTokenizeCache.set(key, request, JSON.stringify(result).length * 2),
    () => diffAndTokenizeCache.delete(key),
  );
  return request;
}

async function diffAndTokenizeUncached({
  path,
  scopeName,
  colorMode,
  before,
  after,
}: DiffAndTokenizeParams): Promise<DiffAndTokenizeResponse> {
  const [beforeBlob, afterBlob] = await getBlobPair(before, after);
  const beforeContents = beforeBlob?.text ?? '';
  const afterContents = afterBlob?.text ?? '';
  const patch = structuredPatch(path, path, beforeContents, afterContents, undefined, undefined, {
    context: NUM_LINES_OF_CONTEXT,
  });

  const tokenization =
    scopeName == null
      ? {before: null, after: null}
      : await tokenizeSplitDiff(scopeName, colorMode, beforeContents, afterContents);
  return {patch, tokenization};
}

const diffStatsCache = new BoundedCache<string, Promise<DiffStatsResponse>>(128, 2 * 1024 * 1024);

function calculateDiffStats(params: DiffStatsParams): Promise<DiffStatsResponse> {
  const cached = diffStatsCache.get(params.key);
  if (cached != null) {
    return cached;
  }
  const request = calculateDiffStatsUncached(params.files);
  diffStatsCache.set(params.key, request, Math.max(1, params.files.length * 82));
  request.catch(() => diffStatsCache.delete(params.key));
  return request;
}

async function calculateDiffStatsUncached(
  files: DiffStatsParams['files'],
): Promise<DiffStatsResponse> {
  const counts = await Promise.all(files.map(async file => {
    const [before, after] = await getBlobPair(file.before, file.after);
    const expectedBefore = file.before != null;
    const expectedAfter = file.after != null;
    return countBlobChanges(before, after, expectedBefore, expectedAfter);
  }));
  return counts.reduce(
    (total, count) => ({
      additions: total.additions + count.additions,
      deletions: total.deletions + count.deletions,
      binaryFiles: total.binaryFiles + count.binaryFiles,
      unavailableFiles: total.unavailableFiles + count.unavailableFiles,
    }),
    {additions: 0, deletions: 0, binaryFiles: 0, unavailableFiles: 0},
  );
}

async function tokenizeSplitDiff(
  scopeName: string,
  colorMode: SupportedPrimerColorMode,
  beforeContents: string,
  afterContents: string,
): Promise<TokenizedSplitDiff> {
  try {
    const store = await getGrammarStore(colorMode);
    const grammar = await store.loadGrammar(scopeName);
    if (grammar == null) {
      return {before: null, after: null};
    }

    return {
      before: tokenizeFileContents(beforeContents, grammar),
      after: tokenizeFileContents(afterContents, grammar),
    };
  } catch (err) {
    // WASM tokenizer can crash with "memory access out of bounds" on large
    // or problematic files. Fall back to no syntax highlighting.
    // eslint-disable-next-line no-console
    console.warn('Tokenization failed, falling back to plain text:', err);
    return {before: null, after: null};
  }
}

async function fetchLineToPosition({
  oldOID,
  newOID,
}: LineToPositionParams): Promise<LineToPosition> {
  const [beforeBlob, afterBlob] = await getBlobPair(oldOID, newOID);
  const beforeContents = beforeBlob?.text ?? '';
  const afterContents = afterBlob?.text ?? '';
  return lineToPosition(beforeContents, afterContents);
}

async function getBlobPair(
  left: GitObjectID | null,
  right: GitObjectID | null,
): Promise<[Blob | null, Blob | null]> {
  const client = await getGitHubClient();
  return Promise.all([
    left != null ? client.getBlob(left) : null,
    right != null ? client.getBlob(right) : null,
  ]);
}

const colorModeToGrammarStore = new Map<SupportedPrimerColorMode, Promise<GrammarStore>>();

function getGrammarStore(colorMode: SupportedPrimerColorMode): Promise<GrammarStore> {
  const existingRequest = colorModeToGrammarStore.get(colorMode);
  if (existingRequest != null) {
    return existingRequest;
  }

  const theme = colorMode === 'day' ? VSCodeLightPlusTheme : VSCodeDarkPlusTheme;
  const store = createGrammarStore(theme, grammars);
  colorModeToGrammarStore.set(colorMode, store);
  return store;
}

async function findlineRange({oid, start, numLines}: LineRangeParams): Promise<LineRangeResponse> {
  const client = await getGitHubClient();
  const blob = await client.getBlob(oid);
  const notFound = blob == null;
  // TODO: Check other fields, like isTruncated?
  const isBinary = blob?.isBinary ?? false;
  // TODO: Compute this without creating a giant array.
  const unsplitLines =
    blob?.text
      ?.split('\n')
      ?.slice(start - 1, start + numLines - 1)
      .join('\n') ?? null;
  return {unsplitLines, notFound, isBinary};
}
