/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Blob} from './github/types';

import {countBlobChanges, countLineChanges} from './diffStats';

test('counts additions and deletions from the rendered texts', () => {
  expect(countLineChanges('one\ntwo\nthree\n', 'one\nchanged\nthree\nfour\n')).toEqual({
    additions: 2,
    deletions: 1,
    binaryFiles: 0,
    unavailableFiles: 0,
  });
});

test('counts a newly added file', () => {
  expect(countLineChanges('', 'one\ntwo\n')).toEqual({
    additions: 2,
    deletions: 0,
    binaryFiles: 0,
    unavailableFiles: 0,
  });
});

const blob = (text: string | null, isBinary = false): Blob =>
  ({text, isBinary}) as Blob;

test('reports binary files separately from textual line counts', () => {
  expect(countBlobChanges(null, blob('binary', true), false, true)).toEqual({
    additions: 0,
    deletions: 0,
    binaryFiles: 1,
    unavailableFiles: 0,
  });
});

test('reports unavailable blobs separately from binary files', () => {
  expect(countBlobChanges(blob('old'), null, true, true)).toEqual({
    additions: 0,
    deletions: 0,
    binaryFiles: 0,
    unavailableFiles: 1,
  });
});
