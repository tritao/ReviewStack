/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {UserHomePageMentionsQueryData} from './generated/graphql';
import type {GitHubNotification} from './github/notifications';

import './UserHomePage.css';

import Link from './Link';
import TrustedRenderedMarkdown from './TrustedRenderedMarkdown';
import {getNotificationSubject, notificationReasonLabel} from './github/notifications';
import {formatISODate} from './utils';
import {BellIcon} from '@primer/octicons-react';
import {Box, Button, Label, Text} from '@primer/react';
import {useMemo, useState} from 'react';
import {notEmpty} from 'shared/utils';

const HANDLED_STORAGE_KEY = 'reviewstack.handled-attention.v1';

type MentionSearchNode = NonNullable<UserHomePageMentionsQueryData['search']['nodes']>[number];
type AttentionKind = 'PullRequest' | 'Issue';

type AttentionItem = {
  key: string;
  title: string;
  titleHTML: string | null;
  repositoryNameWithOwner: string;
  number: number;
  kind: AttentionKind;
  updatedAt: string;
  reasons: string[];
  handledKeys: string[];
};

export default function UserAttentionQueue({
  notifications,
  notificationsAvailable,
  mentionedItems,
  excludedKeys,
}: {
  notifications: GitHubNotification[];
  notificationsAvailable: boolean;
  mentionedItems: MentionSearchNode[];
  excludedKeys: ReadonlySet<string>;
}): React.ReactElement | null {
  const [handled, setHandled] = useState<Record<string, string>>(readHandledAttention);
  const items = useMemo(
    () =>
      buildAttentionItems(
        notifications,
        notificationsAvailable,
        mentionedItems,
        excludedKeys,
      ).filter(item => !isHandled(item, handled)),
    [excludedKeys, handled, mentionedItems, notifications, notificationsAvailable],
  );

  if (items.length === 0) {
    return null;
  }

  const fallback = !notificationsAvailable;
  return (
    <Box className="reviewstack-home-section">
      <Box className="reviewstack-section-heading">
        <Box>
          <Text as="h2" fontSize={3} fontWeight="bold" m={0}>
            Needs your attention
          </Text>
          <Text color="fg.muted">
            {fallback
              ? 'Notifications are unavailable; showing open PRs and issues that mention you.'
              : `${items.length} unread GitHub notification${items.length === 1 ? '' : 's'}`}
          </Text>
        </Box>
      </Box>
      <Box className="reviewstack-review-queue">
        {items.map(item => (
          <AttentionRow
            key={item.key}
            item={item}
            onHandled={() => {
              const next = {...handled};
              item.handledKeys.forEach(key => {
                next[key] = item.updatedAt;
              });
              localStorage.setItem(HANDLED_STORAGE_KEY, JSON.stringify(next));
              setHandled(next);
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function AttentionRow({
  item,
  onHandled,
}: {
  item: AttentionItem;
  onHandled: () => void;
}): React.ReactElement {
  return (
    <Box className="reviewstack-review-row reviewstack-attention-row">
      <BellIcon className="reviewstack-attention-icon" size={24} />
      <Box className="reviewstack-review-main">
        <Box className="reviewstack-review-title">
          <Link href={subjectPath(item)}>
            {item.titleHTML == null ? (
              item.title
            ) : (
              <TrustedRenderedMarkdown trustedHTML={item.titleHTML} inline={true} />
            )}
          </Link>
        </Box>
        <Box className="reviewstack-review-meta">
          <Text>
            {item.repositoryNameWithOwner} #{item.number}
          </Text>
          <Label variant="accent">{item.kind === 'Issue' ? 'Issue' : 'Pull request'}</Label>
          {item.reasons.map(reason => (
            <Label key={reason} variant="attention">
              {reason}
            </Label>
          ))}
          <Text>updated {formatISODate(item.updatedAt, false)}</Text>
        </Box>
      </Box>
      <Button size="small" onClick={onHandled}>
        Handled
      </Button>
    </Box>
  );
}

function buildAttentionItems(
  notifications: GitHubNotification[],
  notificationsAvailable: boolean,
  mentionedItems: MentionSearchNode[],
  excludedKeys: ReadonlySet<string>,
): AttentionItem[] {
  if (!notificationsAvailable) {
    return mentionedItems
      .map(subject => {
        if (
          subject == null ||
          (subject.__typename !== 'PullRequest' && subject.__typename !== 'Issue')
        ) {
          return null;
        }
        const key = subjectKey(subject.repository.nameWithOwner, subject.number);
        if (excludedKeys.has(key)) {
          return null;
        }
        return {
          key,
          title: '',
          titleHTML:
            subject.__typename === 'PullRequest' ? subject.titleHTML : subject.issueTitleHTML,
          repositoryNameWithOwner: subject.repository.nameWithOwner,
          number: subject.number,
          kind: subject.__typename,
          updatedAt: subject.updatedAt,
          reasons: ['Mentioned'],
          handledKeys: [`mention:${subject.__typename}:${key}`],
        };
      })
      .filter(notEmpty)
      .sort(sortByUpdatedAt);
  }

  const groups = new Map<
    string,
    Omit<AttentionItem, 'reasons' | 'handledKeys'> & {
      reasons: Set<string>;
      handledKeys: string[];
    }
  >();
  notifications.forEach(notification => {
    const subject = getNotificationSubject(notification);
    if (subject == null) {
      return;
    }
    const key = subjectKey(subject.repositoryNameWithOwner, subject.number);
    if (excludedKeys.has(key)) {
      return;
    }
    const current = groups.get(key);
    const next =
      current == null || Date.parse(notification.updatedAt) >= Date.parse(current.updatedAt)
        ? {
            key,
            title: notification.subjectTitle,
            titleHTML: null,
            repositoryNameWithOwner: subject.repositoryNameWithOwner,
            number: subject.number,
            kind: subject.subjectType,
            updatedAt: notification.updatedAt,
            reasons: current?.reasons ?? new Set<string>(),
            handledKeys: current?.handledKeys ?? [],
          }
        : current;
    next.reasons.add(notificationReasonLabel(notification.reason));
    next.handledKeys.push(`notification:${notification.id}`);
    groups.set(key, next);
  });

  return [...groups.values()]
    .map(item => ({...item, reasons: [...item.reasons]}))
    .sort(sortByUpdatedAt);
}

function isHandled(item: AttentionItem, handled: Record<string, string>): boolean {
  return item.handledKeys.every(key => {
    const handledAt = handled[key];
    return handledAt != null && Date.parse(handledAt) >= Date.parse(item.updatedAt);
  });
}

function readHandledAttention(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HANDLED_STORAGE_KEY) ?? '{}');
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function subjectPath(item: AttentionItem): string {
  const path = item.kind === 'Issue' ? 'issues' : 'pull';
  return `/${item.repositoryNameWithOwner}/${path}/${item.number}`;
}

function subjectKey(repositoryNameWithOwner: string, number: number): string {
  return `${repositoryNameWithOwner}#${number}`;
}

function sortByUpdatedAt(a: AttentionItem, b: AttentionItem): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}
