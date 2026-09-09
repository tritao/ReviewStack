/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Commit, Version} from './github/types';

import {baseParentForVersion, exactCommitsForLayer} from './pullRequestVersions';

const version = (headCommit: string, baseParent: string | null): Version => ({
  headCommit,
  headCommittedDate: null,
  baseParent,
  baseParentCommittedDate: null,
  commits: [],
});

test('uses the stack-aware base recorded for a version', () => {
  const versions = [version('layer-two', 'layer-one'), version('layer-three', 'layer-two')];
  expect(baseParentForVersion(versions, 'layer-three')).toBe('layer-two');
});

test('distinguishes an unknown version from a version without a base', () => {
  const versions = [version('layer-one', null)];
  expect(baseParentForVersion(versions, 'layer-one')).toBeNull();
  expect(baseParentForVersion(versions, 'unknown')).toBeUndefined();
});

test('uses exact layer commits even when they are absent from the PR timeline', () => {
  const commitIDs = Array.from({length: 6}, (_, index) => String(index + 1).padStart(40, '0'));
  const commits = new Map(
    commitIDs.map(commitID => [commitID, {oid: commitID}] as unknown as [string, Commit]),
  );
  expect(exactCommitsForLayer(commitIDs, commits).map(commit => commit.oid)).toEqual(commitIDs);
});

test('reports an inaccessible exact layer commit', () => {
  const missing = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  expect(() => exactCommitsForLayer([missing], new Map())).toThrow(missing);
});
