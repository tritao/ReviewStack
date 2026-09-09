/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {GitObjectID, Version} from './github/types';

export type ReviewURLState = {
  mode: 'layer' | 'commit';
  commitID: GitObjectID | null;
  versionID: GitObjectID | null;
};

export type ResolvedReviewSelection = {
  versionIndex: number;
  version: Version;
  commitID: GitObjectID | null;
};

const GIT_OBJECT_ID = /^[0-9a-f]{40}$/;

export function parseReviewURL(search: string): ReviewURLState {
  const params = new URLSearchParams(search);
  const commitID = params.get('commit');
  const versionID = params.get('version');
  return {
    mode: params.get('mode') === 'commit' ? 'commit' : 'layer',
    commitID: commitID != null && GIT_OBJECT_ID.test(commitID) ? commitID : null,
    versionID: versionID != null && GIT_OBJECT_ID.test(versionID) ? versionID : null,
  };
}

export function resolveReviewSelection(
  versions: Version[],
  state: ReviewURLState,
): ResolvedReviewSelection | null {
  if (versions.length === 0) {
    return null;
  }
  const requestedIndex = versions.findIndex(version => version.headCommit === state.versionID);
  const versionIndex = requestedIndex === -1 ? versions.length - 1 : requestedIndex;
  const version = versions[versionIndex];
  const commit = version.commits.find(candidate => candidate.commit === state.commitID);
  return {
    versionIndex,
    version,
    commitID: state.mode === 'commit' ? commit?.commit ?? null : null,
  };
}

export function updateReviewURL(
  update: Partial<ReviewURLState>,
  navigation: 'push' | 'replace' = 'push',
): void {
  const url = new URL(window.location.href);
  const current = parseReviewURL(url.search);
  const next = {...current, ...update};

  if (next.mode === 'commit' && next.commitID != null) {
    url.searchParams.set('mode', 'commit');
    url.searchParams.set('commit', next.commitID);
  } else {
    url.searchParams.delete('mode');
    url.searchParams.delete('commit');
  }
  if (next.versionID == null) {
    url.searchParams.delete('version');
  } else {
    url.searchParams.set('version', next.versionID);
  }

  window.history[navigation === 'push' ? 'pushState' : 'replaceState'](null, '', url);
}
