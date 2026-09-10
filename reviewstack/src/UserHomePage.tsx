/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {HomePagePullRequestFragment, UserHomePageQueryData} from './generated/graphql';
import type {FormEvent} from 'react';

import './UserHomePage.css';

import ActorAvatar from './ActorAvatar';
import CenteredSpinner from './CenteredSpinner';
import Link from './Link';
import TrustedRenderedMarkdown from './TrustedRenderedMarkdown';
import {MergeableState, PullRequestReviewDecision, StatusState} from './generated/graphql';
import {gitHubUserHomePageDataAtom} from './jotai/atoms';
import {getReviewSessions} from './reviewProgress';
import {parseReviewTarget} from './reviewTarget';
import useNavigate from './useNavigate';
import {formatISODate} from './utils';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  CommentIcon,
  GitPullRequestIcon,
  PencilIcon,
  SearchIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import {Box, Button, Heading, IssueLabelToken, Label, Text, TextInput} from '@primer/react';
import {useAtomValue} from 'jotai';
import {Suspense, useMemo, useState} from 'react';
import {notEmpty} from 'shared/utils';

const FILTER_STORAGE_KEY = 'reviewstack.dashboard.filter.v1';
type QueueFilter = 'attention' | 'ready' | 'blocked' | 'draft' | 'all';

export default function UserHomePage(): React.ReactElement {
  return (
    <Box className="reviewstack-home">
      <QuickOpen />
      <Suspense fallback={<CenteredSpinner message="Loading your review queue…" />}>
        <UserHomePageRoot />
      </Suspense>
    </Box>
  );
}

function UserHomePageRoot(): React.ReactElement {
  const data = useAtomValue(gitHubUserHomePageDataAtom);
  const reviewRequests = data?.search.nodes ?? [];
  const ownPullRequests = data?.viewer.pullRequests.nodes ?? [];
  const requestedPullRequests = reviewRequests
    .map(node => (node?.__typename === 'PullRequest' ? node : null))
    .filter(notEmpty);
  return (
    <>
      <ContinueReview pullRequests={[...requestedPullRequests, ...ownPullRequests]} />
      <ReviewQueue reviewRequests={reviewRequests} />
      <PullRequestsForUser pullRequests={ownPullRequests} />
      <RepositoriesForUser repos={data?.viewer.repositories.nodes ?? []} />
    </>
  );
}

function QuickOpen(): React.ReactElement {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const target = parseReviewTarget(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (target != null) {
      navigate(target);
    }
  };
  return (
    <Box as="form" className="reviewstack-quick-open" onSubmit={submit}>
      <TextInput
        block
        leadingVisual={SearchIcon}
        aria-label="GitHub pull request or repository"
        placeholder="Paste a GitHub PR URL or enter owner/repository#123"
        value={value}
        onChange={event => setValue(event.target.value)}
      />
      <Button type="submit" variant="primary" disabled={target == null}>
        Open review
      </Button>
    </Box>
  );
}

function ContinueReview({
  pullRequests,
}: {
  pullRequests: Array<HomePagePullRequestFragment | null>;
}): React.ReactElement | null {
  const byPath = new Map(
    pullRequests
      .filter(notEmpty)
      .map(pr => [`/${pr.repository.nameWithOwner}/pull/${pr.number}`, pr]),
  );
  const sessions = getReviewSessions()
    .filter(({viewed, total}) => viewed > 0 && viewed < total)
    .slice(0, 3);
  if (sessions.length === 0) {
    return null;
  }

  return (
    <Box className="reviewstack-home-section">
      <SectionHeading title="Continue reviewing" subtitle="Pick up where you left off" />
      <Box className="reviewstack-continue-list">
        {sessions.map(session => {
          const pullRequest = byPath.get(session.pathname);
          const fallback = session.pathname.match(/\/([^/]+\/[^/]+)\/pull\/(\d+)$/);
          return (
            <Box className="reviewstack-continue-row" key={session.pathname}>
              <Box minWidth={0}>
                <Link href={session.pathname}>
                  {pullRequest == null ? (
                    `${fallback?.[1] ?? 'Pull request'} #${fallback?.[2] ?? ''}`
                  ) : (
                    <>
                      <Text color="fg.muted">
                        {pullRequest.repository.nameWithOwner} #{pullRequest.number}
                      </Text>{' '}
                      <TrustedRenderedMarkdown trustedHTML={pullRequest.titleHTML} inline={true} />
                    </>
                  )}
                </Link>
                <Text display="block" color="fg.muted" fontSize={0}>
                  {session.viewed}/{session.total} files viewed
                </Text>
              </Box>
              <Button as="a" href={session.pathname} size="small">
                Continue review
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function ReviewQueue({
  reviewRequests,
}: {
  reviewRequests: NonNullable<UserHomePageQueryData['search']['nodes']>;
}): React.ReactElement {
  const pullRequests = reviewRequests
    .map(node => (node?.__typename === 'PullRequest' ? node : null))
    .filter(notEmpty);
  const [filter, setFilter] = useState<QueueFilter>(() => {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    return stored === 'ready' || stored === 'blocked' || stored === 'draft' || stored === 'all'
      ? stored
      : 'attention';
  });
  const selectFilter = (next: QueueFilter) => {
    setFilter(next);
    localStorage.setItem(FILTER_STORAGE_KEY, next);
  };
  const filtered = useMemo(
    () =>
      [...pullRequests]
        .filter(pr => filter === 'all' || queueStatus(pr).group === filter)
        .sort((a, b) => queueStatus(a).priority - queueStatus(b).priority),
    [filter, pullRequests],
  );

  return (
    <Box className="reviewstack-home-section">
      <SectionHeading
        title="Review queue"
        subtitle={`${pullRequests.length} pull request${
          pullRequests.length === 1 ? '' : 's'
        } requesting your review`}
      />
      <Box className="reviewstack-filter-bar" role="group" aria-label="Filter review queue">
        {(
          [
            ['attention', 'Needs attention'],
            ['ready', 'Ready'],
            ['blocked', 'Blocked'],
            ['draft', 'Draft'],
            ['all', 'All'],
          ] as Array<[QueueFilter, string]>
        ).map(([value, label]) => (
          <Button
            key={value}
            size="small"
            variant={filter === value ? 'primary' : 'invisible'}
            aria-pressed={filter === value}
            onClick={() => selectFilter(value)}>
            {label}
          </Button>
        ))}
      </Box>
      {filtered.length === 0 ? (
        <Box className="reviewstack-empty-state">
          <CheckCircleIcon size={24} />
          <Text>No pull requests in this view.</Text>
        </Box>
      ) : (
        <Box className="reviewstack-review-queue">
          {filtered.map(pr => (
            <ReviewQueueRow key={`${pr.repository.nameWithOwner}#${pr.number}`} pullRequest={pr} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function ReviewQueueRow({pullRequest}: {pullRequest: HomePagePullRequestFragment}) {
  const {author, comments, labels, number, repository, titleHTML, updatedAt} = pullRequest;
  const status = queueStatus(pullRequest);
  const StatusIcon = status.icon;
  return (
    <Box className="reviewstack-review-row">
      <ActorAvatar login={author?.login} url={author?.avatarUrl} size={32} />
      <Box className="reviewstack-review-main">
        <Box className="reviewstack-review-title">
          <Link href={`/${repository.nameWithOwner}/pull/${number}`}>
            <TrustedRenderedMarkdown trustedHTML={titleHTML} inline={true} />
          </Link>
        </Box>
        <Box className="reviewstack-review-meta">
          <Text>
            {repository.nameWithOwner} #{number}
          </Text>
          <Text>by {author?.login ?? 'unknown'}</Text>
          <Text>updated {formatISODate(updatedAt, false)}</Text>
          <Text className="reviewstack-comment-count">
            <CommentIcon /> {comments.totalCount}
          </Text>
        </Box>
        {(labels?.nodes ?? []).filter(notEmpty).length > 0 && (
          <Box className="reviewstack-review-labels">
            {(labels?.nodes ?? []).filter(notEmpty).map(label => (
              <IssueLabelToken key={label.id} text={label.name} fillColor={`#${label.color}`} />
            ))}
          </Box>
        )}
      </Box>
      <Label className="reviewstack-action-status" variant={status.variant}>
        <StatusIcon /> {status.label}
      </Label>
    </Box>
  );
}

type QueueStatus = {
  group: QueueFilter;
  label: string;
  priority: number;
  icon: React.ComponentType;
  variant: 'accent' | 'attention' | 'danger' | 'done' | 'success' | 'secondary';
};

function queueStatus(pr: HomePagePullRequestFragment): QueueStatus {
  const checks = pr.commits.nodes?.[0]?.commit.statusCheckRollup?.state;
  if (pr.isDraft) {
    return {group: 'draft', label: 'Draft', priority: 50, icon: PencilIcon, variant: 'secondary'};
  }
  if (pr.mergeable === MergeableState.Conflicting) {
    return {
      group: 'blocked',
      label: 'Merge conflict',
      priority: 30,
      icon: AlertIcon,
      variant: 'danger',
    };
  }
  if (checks === StatusState.Failure || checks === StatusState.Error) {
    return {
      group: 'blocked',
      label: 'Checks failing',
      priority: 31,
      icon: XCircleIcon,
      variant: 'danger',
    };
  }
  if (pr.reviewDecision === PullRequestReviewDecision.ChangesRequested) {
    return {
      group: 'blocked',
      label: 'Changes requested',
      priority: 32,
      icon: AlertIcon,
      variant: 'attention',
    };
  }
  if (pr.reviewDecision === PullRequestReviewDecision.Approved && checks === StatusState.Success) {
    return {
      group: 'ready',
      label: 'Ready to merge',
      priority: 20,
      icon: CheckCircleIcon,
      variant: 'success',
    };
  }
  if (checks === StatusState.Pending || checks === StatusState.Expected) {
    return {
      group: 'attention',
      label: 'Checks running',
      priority: 11,
      icon: ClockIcon,
      variant: 'attention',
    };
  }
  return {
    group: 'attention',
    label: 'Review requested',
    priority: 10,
    icon: GitPullRequestIcon,
    variant: 'accent',
  };
}

function SectionHeading({title, subtitle}: {title: string; subtitle: string}): React.ReactElement {
  return (
    <Box className="reviewstack-section-heading">
      <Heading as="h2">{title}</Heading>
      <Text color="fg.muted">{subtitle}</Text>
    </Box>
  );
}

function PullRequestsForUser({
  pullRequests,
}: {
  pullRequests: Array<HomePagePullRequestFragment | null>;
}) {
  const items = pullRequests.filter(notEmpty).slice(0, 5);
  if (items.length === 0) {
    return null;
  }
  return (
    <Box className="reviewstack-home-section reviewstack-secondary-section">
      <SectionHeading title="Your pull requests" subtitle="Recently updated" />
      {items.map(pr => (
        <Box
          className="reviewstack-secondary-row"
          key={`${pr.repository.nameWithOwner}#${pr.number}`}>
          <Link href={`/${pr.repository.nameWithOwner}/pull/${pr.number}`}>
            <Text color="fg.muted">
              {pr.repository.nameWithOwner} #{pr.number}
            </Text>{' '}
            <TrustedRenderedMarkdown trustedHTML={pr.titleHTML} inline={true} />
          </Link>
          <Text color="fg.muted" fontSize={0}>
            {formatISODate(pr.updatedAt, false)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function RepositoriesForUser({repos}: {repos: Array<{nameWithOwner: string} | null>}) {
  const items = repos.filter(notEmpty);
  if (items.length === 0) {
    return null;
  }
  return (
    <Box className="reviewstack-home-section reviewstack-secondary-section">
      <SectionHeading title="Repositories" subtitle="Recently active" />
      <Box className="reviewstack-repositories">
        {items.map(repo => (
          <Link key={repo.nameWithOwner} href={`/${repo.nameWithOwner}/pulls`}>
            {repo.nameWithOwner}
          </Link>
        ))}
      </Box>
    </Box>
  );
}
