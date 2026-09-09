/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Commit, GitObjectID, Version} from './github/types';

import StackMetadataError from './stackErrors';

/**
 * Return the recorded base for a PR version. Stack-aware version construction
 * may deliberately choose a base that differs from the pull request's GitHub
 * base branch, as happens for cumulative cross-fork stacks.
 */
export function baseParentForVersion(
  versions: Version[],
  headCommit: GitObjectID,
): GitObjectID | null | undefined {
  return versions.find(version => version.headCommit === headCommit)?.baseParent;
}

/** Resolve authoritative layer metadata without relying on the PR timeline. */
export function exactCommitsForLayer(
  commitIDs: GitObjectID[],
  commitsByID: ReadonlyMap<GitObjectID, Commit>,
): Commit[] {
  return commitIDs.map(commitID => {
    const commit = commitsByID.get(commitID);
    if (commit == null) {
      throw new StackMetadataError(
        `Could not load devstack layer commit ${commitID}. ` +
          'The metadata may be stale, or the commit may not be accessible to the current GitHub token.',
      );
    }
    return commit;
  });
}
