/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {AllDrawersState} from 'shared/Drawers';

import {atom} from 'jotai';

export const pullRequestDrawerStateAtom = atom<AllDrawersState>({
  right: {size: 500, collapsed: false},
  left: {size: 300, collapsed: true},
  top: {size: 200, collapsed: true},
  bottom: {size: 200, collapsed: true},
});

export const openReviewDrawerAtom = atom(null, (_get, set) => {
  const side = window.matchMedia('(max-width: 600px)').matches ? 'bottom' : 'right';
  set(pullRequestDrawerStateAtom, state => ({
    ...state,
    [side]: {...state[side], collapsed: false},
  }));
});
