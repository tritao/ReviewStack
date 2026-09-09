/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Blob} from './github/types';

import hasBinaryContent from './hasBinaryContent';
import {diffLines} from 'diff';

export type DiffStats = {
  additions: number;
  deletions: number;
  binaryFiles: number;
  unavailableFiles: number;
};

/** Count changed lines using the same text inputs used to render the diff. */
export function countLineChanges(before: string, after: string): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const change of diffLines(before, after)) {
    if (change.added) {
      additions += change.count ?? 0;
    } else if (change.removed) {
      deletions += change.count ?? 0;
    }
  }
  return {additions, deletions, binaryFiles: 0, unavailableFiles: 0};
}

export function countBlobChanges(
  before: Blob | null,
  after: Blob | null,
  expectedBefore: boolean,
  expectedAfter: boolean,
): DiffStats {
  if (
    (expectedBefore && (before == null || before.isTruncated)) ||
    (expectedAfter && (after == null || after.isTruncated))
  ) {
    return {additions: 0, deletions: 0, binaryFiles: 0, unavailableFiles: 1};
  }
  if (
    before?.isBinary ||
    after?.isBinary ||
    (expectedBefore && before?.text == null) ||
    (expectedAfter && after?.text == null) ||
    hasBinaryContent(before?.text) ||
    hasBinaryContent(after?.text)
  ) {
    return {additions: 0, deletions: 0, binaryFiles: 1, unavailableFiles: 0};
  }
  return countLineChanges(before?.text ?? '', after?.text ?? '');
}
