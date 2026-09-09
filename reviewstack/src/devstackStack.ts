/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type StackLayer = {
  number: number;
  numCommits: number;
  commits?: string[];
};

export type DevstackPullRequestMetadata = {
  version: 1 | 2;
  stack: StackLayer[];
  currentStackEntry: number;
};

const DEVSTACK_METADATA = /<!--\s*DEVSTACK:REVIEWSTACK\s+({[\s\S]*?})\s*-->/;
const GIT_OBJECT_ID = /^[0-9a-f]{40}$/;

export type DevstackParseResult =
  | {type: 'absent'}
  | {type: 'invalid'; message: string}
  | {type: 'valid'; metadata: DevstackPullRequestMetadata};

export function parseDevstackStackBody(body: string): DevstackPullRequestMetadata | null {
  const result = parseDevstackStackBodyResult(body);
  return result.type === 'valid' ? result.metadata : null;
}

export function parseDevstackStackBodyResult(body: string): DevstackParseResult {
  const match = body.match(DEVSTACK_METADATA);
  if (match == null) {
    return body.includes('DEVSTACK:REVIEWSTACK')
      ? {type: 'invalid', message: 'The DEVSTACK:REVIEWSTACK comment is malformed.'}
      : {type: 'absent'};
  }

  try {
    const metadata = JSON.parse(match[1]) as {
      version?: unknown;
      current?: unknown;
      stack?: unknown;
    };
    if (
      (metadata.version !== 1 && metadata.version !== 2) ||
      !Number.isInteger(metadata.current) ||
      !Array.isArray(metadata.stack)
    ) {
      return {
        type: 'invalid',
        message: 'Devstack metadata must use version 1 or 2 and contain current and stack fields.',
      };
    }

    const stack = metadata.stack.map(entry => {
      const value = entry as {number?: unknown; commits?: unknown};
      const exactCommits = Array.isArray(value.commits) ? value.commits : undefined;
      return {
        number: value.number,
        numCommits: exactCommits?.length ?? value.commits,
        ...(exactCommits == null ? {} : {commits: exactCommits}),
      };
    });
    const hasWrongCommitShape = metadata.stack.some(entry => {
      const commits = (entry as {commits?: unknown}).commits;
      return metadata.version === 1 ? !Number.isInteger(commits) : !Array.isArray(commits);
    });
    if (
      hasWrongCommitShape ||
      stack.some(
        entry =>
          !Number.isInteger(entry.number) ||
          (entry.number as number) < 1 ||
          !Number.isInteger(entry.numCommits) ||
          (entry.numCommits as number) < 1 ||
          (entry.commits != null &&
            entry.commits.some(oid => typeof oid !== 'string' || !GIT_OBJECT_ID.test(oid))),
      )
    ) {
      return {
        type: 'invalid',
        message:
          'Every devstack layer needs a positive PR number and the commit representation required by its metadata version.',
      };
    }

    const currentStackEntry = stack.findIndex(entry => entry.number === metadata.current);
    if (
      currentStackEntry === -1 ||
      stack.some((entry, index) => index !== currentStackEntry && entry.number === metadata.current)
    ) {
      return {
        type: 'invalid',
        message: 'The current PR must occur exactly once in the devstack layer list.',
      };
    }

    return {
      type: 'valid',
      metadata: {
        version: metadata.version,
        stack: stack as StackLayer[],
        currentStackEntry,
      },
    };
  } catch {
    return {type: 'invalid', message: 'The devstack metadata comment does not contain valid JSON.'};
  }
}
