/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import UnauthorizedError from './github/UnauthorizedError';
import {
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestVersionDiffAtom,
  gitHubPullRequestVersionDiffStatsAtom,
} from './jotai';
import {recordCommitStats} from './reviewProgress';
import {CounterLabel, Text} from '@primer/react';
import {useAtomValue} from 'jotai';
import {loadable} from 'jotai/utils';
import {useEffect, useMemo} from 'react';

export default function PullRequestChangeCount(): React.ReactElement | null {
  const diff = useAtomValue(gitHubPullRequestVersionDiffAtom);
  const loadableStatsAtom = useMemo(() => loadable(gitHubPullRequestVersionDiffStatsAtom), []);
  const statsLoadable = useAtomValue(loadableStatsAtom);
  const reviewTarget = useAtomValue(gitHubPullRequestReviewTargetAtom);
  const loadedStats = statsLoadable.state === 'hasData' ? statsLoadable.data : null;
  useEffect(() => {
    if (reviewTarget.type === 'commit' && loadedStats != null) {
      recordCommitStats(reviewTarget.commitID, {
        additions: loadedStats.additions,
        deletions: loadedStats.deletions,
        files: diff?.diff.length ?? 0,
      });
    }
  }, [diff?.diff.length, loadedStats, reviewTarget]);

  if (statsLoadable.state === 'loading') {
    return (
      <Text color="fg.muted" fontSize={0} aria-live="polite">
        Calculating totals for {diff?.diff.length ?? 0} files…
      </Text>
    );
  }
  if (statsLoadable.state === 'hasError') {
    if (statsLoadable.error instanceof UnauthorizedError) {
      throw statsLoadable.error;
    }
    const message =
      statsLoadable.error instanceof Error
        ? statsLoadable.error.message
        : String(statsLoadable.error);
    return (
      <Text color="danger.fg" fontSize={0} title={message}>
        Change totals unavailable
      </Text>
    );
  }

  const stats = statsLoadable.data;
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
