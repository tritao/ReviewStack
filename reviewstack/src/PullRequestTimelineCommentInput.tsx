/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PullRequestCommentInput from './PullRequestCommentInput';
import PullRequestReviewSelector from './PullRequestReviewSelector';
import {PullRequestReviewEvent} from './generated/graphql';
import {
  gitHubClientAtom,
  gitHubPullRequestAtom,
  gitHubPullRequestPendingReviewIDAtom,
  gitHubPullRequestReviewSubmissionAtom,
  gitHubPullRequestSelectedVersionCommitsAtom,
} from './jotai';
import useRefreshPullRequest from './useRefreshPullRequest';
import {shortOid} from './utils';
import {Box, Text} from '@primer/react';
import {useAtom, useAtomValue} from 'jotai';
import {useCallback} from 'react';

export default function PullRequestTimelineCommentInput(): React.ReactElement {
  const pendingReviewID = useAtomValue(gitHubPullRequestPendingReviewIDAtom);
  const refreshPullRequest = useRefreshPullRequest();
  const pullRequest = useAtomValue(gitHubPullRequestAtom);
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const [submission, setSubmission] = useAtom(gitHubPullRequestReviewSubmissionAtom);
  const {commitID: contextCommitID, event} = submission;

  // Client is already loaded by the time we're adding a comment
  const client = useAtomValue(gitHubClientAtom);

  const addComment = useCallback(
    async (comment: string) => {
      if (client == null) {
        return Promise.reject('client not found');
      }

      if (pullRequest == null) {
        return Promise.reject('pull request not found');
      }

      if (pendingReviewID == null) {
        if (event === PullRequestReviewEvent.Comment) {
          await client.addComment(pullRequest.id, comment);
        } else {
          await client.addPullRequestReview({
            body: comment,
            pullRequestId: pullRequest.id,
            event,
          });
        }
      } else {
        await client.submitPullRequestReview({
          body: comment,
          pullRequestId: pullRequest.id,
          pullRequestReviewId: pendingReviewID,
          event,
        });
      }

      refreshPullRequest();
      setSubmission({event: PullRequestReviewEvent.Comment, commitID: null});
    },
    [client, event, pendingReviewID, pullRequest, refreshPullRequest, setSubmission],
  );

  const contextCommit = commits.find(commit => commit.commit === contextCommitID);
  return (
    <Box width="100%">
      {contextCommit != null && (
        <Box
          backgroundColor="canvas.subtle"
          borderTop="1px solid"
          borderColor="border.default"
          px={2}
          py={1}>
          <Text fontSize={0} color="fg.muted">
            Reviewing after {shortOid(contextCommit.commit)} · {contextCommit.title}
          </Text>
        </Box>
      )}
      <PullRequestCommentInput
        addComment={addComment}
        autoFocus={false}
        resetInputAfterAddingComment={true}
        allowEmptyMessage={pendingReviewID != null || event === PullRequestReviewEvent.Approve}
        label="Submit"
        draftKey={`reviewstack.review-draft.v1:${window.location.pathname}`}
        actionSelector={
          <PullRequestReviewSelector
            event={event}
            onSelect={nextEvent => setSubmission({...submission, event: nextEvent})}
          />
        }
      />
    </Box>
  );
}
