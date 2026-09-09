/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Diff} from './github/diffTypes';
import type {TreeEntry} from './github/types';

import {findExactRenames} from './exactRenames';

const entry = (name: string, oid: string): TreeEntry =>
  ({name, oid, type: 'blob', mode: 33188, path: name}) as TreeEntry;

test('pairs a unique exact-blob rename', () => {
  const diff: Diff = [
    {type: 'remove', basePath: 'old', entry: entry('name.cpp', 'same')},
    {type: 'add', basePath: 'new', entry: entry('renamed.cpp', 'same')},
  ];
  expect(findExactRenames(diff)).toMatchObject([
    {removeIndex: 0, addIndex: 1, beforePath: 'old/name.cpp', afterPath: 'new/renamed.cpp'},
  ]);
});

test('does not guess when duplicate contents make a rename ambiguous', () => {
  const diff: Diff = [
    {type: 'remove', basePath: '', entry: entry('one', 'same')},
    {type: 'add', basePath: '', entry: entry('two', 'same')},
    {type: 'add', basePath: '', entry: entry('three', 'same')},
  ];
  expect(findExactRenames(diff)).toEqual([]);
});
