import './CommitReviewRail.css';

import type {VersionCommit} from './github/types';

import {
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestSelectedVersionCommitsAtom,
} from './jotai';
import {
  isReviewProgressComplete,
  useReviewProgress,
  useReviewProgressVersion,
} from './reviewProgress';
import {updateReviewURL} from './reviewURL';
import {shortOid} from './utils';
import {CheckCircleFillIcon, CircleIcon, SyncIcon} from '@primer/octicons-react';
import {Box, Button, Flash, Heading, Text} from '@primer/react';
import {useAtom, useAtomValue} from 'jotai';
import {useEffect, useMemo} from 'react';

const SNAPSHOT_PREFIX = 'reviewstack.commit-snapshot.v1';

export default function CommitReviewRail(): React.ReactElement {
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const progressVersion = useReviewProgressVersion();
  const [target, setTarget] = useAtom(gitHubPullRequestReviewTargetAtom);
  const selected = target.type === 'commit' ? target.commitID : null;
  const reviewedCount = commits.filter(commit =>
    isReviewProgressComplete('commit', commit.commit),
  ).length;
  const rewrittenTitles = useRewrittenCommitTitles(commits, progressVersion);

  const select = (commitID: string) => {
    setTarget({type: 'commit', commitID});
    updateReviewURL({mode: 'commit', commitID});
  };
  const nextUnreviewed = commits.find(commit => !isReviewProgressComplete('commit', commit.commit));

  return (
    <Box className="commit-review-rail">
      <Heading as="h2" sx={{fontSize: 2}}>
        Commit review
      </Heading>
      <Text color="fg.muted">
        {reviewedCount} of {commits.length} reviewed
      </Text>
      {rewrittenTitles.length > 0 && (
        <Flash variant="warning" sx={{mt: 2}}>
          <SyncIcon /> {rewrittenTitles.length} previously reviewed commit
          {rewrittenTitles.length === 1 ? ' was' : 's were'} rewritten.
        </Flash>
      )}
      <div className="commit-review-rail-list">
        {commits.map((commit, index) => (
          <CommitRailItem
            key={commit.commit}
            commit={commit}
            index={index}
            current={selected === commit.commit}
            onSelect={() => select(commit.commit)}
          />
        ))}
      </div>
      {reviewedCount === commits.length && commits.length > 0 ? (
        <Flash variant="success">
          All commits reviewed. Switch to Layer to check the complete PR.
        </Flash>
      ) : (
        <Button
          block
          disabled={nextUnreviewed == null}
          onClick={() => nextUnreviewed && select(nextUnreviewed.commit)}>
          Next unreviewed
        </Button>
      )}
    </Box>
  );
}

function CommitRailItem({
  commit,
  index,
  current,
  onSelect,
}: {
  commit: VersionCommit;
  index: number;
  current: boolean;
  onSelect: () => void;
}) {
  const [reviewed] = useReviewProgress('commit', commit.commit);
  return (
    <button
      className={`commit-review-rail-item${current ? ' commit-review-rail-item-current' : ''}`}
      onClick={onSelect}
      aria-current={current ? 'step' : undefined}>
      {reviewed ? <CheckCircleFillIcon fill="var(--fgColor-open, #1a7f37)" /> : <CircleIcon />}
      <span>
        <Text fontWeight={current ? 'bold' : 'normal'}>{index + 1}. </Text>
        <Text className="commit-review-rail-title">{commit.title}</Text>
        <Text as="div" color="fg.muted" fontSize={0}>
          {shortOid(commit.commit)} · {new Date(commit.committedDate).toLocaleDateString()}
          {commit.author != null ? ` · ${commit.author}` : ''}
          {commit.parents.length > 1 ? ' · merge' : ''}
        </Text>
      </span>
    </button>
  );
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
