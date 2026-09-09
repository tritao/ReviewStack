/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PullRequestStack from './PullRequestStack';
import PullRequestStateLabel from './PullRequestStateLabel';
import PullRequestVersions from './PullRequestVersions';
import TrustedRenderedMarkdown from './TrustedRenderedMarkdown';
import {gitHubPullRequestAtom, gitHubPullRequestComparableVersionsAtom} from './jotai';
import {useReviewProgress} from './reviewProgress';
import {Box, Checkbox, Link, Text} from '@primer/react';
import {useAtomValue} from 'jotai';
import {Suspense} from 'react';

export default function PullRequestHeader(): React.ReactElement | null {
  const pullRequest = useAtomValue(gitHubPullRequestAtom);
  const comparableVersions = useAtomValue(gitHubPullRequestComparableVersionsAtom);
  const reviewID = comparableVersions?.afterCommitID ?? String(pullRequest?.number ?? 'unknown');
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
        {/*
          Our goal here is to minimize re-rendering when the user selects a
          different value from <PullRequestStack>, so we apply <Suspense> in a
          very narrow context.

          Ideally, we would update <PullRequestVersions> so it never needs a
          <Suspend>, leveraging useRecoilValueLoadable() as we did in
          <PullRequestStack> because Recoil wakes all suspended components
          whenever any async selector is resolved, so every use of <Suspense>
          runs the risk of a hard-to-debug performance issue.
          */}
        <Suspense fallback={null}>
          <PullRequestVersions />
        </Suspense>
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
      </Box>
    </Box>
  );
}
import './PullRequestHeader.css';
