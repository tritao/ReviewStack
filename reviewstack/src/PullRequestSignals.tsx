/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {CheckStatusState} from './generated/graphql';

import StyledOcticon from './StyledOcticon';
import {CheckConclusionState} from './generated/graphql';
import {gitHubPullRequestCheckRunsAtom} from './jotai';
import {
  AlertIcon,
  BlockedIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LinkExternalIcon,
  QuestionIcon,
  SkipIcon,
  StopIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import {Box, Details, Text, useDetails} from '@primer/react';
import {useAtomValue} from 'jotai';
import {useMemo} from 'react';

export default function PullRequestSignals(): React.ReactElement {
  const checkRuns = useAtomValue(gitHubPullRequestCheckRunsAtom);
  const successful = useMemo(
    () => checkRuns.filter(({conclusion}) => conclusion === CheckConclusionState.Success).length,
    [checkRuns],
  );
  const sorted = useMemo(
    () =>
      [...checkRuns].sort(
        (a, b) =>
          conclusionRelativeOrder(a.conclusion ?? null) -
          conclusionRelativeOrder(b.conclusion ?? null),
      ),
    [checkRuns],
  );
  const {getDetailsProps, open} = useDetails({defaultOpen: false});

  return (
    <Box borderWidth={1} borderStyle="solid" borderColor="border.muted" borderRadius={4}>
      {/* https://github.com/primer/react/issues/2146 */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Details {...(getDetailsProps() as any)}>
        <Box
          as="summary"
          borderBottomWidth={open ? 1 : 0}
          borderBottomStyle="solid"
          borderBottomColor="border.muted"
          padding={2}
          sx={{cursor: 'pointer'}}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Text display="block" fontWeight="bold">
                Checks
              </Text>
              <Text display="block" fontSize={1}>
                {checkRuns.length === 0
                  ? 'No checks reported'
                  : `${successful} out of ${checks(checkRuns.length)} successful`}
              </Text>
            </Box>
            {open ? <ChevronUpIcon size={24} /> : <ChevronDownIcon size={24} />}
          </Box>
        </Box>
        <Box maxHeight="40vh" overflowY="auto">
          {sorted.map(({conclusion, name, workflowName, status, url}, index) => (
            <Box
              as="a"
              key={index}
              href={url}
              target="_blank"
              aria-label={`View ${workflowName ? `${workflowName} / ` : ''}${name} on GitHub`}
              display="grid"
              gridTemplateColumns="20px minmax(0, 1fr) auto"
              gridGap={2}
              alignItems="center"
              fontSize={1}
              paddingX={2}
              paddingY={1}
              borderTopWidth={index === 0 ? 0 : 1}
              borderTopStyle="solid"
              borderTopColor="border.muted"
              color="fg.default"
              sx={{
                borderCollapse: 'collapse',
                textDecoration: 'none',
                ':hover': {bg: 'canvas.subtle'},
              }}>
              <ConclusionIcon conclusion={conclusion ?? null} />
              <Box minWidth={0}>
                <Text display="block" fontWeight="bold" sx={{overflowWrap: 'anywhere'}}>
                  {workflowName ? `${workflowName} / ${name}` : name}
                </Text>
                <Text display="block" color="fg.muted">
                  {statusDisplay(status)}
                </Text>
              </Box>
              <Text color="accent.fg" sx={{whiteSpace: 'nowrap'}}>
                GitHub <LinkExternalIcon />
              </Text>
            </Box>
          ))}
        </Box>
      </Details>
    </Box>
  );
}

function ConclusionIcon({
  conclusion,
}: {
  conclusion: CheckConclusionState | null;
}): React.ReactElement {
  if (conclusion == null) {
    return <QuestionIcon />;
  }

  switch (conclusion) {
    case CheckConclusionState.Failure:
      return <StyledOcticon icon={XCircleIcon} color="danger.fg" />;
    case CheckConclusionState.ActionRequired:
      return <StyledOcticon icon={AlertIcon} color="attention.fg" />;
    case CheckConclusionState.StartupFailure:
    case CheckConclusionState.TimedOut:
      return <StyledOcticon icon={StopIcon} color="attention.fg" />;
    case CheckConclusionState.Neutral:
    case CheckConclusionState.Skipped:
    case CheckConclusionState.Stale:
      return <StyledOcticon icon={SkipIcon} color="fg.subtle" />;
    case CheckConclusionState.Cancelled:
      return <StyledOcticon icon={BlockedIcon} color="fg.subtle" />;
    case CheckConclusionState.Success:
      return <StyledOcticon icon={CheckCircleIcon} color="success.fg" />;
  }
}

function conclusionRelativeOrder(conclusion: CheckConclusionState | null): number {
  if (conclusion == null) {
    return Infinity;
  }

  switch (conclusion) {
    case CheckConclusionState.Failure:
      return 0;
    case CheckConclusionState.ActionRequired:
      return 1;
    case CheckConclusionState.StartupFailure:
    case CheckConclusionState.TimedOut:
      return 2;
    case CheckConclusionState.Neutral:
    case CheckConclusionState.Skipped:
    case CheckConclusionState.Stale:
      return 3;
    case CheckConclusionState.Cancelled:
      return 4;
    case CheckConclusionState.Success:
      return 5;
  }
}

function statusDisplay(status: CheckStatusState): string {
  return status
    .split('_')
    .map(part => part[0] + part.slice(1).toLowerCase())
    .join(' ');
}

function checks(num: number): string {
  return num === 1 ? '1 check' : `${num} checks`;
}
