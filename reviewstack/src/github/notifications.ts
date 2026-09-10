/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import UnauthorizedError from './UnauthorizedError';
import {fetchWithRetry} from './fetchWithRetry';
import {createRequestHeaders} from 'shared/github/auth';

export type GitHubNotificationReason = 'assign' | 'mention' | 'review_requested' | 'team_mention';

export type GitHubNotificationSubjectType = 'PullRequest' | 'Issue';

export type GitHubNotification = {
  id: string;
  reason: GitHubNotificationReason;
  updatedAt: string;
  repositoryNameWithOwner: string;
  subjectTitle: string;
  subjectType: GitHubNotificationSubjectType;
  subjectUrl: string;
};

export type NotificationSubject = {
  repositoryNameWithOwner: string;
  number: number;
  subjectType: GitHubNotificationSubjectType;
};

const ATTENTION_REASONS = new Set<GitHubNotificationReason>([
  'assign',
  'mention',
  'review_requested',
  'team_mention',
]);

export function createRestApiEndpointForHostname(hostname: string): string {
  return hostname === 'github.com' ? 'https://api.github.com' : `https://${hostname}/api/v3`;
}

export async function fetchGitHubNotifications(
  hostname: string,
  token: string,
): Promise<GitHubNotification[]> {
  const endpoint = new URL(`${createRestApiEndpointForHostname(hostname)}/notifications`);
  endpoint.searchParams.set('all', 'false');
  endpoint.searchParams.set('participating', 'true');
  endpoint.searchParams.set('per_page', '50');

  const response = await fetchWithRetry(
    endpoint,
    {
      headers: createRequestHeaders(token),
      method: 'GET',
    },
    'fetch GitHub notifications',
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new UnauthorizedError(
        'Your GitHub access token cannot read notifications. Please sign in again.',
      );
    }
    throw new Error(`GitHub notifications request failed (${response.status}).`);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    return [];
  }

  return body
    .map(parseNotification)
    .filter(
      (notification): notification is GitHubNotification =>
        notification != null &&
        (notification.subjectType === 'PullRequest' || notification.subjectType === 'Issue') &&
        ATTENTION_REASONS.has(notification.reason),
    );
}

export function getNotificationSubject(
  notification: GitHubNotification,
): NotificationSubject | null {
  const match = notification.subjectUrl.match(/\/repos\/[^/]+\/[^/]+\/(?:issues|pulls)\/(\d+)/);
  const number = match == null ? NaN : Number(match[1]);
  return Number.isInteger(number) && number > 0
    ? {
        repositoryNameWithOwner: notification.repositoryNameWithOwner,
        number,
        subjectType: notification.subjectType,
      }
    : null;
}

export function notificationReasonLabel(reason: GitHubNotificationReason): string {
  switch (reason) {
    case 'assign':
      return 'Assigned';
    case 'mention':
      return 'Mentioned';
    case 'review_requested':
      return 'Review requested';
    case 'team_mention':
      return 'Team mention';
  }
}

function parseNotification(value: unknown): GitHubNotification | null {
  if (value == null || typeof value !== 'object') {
    return null;
  }

  const notification = value as {
    id?: unknown;
    reason?: unknown;
    updated_at?: unknown;
    repository?: {full_name?: unknown};
    subject?: {title?: unknown; type?: unknown; url?: unknown};
  };
  const {id, reason, updated_at: updatedAt, repository, subject} = notification;
  if (
    typeof id !== 'string' ||
    typeof reason !== 'string' ||
    !ATTENTION_REASONS.has(reason as GitHubNotificationReason) ||
    typeof updatedAt !== 'string' ||
    typeof repository?.full_name !== 'string' ||
    typeof subject?.title !== 'string' ||
    (subject.type !== 'PullRequest' && subject.type !== 'Issue') ||
    typeof subject.url !== 'string'
  ) {
    return null;
  }

  return {
    id,
    reason: reason as GitHubNotificationReason,
    updatedAt,
    repositoryNameWithOwner: repository.full_name,
    subjectTitle: subject.title,
    subjectType: subject.type,
    subjectUrl: subject.url,
  };
}
