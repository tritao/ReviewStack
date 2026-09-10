/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {isLongCommitMessage} from './selectedCommitMessage';

test('collapses messages longer than three lines', () => {
  expect(isLongCommitMessage('one\ntwo\nthree')).toBe(false);
  expect(isLongCommitMessage('one\ntwo\nthree\nfour')).toBe(true);
});

test('collapses long paragraphs', () => {
  expect(isLongCommitMessage('a'.repeat(240))).toBe(false);
  expect(isLongCommitMessage('a'.repeat(241))).toBe(true);
});
