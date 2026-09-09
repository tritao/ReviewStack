/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {AddChange, Diff, RemoveChange} from './github/diffTypes';

import {getPathForChange} from './utils';

export type ExactRename = {
  removeIndex: number;
  addIndex: number;
  beforePath: string;
  afterPath: string;
  before: RemoveChange;
  after: AddChange;
};

/**
 * Pair only unique remove/add entries with the same blob ID. Matching IDs
 * prove that contents are unchanged; requiring uniqueness avoids arbitrary
 * pairings when a repository contains duplicate files.
 */
export function findExactRenames(diff: Diff): ExactRename[] {
  const removals = new Map<string, Array<{index: number; change: RemoveChange}>>();
  const additions = new Map<string, Array<{index: number; change: AddChange}>>();
  diff.forEach((change, index) => {
    if (change.type === 'remove') {
      const entries = removals.get(change.entry.oid) ?? [];
      entries.push({index, change});
      removals.set(change.entry.oid, entries);
    } else if (change.type === 'add') {
      const entries = additions.get(change.entry.oid) ?? [];
      entries.push({index, change});
      additions.set(change.entry.oid, entries);
    }
  });

  const renames: ExactRename[] = [];
  removals.forEach((removed, oid) => {
    const added = additions.get(oid);
    if (removed.length === 1 && added?.length === 1) {
      renames.push({
        removeIndex: removed[0].index,
        addIndex: added[0].index,
        beforePath: getPathForChange(removed[0].change),
        afterPath: getPathForChange(added[0].change),
        before: removed[0].change,
        after: added[0].change,
      });
    }
  });
  return renames;
}
