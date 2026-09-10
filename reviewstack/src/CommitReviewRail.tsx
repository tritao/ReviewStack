import './CommitReviewRail.css';

import type {VersionCommit} from './github/types';

import {dispatchCommand} from './KeyboardShortcuts';
import {CheckConclusionState, CheckStatusState, PullRequestReviewEvent} from './generated/graphql';
import {
  gitHubPullRequestCheckRunsAtom,
  gitHubPullRequestReviewThreadsAtom,
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestReviewSubmissionAtom,
  gitHubPullRequestSelectedVersionCommitsAtom,
  gitHubPullRequestViewerDidAuthorAtom,
} from './jotai';
import {
  getCommitFileProgress,
  getCommitStats,
  isReviewProgressComplete,
  useReviewProgress,
  useReviewProgressVersion,
} from './reviewProgress';
import {updateReviewURL} from './reviewURL';
import {shortOid} from './utils';
import {CheckCircleFillIcon, CircleIcon, SyncIcon} from '@primer/octicons-react';
import {Box, Button, Checkbox, Flash, Heading, Text} from '@primer/react';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';
import {useEffect, useMemo, useState} from 'react';

const SNAPSHOT_PREFIX = 'reviewstack.commit-snapshot.v1';

export default function CommitReviewRail(): React.ReactElement {
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const progressVersion = useReviewProgressVersion();
  const [target, setTarget] = useAtom(gitHubPullRequestReviewTargetAtom);
  const setReviewSubmission = useSetAtom(gitHubPullRequestReviewSubmissionAtom);
  const checkRuns = useAtomValue(gitHubPullRequestCheckRunsAtom);
  const reviewThreads = useAtomValue(gitHubPullRequestReviewThreadsAtom);
  const viewerDidAuthor = useAtomValue(gitHubPullRequestViewerDidAuthorAtom);
  const [showMerges, setShowMerges] = useState(false);
  const selected = target.type === 'commit' ? target.commitID : null;
  const reviewableCommits = commits.filter(commit => commit.parents.length <= 1);
  const visibleCommits = showMerges ? commits : reviewableCommits;
  const reviewedCount = reviewableCommits.filter(commit =>
    isReviewProgressComplete('commit', commit.commit),
  ).length;
  const rewrittenTitles = useRewrittenCommitTitles(commits, progressVersion);

  const select = (commitID: string) => {
    setTarget({type: 'commit', commitID});
    updateReviewURL({mode: 'commit', commitID});
  };
  const nextUnreviewed = reviewableCommits.find(
    commit => commit.commit !== selected && !isReviewProgressComplete('commit', commit.commit),
  );
  const fileProgress = reviewableCommits.map(commit => getCommitFileProgress(commit.commit));
  const unviewedFiles = fileProgress.reduce(
    (total, progress) => total + (progress == null ? 0 : progress.total - progress.viewed),
    0,
  );
  const unresolvedThreads = reviewThreads.filter(thread => !thread.isResolved).length;
  const incompleteChecks = checkRuns.filter(
    check =>
      check.status !== CheckStatusState.Completed ||
      (check.conclusion != null && check.conclusion !== CheckConclusionState.Success),
  ).length;

  return (
    <Box className="commit-review-rail">
      <Heading as="h2" sx={{fontSize: 2}}>
        Commit review
      </Heading>
      <Text color="fg.muted">
        {reviewedCount} of {reviewableCommits.length} reviewed
      </Text>
      {commits.length !== reviewableCommits.length && (
        <Box as="label" display="flex" alignItems="center" gridGap={1} marginTop={2}>
          <Checkbox checked={showMerges} onChange={() => setShowMerges(value => !value)} />
          <Text fontSize={0}>Show {commits.length - reviewableCommits.length} merge commits</Text>
        </Box>
      )}
      {rewrittenTitles.length > 0 && (
        <Flash variant="warning" sx={{mt: 2}}>
          <SyncIcon /> {rewrittenTitles.length} previously reviewed commit
          {rewrittenTitles.length === 1 ? ' was' : 's were'} rewritten.
        </Flash>
      )}
      <div className="commit-review-rail-list">
        {visibleCommits.map(commit => (
          <CommitRailItem
            key={commit.commit}
            commit={commit}
            index={commits.indexOf(commit)}
            current={selected === commit.commit}
            unresolvedThreads={reviewThreads.filter(
              thread =>
                !thread.isResolved && thread.comments[0]?.originalCommit?.oid === commit.commit,
            )}
            onSelect={() => select(commit.commit)}
          />
        ))}
      </div>
      {selected != null && (
        <Box className="commit-review-actions">
          <Text display="block" fontSize={0} fontWeight="bold" mb={1}>
            Submit review from this commit
          </Text>
          <Box display="flex" flexWrap="wrap" gridGap={1}>
            <Button size="small" onClick={() => beginReview(PullRequestReviewEvent.Comment)}>
              Comment
            </Button>
            {!viewerDidAuthor && (
              <>
                <Button size="small" onClick={() => beginReview(PullRequestReviewEvent.Approve)}>
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  onClick={() => beginReview(PullRequestReviewEvent.RequestChanges)}>
                  Request changes
                </Button>
              </>
            )}
          </Box>
        </Box>
      )}
      {reviewedCount === reviewableCommits.length && reviewableCommits.length > 0 ? (
        <ReviewCompletionSummary
          unviewedFiles={unviewedFiles}
          unresolvedThreads={unresolvedThreads}
          incompleteChecks={incompleteChecks}
          rewrittenCommits={rewrittenTitles.length}
        />
      ) : nextUnreviewed != null ? (
        <Button block onClick={() => select(nextUnreviewed.commit)}>
          Next unreviewed
        </Button>
      ) : null}
    </Box>
  );

  function beginReview(event: PullRequestReviewEvent) {
    setReviewSubmission({event, commitID: selected});
    dispatchCommand('ToggleSidebar');
  }
}

function ReviewCompletionSummary({
  unviewedFiles,
  unresolvedThreads,
  incompleteChecks,
  rewrittenCommits,
}: {
  unviewedFiles: number;
  unresolvedThreads: number;
  incompleteChecks: number;
  rewrittenCommits: number;
}) {
  const ready = unviewedFiles + unresolvedThreads + incompleteChecks + rewrittenCommits === 0;
  return (
    <Flash variant={ready ? 'success' : 'warning'}>
      <Text display="block" fontWeight="bold">
        {ready ? 'Commit review complete' : 'Review needs attention'}
      </Text>
      <Text as="div" fontSize={0}>
        {unviewedFiles} unviewed files
      </Text>
      <Text as="div" fontSize={0}>
        {unresolvedThreads} unresolved conversations
      </Text>
      <Text as="div" fontSize={0}>
        {incompleteChecks} pending or unsuccessful checks
      </Text>
      <Text as="div" fontSize={0}>
        {rewrittenCommits} rewritten commits
      </Text>
      <Button size="small" sx={{mt: 2}} onClick={() => dispatchCommand('ToggleSidebar')}>
        Open review submission
      </Button>
    </Flash>
  );
}

function CommitRailItem({
  commit,
  index,
  current,
  unresolvedThreads,
  onSelect,
}: {
  commit: VersionCommit;
  index: number;
  current: boolean;
  unresolvedThreads: Array<{firstCommentID: string; comments: Array<{path: string}>}>;
  onSelect: () => void;
}) {
  const [reviewed] = useReviewProgress('commit', commit.commit);
  const fileProgress = getCommitFileProgress(commit.commit);
  const stats = getCommitStats(commit.commit);
  const unresolvedPaths = [
    ...new Set(unresolvedThreads.map(thread => thread.comments[0]?.path)),
  ].filter((path): path is string => path != null);
  return (
    <div className={`commit-review-rail-item${current ? ' commit-review-rail-item-current' : ''}`}>
      <button
        className="commit-review-rail-item-main"
        onClick={onSelect}
        aria-current={current ? 'step' : undefined}>
        {reviewed ? <CheckCircleFillIcon fill="var(--fgColor-open, #1a7f37)" /> : <CircleIcon />}
        <span className="commit-review-rail-content">
          <span className="commit-review-rail-heading">
            <Text fontWeight={current ? 'bold' : 'normal'}>{index + 1}.</Text>
            <Text className="commit-review-rail-title">{commit.title}</Text>
          </span>
          <Text as="div" className="commit-review-rail-metadata" color="fg.muted" fontSize={0}>
            {shortOid(commit.commit)} · {new Date(commit.committedDate).toLocaleDateString()}
            {commit.author != null ? ` · ${commit.author}` : ''}
            {commit.parents.length > 1 ? ' · merge' : ''}
          </Text>
          {(fileProgress != null || stats != null) && (
            <Text as="div" color="fg.muted" fontSize={0}>
              {fileProgress != null
                ? `${fileProgress.viewed}/${fileProgress.total} files viewed`
                : ''}
              {stats != null ? ` · +${stats.additions} -${stats.deletions}` : ''}
            </Text>
          )}
          {unresolvedThreads.length > 0 && (
            <Text as="div" color="danger.fg" fontSize={0}>
              {unresolvedThreads.length} unresolved conversation
              {unresolvedThreads.length === 1 ? '' : 's'}
            </Text>
          )}
        </span>
      </button>
      {current && unresolvedPaths.length > 0 && (
        <Box className="commit-review-unresolved-files">
          {unresolvedPaths.map(path => (
            <button key={path} onClick={() => scrollToDiffFile(path)} title={path}>
              {path}
            </button>
          ))}
        </Box>
      )}
    </div>
  );
}

function scrollToDiffFile(path: string): void {
  const files = Array.from(document.querySelectorAll<HTMLElement>('[data-diff-file]'));
  const file = files.find(element => element.dataset.diffFile === path);
  file?.scrollIntoView({behavior: 'smooth', block: 'start'});
  file?.focus({preventScroll: true});
}

function useRewrittenCommitTitles(commits: VersionCommit[], progressVersion: number): string[] {
  const snapshotKey = `${SNAPSHOT_PREFIX}:${window.location.pathname}`;
  const rewritten = useMemo(() => {
    void progressVersion;
    let previous: Array<{title: string; commit: string; reviewed: boolean}> = [];
    try {
      previous = JSON.parse(localStorage.getItem(snapshotKey) ?? '[]');
    } catch {
      localStorage.removeItem(snapshotKey);
    }
    const currentByTitle = new Map(commits.map(commit => [commit.title, commit.commit]));
    return previous
      .filter(
        item =>
          item.reviewed &&
          currentByTitle.get(item.title) !== item.commit &&
          currentByTitle.has(item.title),
      )
      .map(item => item.title);
  }, [commits, progressVersion, snapshotKey]);
  useEffect(() => {
    void progressVersion;
    localStorage.setItem(
      snapshotKey,
      JSON.stringify(
        commits.map(commit => ({
          title: commit.title,
          commit: commit.commit,
          reviewed: isReviewProgressComplete('commit', commit.commit),
        })),
      ),
    );
  }, [commits, progressVersion, snapshotKey]);
  return rewritten;
}
