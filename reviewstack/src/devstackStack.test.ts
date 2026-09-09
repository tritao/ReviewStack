/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {parseDevstackStackBody, parseDevstackStackBodyResult} from './devstackStack';

describe('parseDevstackStackBody', () => {
  test('extracts version 1 commit counts', () => {
    const body = `Visible description.

<!-- DEVSTACK:REVIEWSTACK {"version":1,"current":32515,"stack":[{"number":32515,"commits":1},{"number":32514,"commits":2}]} -->`;
    expect(parseDevstackStackBody(body)).toEqual({
      version: 1,
      stack: [
        {number: 32515, numCommits: 1},
        {number: 32514, numCommits: 2},
      ],
      currentStackEntry: 0,
    });
  });

  test('extracts version 2 exact commits', () => {
    const oid = '21b7c73632ac8622903d9c57b47c91c337923e54';
    expect(
      parseDevstackStackBody(
        `<!-- DEVSTACK:REVIEWSTACK {"version":2,"current":32515,"stack":[{"number":32515,"commits":["${oid}"]}]} -->`,
      ),
    ).toEqual({
      version: 2,
      stack: [{number: 32515, numCommits: 1, commits: [oid]}],
      currentStackEntry: 0,
    });
  });

  test.each([
    '<!-- DEVSTACK:REVIEWSTACK {"version":3,"current":1,"stack":[]} -->',
    '<!-- DEVSTACK:REVIEWSTACK {"version":1,"current":2,"stack":[{"number":1,"commits":0}]} -->',
    '<!-- DEVSTACK:REVIEWSTACK {"version":2,"current":1,"stack":[{"number":1,"commits":["short"]}]} -->',
    '<!-- DEVSTACK:REVIEWSTACK {"version":1,"current":1,"stack":[{"number":1,"commits":1},{"number":1,"commits":1}]} -->',
    '<!-- DEVSTACK:REVIEWSTACK {"version":2,"current":1,"stack":[{"number":1,"commits":1}]} -->',
    '<!-- DEVSTACK:REVIEWSTACK {"version":1,"current":1,"stack":[{"number":1,"commits":["21b7c73632ac8622903d9c57b47c91c337923e54"]}]} -->',
  ])('rejects invalid metadata: %s', body => {
    expect(parseDevstackStackBody(body)).toBe(null);
  });

  test('distinguishes absent metadata from malformed metadata', () => {
    expect(parseDevstackStackBodyResult('Ordinary PR body.')).toEqual({type: 'absent'});
    expect(
      parseDevstackStackBodyResult('<!-- DEVSTACK:REVIEWSTACK not-json -->'),
    ).toMatchObject({type: 'invalid', message: expect.stringContaining('malformed')});
  });

  test('explains stale current-layer metadata', () => {
    expect(
      parseDevstackStackBodyResult(
        '<!-- DEVSTACK:REVIEWSTACK {"version":1,"current":2,"stack":[{"number":1,"commits":1}]} -->',
      ),
    ).toMatchObject({
      type: 'invalid',
      message: expect.stringContaining('exactly once'),
    });
  });
});
