/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {CheckConclusionState, CheckStatusState} from './generated/graphql';
import {gitHubPullRequestCheckRunsAtom} from './jotai';
import {openReviewDrawerAtom} from './pullRequestDrawerState';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  QuestionIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import {Button} from '@primer/react';
import {useAtomValue, useSetAtom} from 'jotai';
import {loadable} from 'jotai/utils';

const loadableCheckRunsAtom = loadable(gitHubPullRequestCheckRunsAtom);

export default function PullRequestChecksSummary(): React.ReactElement {
  const checkRuns = useAtomValue(loadableCheckRunsAtom);
  const openReviewDrawer = useSetAtom(openReviewDrawerAtom);
  const checks = checkRuns.state === 'hasData' ? checkRuns.data : [];
  const successful = checks.filter(
    check => check.conclusion === CheckConclusionState.Success,
  ).length;
  const running = checks.filter(check => check.status !== CheckStatusState.Completed).length;
  const failed = checks.filter(
    check =>
      check.status === CheckStatusState.Completed &&
      [
        CheckConclusionState.Failure,
        CheckConclusionState.ActionRequired,
        CheckConclusionState.StartupFailure,
        CheckConclusionState.TimedOut,
      ].includes(check.conclusion ?? CheckConclusionState.Success),
  ).length;
  const attention = checks.length - successful - running - failed;

  const label =
    checkRuns.state !== 'hasData'
      ? 'Checks'
      : checks.length === 0
      ? 'No checks'
      : failed > 0
      ? `${failed} failed`
      : running > 0
      ? `${running} running`
      : attention > 0
      ? `${attention} need attention`
      : `${successful}/${checks.length} checks`;
  const icon =
    checkRuns.state !== 'hasData'
      ? ClockIcon
      : checks.length === 0
      ? QuestionIcon
      : failed > 0
      ? XCircleIcon
      : running > 0
      ? ClockIcon
      : attention > 0
      ? AlertIcon
      : CheckCircleIcon;

  return (
    <Button
      size="small"
      leadingVisual={icon}
      onClick={openReviewDrawer}
      aria-label={`${label}. Open check details`}>
      {label}
    </Button>
  );
}
