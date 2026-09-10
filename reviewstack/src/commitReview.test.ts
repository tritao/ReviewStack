/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {VersionCommit} from './github/types';

import {isAutomatedCommit, isReviewableCommit} from './commitReview';

function makeCommit(
  overrides: Partial<Pick<VersionCommit, 'author' | 'title' | 'parents'>> = {},
): VersionCommit {
  return {
    author: null,
    commit: '21b7c73632ac8622903d9c57b47c91c337923e54',
    committedDate: '2024-01-01T00:00:00Z',
    title: 'A normal commit',
    messageBody: null,
    parents: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    version: null,
    ...overrides,
  };
}

describe('automated commit detection', () => {
  test('recognizes pre-commit.ci auto-fix titles', () => {
    expect(isAutomatedCommit(makeCommit({title: '[pre-commit.ci] auto fixes'}))).toBe(true);
    expect(isAutomatedCommit(makeCommit({title: '[PRE-COMMIT.CI] autofixes'}))).toBe(true);
  });

  test('recognizes the pre-commit.ci bot author', () => {
    expect(isAutomatedCommit(makeCommit({author: 'pre-commit.ci[bot]'}))).toBe(true);
  });

  test('does not classify ordinary commits as automated', () => {
    expect(isAutomatedCommit(makeCommit())).toBe(false);
    expect(isAutomatedCommit(makeCommit({title: 'Fix pre-commit.ci documentation'}))).toBe(false);
  });

  test('excludes automated and merge commits from the review flow', () => {
    expect(isReviewableCommit(makeCommit())).toBe(true);
    expect(isReviewableCommit(makeCommit({title: '[pre-commit.ci] auto fixes'}))).toBe(false);
    expect(isReviewableCommit(makeCommit({parents: ['a', 'b']}))).toBe(false);
  });
});
