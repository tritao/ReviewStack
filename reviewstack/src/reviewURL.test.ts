/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Version} from './github/types';

import {parseReviewURL, resolveReviewSelection, updateReviewURL} from './reviewURL';

const oid = '21b7c73632ac8622903d9c57b47c91c337923e54';
const version = '2b91063fe19f7f74f91938fa36cf8272ced77f25';

describe('review URL state', () => {
  test('parses valid commit review state', () => {
    expect(parseReviewURL(`?mode=commit&commit=${oid}&version=${version}`)).toEqual({
      mode: 'commit',
      commitID: oid,
      versionID: version,
    });
  });

  test('rejects malformed object IDs', () => {
    expect(parseReviewURL('?mode=commit&commit=short&version=nope')).toEqual({
      mode: 'commit',
      commitID: null,
      versionID: null,
    });
  });

  test('updates review parameters while preserving unrelated parameters', () => {
    window.history.replaceState(null, '', '/FreeCAD/FreeCAD/pull/29700?tab=files');
    updateReviewURL({mode: 'commit', commitID: oid, versionID: version});
    expect(window.location.search).toBe(
      `?tab=files&mode=commit&commit=${oid}&version=${version}`,
    );
    updateReviewURL({mode: 'layer', commitID: null});
    expect(window.location.search).toBe(`?tab=files&version=${version}`);
  });

  test('resolves a version by identity rather than array length or index', () => {
    const makeVersion = (headCommit: string, commits: string[]): Version => ({
      headCommit,
      headCommittedDate: null,
      baseParent: null,
      baseParentCommittedDate: null,
      commits: commits.map(commit => ({
        author: null,
        commit,
        committedDate: null,
        parents: [],
        title: commit,
        version: null,
      })),
    });
    const otherVersion = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const versions = [makeVersion(otherVersion, []), makeVersion(version, [oid])];
    expect(
      resolveReviewSelection(versions, {mode: 'commit', commitID: oid, versionID: version}),
    ).toMatchObject({versionIndex: 1, commitID: oid});
    expect(
      resolveReviewSelection(versions, {mode: 'commit', commitID: oid, versionID: otherVersion}),
    ).toMatchObject({versionIndex: 0, commitID: null});
  });

  test('defaults stale version state to the latest version', () => {
    const versions = [
      {
        headCommit: version,
        headCommittedDate: null,
        baseParent: null,
        baseParentCommittedDate: null,
        commits: [],
      },
    ];
    expect(
      resolveReviewSelection(versions, {
        mode: 'layer',
        commitID: null,
        versionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toMatchObject({versionIndex: 0, commitID: null});
  });
});
