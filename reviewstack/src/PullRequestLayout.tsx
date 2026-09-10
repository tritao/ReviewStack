/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import CenteredSpinner from './CenteredSpinner';
import CommitReviewRail from './CommitReviewRail';
import {useCommand} from './KeyboardShortcuts';
import PullRequest from './PullRequest';
import PullRequestHeader from './PullRequestHeader';
import PullRequestSignals from './PullRequestSignals';
import PullRequestTimeline from './PullRequestTimeline';
import PullRequestTimelineCommentInput from './PullRequestTimelineCommentInput';
import {
  gitHubOrgAndRepoAtom,
  gitHubPullRequestIDAtom,
  gitHubPullRequestReviewTargetAtom,
} from './jotai';
import {pullRequestDrawerStateAtom} from './pullRequestDrawerState';
import {CommentDiscussionIcon, GitCommitIcon} from '@primer/octicons-react';
import {Box, Text} from '@primer/react';
import {useAtomValue, useSetAtom} from 'jotai';
import React, {Component, Suspense, useEffect, useLayoutEffect, useState} from 'react';
import {Drawers} from 'shared/Drawers';

import './PullRequestLayout.css';

export default function PullRequestLayout({
  org,
  repo,
  number,
}: {
  org: string;
  repo: string;
  number: number;
}): React.ReactElement {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const reviewTarget = useAtomValue(gitHubPullRequestReviewTargetAtom);
  const setOrgAndRepo = useSetAtom(gitHubOrgAndRepoAtom);
  const setPullRequestID = useSetAtom(gitHubPullRequestIDAtom);

  useEffect(() => {
    setOrgAndRepo({org, repo});
  }, [org, repo, setOrgAndRepo]);

  useEffect(() => {
    setPullRequestID(number);
  }, [number, setPullRequestID]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setIsNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const setDrawerState = useSetAtom(pullRequestDrawerStateAtom);
  useLayoutEffect(() => {
    setDrawerState(state => ({
      ...state,
      left: {...state.left, collapsed: reviewTarget.type !== 'commit'},
      right: reviewTarget.type === 'commit' ? {...state.right, collapsed: true} : state.right,
    }));
  }, [reviewTarget.type, setDrawerState]);
  useCommand('ToggleSidebar', () => {
    setDrawerState(state => ({
      ...state,
      right: {...state.right, collapsed: !state.right.collapsed},
    }));
  });

  const navigateFile = (direction: 1 | -1) => {
    const files = Array.from(document.querySelectorAll<HTMLElement>('[data-diff-file]'));
    if (files.length === 0) {
      return;
    }
    const current = files.findIndex(file => file.getBoundingClientRect().bottom > 180);
    const target = files[Math.max(0, Math.min(files.length - 1, current + direction))];
    target?.scrollIntoView({behavior: 'smooth', block: 'start'});
    target?.focus({preventScroll: true});
  };
  useCommand('NextFile', () => navigateFile(1));
  useCommand('PreviousFile', () => navigateFile(-1));

  return (
    <Box className="reviewstack-pr-layout">
      <PullRequestHeader />
      <Suspense fallback={<CenteredSpinner message="Loading pull request..." />}>
        {isNarrow ? (
          <Drawers
            drawerState={pullRequestDrawerStateAtom}
            errorBoundary={ErrorBoundary}
            bottomLabel={<ReviewDrawerLabel />}
            bottom={<TimelineDrawer />}>
            <Box display="flex" flexDirection="row">
              <Box className="reviewstack-pr-workspace" overflow="auto">
                <PullRequest />
              </Box>
            </Box>
          </Drawers>
        ) : reviewTarget.type === 'commit' ? (
          <Drawers
            drawerState={pullRequestDrawerStateAtom}
            errorBoundary={ErrorBoundary}
            leftLabel={<CommitRailLabel />}
            left={<CommitReviewRail />}
            rightLabel={<ReviewDrawerLabel />}
            right={<TimelineDrawer />}>
            <ReviewWorkspace />
          </Drawers>
        ) : (
          <Drawers
            drawerState={pullRequestDrawerStateAtom}
            errorBoundary={ErrorBoundary}
            rightLabel={<ReviewDrawerLabel />}
            right={<TimelineDrawer />}>
            <ReviewWorkspace />
          </Drawers>
        )}
      </Suspense>
    </Box>
  );
}

function ReviewWorkspace() {
  return (
    <Box display="flex" flexDirection="row">
      <Box className="reviewstack-pr-workspace" overflow="auto">
        <PullRequest />
      </Box>
    </Box>
  );
}

function CommitRailLabel() {
  return (
    <>
      <GitCommitIcon />
      <Text className="drawer-label-text">Commits</Text>
    </>
  );
}

function ReviewDrawerLabel() {
  return (
    <>
      <CommentDiscussionIcon />
      <Text className="drawer-label-text">Review</Text>
    </>
  );
}

function TimelineDrawer() {
  return (
    <Box className="reviewstack-pr-timeline" display="flex" flexDirection="column">
      <Box
        flex="0 0 auto"
        padding={2}
        borderBottomWidth={1}
        borderBottomStyle="solid"
        borderBottomColor="border.muted">
        <PullRequestSignals />
      </Box>
      <Box flex="1 1 auto" minHeight={0} overflow="auto">
        <PullRequestTimeline />
      </Box>
      <Box display="flex" flex="0 0 auto">
        <PullRequestTimelineCommentInput />
      </Box>
    </Box>
  );
}

type Props = {
  children: React.ReactNode;
};

type State = {error: Error | null};

class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  render() {
    return this.props.children;
  }
}
