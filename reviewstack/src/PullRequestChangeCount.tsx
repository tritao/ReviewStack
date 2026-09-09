/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {gitHubPullRequestVersionDiffStatsAtom} from './jotai';
import {CounterLabel, Text} from '@primer/react';
import {useAtomValue} from 'jotai';

export default function PullRequestChangeCount(): React.ReactElement | null {
  const stats = useAtomValue(gitHubPullRequestVersionDiffStatsAtom);

  if (stats == null) {
    return null;
  }

  const {
    additions,
    binaryFiles,
    deletions,
    modeChanges,
    renamedFiles,
    submoduleChanges,
    unavailableFiles,
  } = stats;

  return (
    <>
      <CounterLabel sx={{backgroundColor: 'success.muted'}}>+{additions}</CounterLabel>
      <CounterLabel scheme="primary" sx={{backgroundColor: 'danger.muted', color: 'black'}}>
        -{deletions}
      </CounterLabel>
      {binaryFiles > 0 && <Text fontSize={0}>{binaryFiles} binary</Text>}
      {modeChanges > 0 && <Text fontSize={0}>{modeChanges} mode-only</Text>}
      {submoduleChanges > 0 && <Text fontSize={0}>{submoduleChanges} submodule</Text>}
      {renamedFiles > 0 && <Text fontSize={0}>{renamedFiles} renamed</Text>}
      {unavailableFiles > 0 && <Text fontSize={0}>{unavailableFiles} unavailable</Text>}
    </>
  );
}
