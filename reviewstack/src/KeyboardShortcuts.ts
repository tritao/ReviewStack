/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {makeCommandDispatcher, KeyCode, Modifier} from 'shared/KeyboardShortcuts';

export const [ShortcutCommandContext, useCommand, dispatchCommand] = makeCommandDispatcher({
  ToggleSidebar: [Modifier.CMD, KeyCode.Period],
  NextInStack: [Modifier.SHIFT, KeyCode.N],
  PreviousInStack: [Modifier.SHIFT, KeyCode.P],
  NextFile: [Modifier.NONE, KeyCode.J],
  PreviousFile: [Modifier.NONE, KeyCode.K],
  NextCommit: [Modifier.ALT, KeyCode.DownArrow],
  PreviousCommit: [Modifier.ALT, KeyCode.UpArrow],
  Approve: [Modifier.ALT, KeyCode.A],
  Comment: [Modifier.ALT, KeyCode.C],
  RequestChanges: [Modifier.ALT, KeyCode.R],
});
