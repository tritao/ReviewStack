/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function isLongCommitMessage(message: string): boolean {
  return message.length > 240 || message.split('\n').length > 3;
}
