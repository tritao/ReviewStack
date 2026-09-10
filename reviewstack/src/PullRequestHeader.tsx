/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PullRequestChecksSummary from './PullRequestChecksSummary';
import PullRequestStack from './PullRequestStack';
import PullRequestStateLabel from './PullRequestStateLabel';
import PullRequestVersions from './PullRequestVersions';
import TrustedRenderedMarkdown from './TrustedRenderedMarkdown';
import {
  gitHubPullRequestAtom,
  gitHubPullRequestComparableVersionsAtom,
  gitHubPullRequestReviewTargetAtom,
} from './jotai';
import {useReviewProgress} from './reviewProgress';
import {Box, Checkbox, Link, Text} from '@primer/react';
import {useAtomValue} from 'jotai';
import {Suspense} from 'react';

export default function PullRequestHeader(): React.ReactElement | null {
  const pullRequest = useAtomValue(gitHubPullRequestAtom);
  const comparableVersions = useAtomValue(gitHubPullRequestComparableVersionsAtom);
  const reviewTarget = useAtomValue(gitHubPullRequestReviewTargetAtom);
  const reviewID =
    reviewTarget.type === 'commit'
      ? reviewTarget.commitID
      : comparableVersions?.afterCommitID ?? String(pullRequest?.number ?? 'unknown');
  const [reviewed, toggleReviewed] = useReviewProgress('commit', reviewID);

  if (pullRequest == null) {
    return null;
  }

  const {number, reviewDecision, state, titleHTML, url} = pullRequest;

  return (
    <Box
      className="reviewstack-pr-header"
      height="var(--reviewstack-pr-header-height)"
      borderBottomWidth={1}
      borderBottomStyle="solid"
      borderBottomColor="border.default"
      display="flex"
      flexDirection="column"
      gridGap={2}
      padding={3}>
      <Box className="reviewstack-pr-title" fontWeight="bold">
        #{number} <TrustedRenderedMarkdown trustedHTML={titleHTML} inline={true} />{' '}
        <Link href={url} target="_blank">
          <Text fontWeight="normal">(view on GitHub)</Text>
        </Link>
      </Box>
      <Box className="reviewstack-pr-controls" gridGap={2}>
        <PullRequestStateLabel reviewDecision={reviewDecision ?? null} state={state} />
        <PullRequestStack />
        <PullRequestChecksSummary />
        {/*
          Keep the version selector's initial load isolated from the rest of
          the action bar. Commit navigation within <PullRequestVersions> uses
          loadable state for its diff, so these controls remain mounted while
          the newly selected commit is fetched.
          */}
        <Suspense fallback={null}>
          <PullRequestVersions />
        </Suspense>
        {reviewTarget.type === 'layer' && (
          <Box
            as="label"
            className="reviewstack-reviewed-label"
            display="flex"
            alignItems="center"
            gridGap={1}
            title="Mark the selected review revision as reviewed">
            <Checkbox
              checked={reviewed}
              onChange={toggleReviewed}
              aria-label="Mark selected revision as reviewed"
            />
            <Text className="reviewstack-reviewed-text">Reviewed</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
import './PullRequestHeader.css';
