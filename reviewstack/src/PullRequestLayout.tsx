/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {AllDrawersState} from 'shared/Drawers';

import CenteredSpinner from './CenteredSpinner';
import {useCommand} from './KeyboardShortcuts';
import PullRequest from './PullRequest';
import PullRequestHeader from './PullRequestHeader';
import PullRequestTimeline from './PullRequestTimeline';
import PullRequestTimelineCommentInput from './PullRequestTimelineCommentInput';
import {gitHubOrgAndRepoAtom, gitHubPullRequestIDAtom} from './jotai';
import {CommentDiscussionIcon} from '@primer/octicons-react';
import {Box, Text} from '@primer/react';
import {atom, useSetAtom} from 'jotai';
import React, {Component, Suspense, useEffect, useState} from 'react';
import {Drawers} from 'shared/Drawers';

import './PullRequestLayout.css';

const COMMENT_INPUT_HEIGHT = 125;

const drawerStateAtom = atom<AllDrawersState>({
  right: {size: 500, collapsed: false},
  left: {size: 200, collapsed: true},
  top: {size: 200, collapsed: true},
  bottom: {size: 200, collapsed: true},
});

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

  const setDrawerState = useSetAtom(drawerStateAtom);
  useCommand('ToggleSidebar', () => {
    setDrawerState(state => ({
      ...state,
      right: {...state.right, collapsed: !state.right.collapsed},
    }));
  });

  return (
    <Box className="reviewstack-pr-layout">
      <PullRequestHeader />
      <Suspense fallback={<CenteredSpinner message="Loading pull request..." />}>
        {isNarrow ? (
          <Drawers
            drawerState={drawerStateAtom}
            errorBoundary={ErrorBoundary}
            bottomLabel={<ReviewDrawerLabel />}
            bottom={<TimelineDrawer />}>
            <Box display="flex" flexDirection="row">
              <Box className="reviewstack-pr-workspace" overflow="auto">
                <PullRequest />
              </Box>
            </Box>
          </Drawers>
        ) : (
          <Drawers
            drawerState={drawerStateAtom}
            errorBoundary={ErrorBoundary}
            rightLabel={<ReviewDrawerLabel />}
            right={<TimelineDrawer />}>
            <Box display="flex" flexDirection="row">
              <Box className="reviewstack-pr-workspace" overflow="auto">
                <PullRequest />
              </Box>
            </Box>
          </Drawers>
        )}
      </Suspense>
    </Box>
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
      <Box height={`calc(100% - ${COMMENT_INPUT_HEIGHT}px)`} overflow="auto">
        <PullRequestTimeline />
      </Box>
      <Box display="flex" height={COMMENT_INPUT_HEIGHT}>
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
