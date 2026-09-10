/** Local, repository-scoped review progress that survives reloads. */
import {useCallback, useEffect, useState} from 'react';

const PREFIX = 'reviewstack.reviewed.v1';
const PROGRESS_EVENT = 'reviewstack-review-progress';

function progressKey(kind: 'file' | 'commit', id: string): string {
  const commitScope =
    kind === 'file' ? new URLSearchParams(window.location.search).get('commit') ?? 'layer' : '';
  return `${PREFIX}:${window.location.pathname}:${kind}:${commitScope}:${id}`;
}

const FILES_PREFIX = 'reviewstack.commit-files.v1';
const STATS_PREFIX = 'reviewstack.commit-stats.v1';

export type ReviewSession = {
  pathname: string;
  viewed: number;
  total: number;
};

/** Summarize locally recorded file-review progress by pull request. */
export function getReviewSessions(): ReviewSession[] {
  const sessions = new Map<string, ReviewSession>();
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key == null || !key.startsWith(`${FILES_PREFIX}:`)) {
      continue;
    }
    const separator = key.lastIndexOf(':');
    const pathname = key.slice(FILES_PREFIX.length + 1, separator);
    const commitID = key.slice(separator + 1);
    if (!/^\/[^/]+\/[^/]+\/pull\/\d+$/.test(pathname) || commitID.length === 0) {
      continue;
    }
    try {
      const paths = JSON.parse(localStorage.getItem(key) ?? 'null') as string[] | null;
      if (!Array.isArray(paths)) {
        continue;
      }
      const session = sessions.get(pathname) ?? {pathname, viewed: 0, total: 0};
      session.total += paths.length;
      session.viewed += paths.filter(path =>
        localStorage.getItem(`${PREFIX}:${pathname}:file:${commitID}:${path}`),
      ).length;
      sessions.set(pathname, session);
    } catch {
      // Ignore malformed or obsolete local progress entries.
    }
  }
  return [...sessions.values()].filter(({total}) => total > 0);
}

function metadataKey(prefix: string, commitID: string): string {
  return `${prefix}:${window.location.pathname}:${commitID}`;
}

export function recordCommitFiles(commitID: string, paths: string[]): void {
  localStorage.setItem(metadataKey(FILES_PREFIX, commitID), JSON.stringify([...new Set(paths)]));
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
}

export function getCommitFileProgress(commitID: string): {viewed: number; total: number} | null {
  try {
    const paths = JSON.parse(
      localStorage.getItem(metadataKey(FILES_PREFIX, commitID)) ?? 'null',
    ) as string[] | null;
    return paths == null
      ? null
      : {
          total: paths.length,
          viewed: paths.filter(path =>
            localStorage.getItem(`${PREFIX}:${window.location.pathname}:file:${commitID}:${path}`),
          ).length,
        };
  } catch {
    return null;
  }
}

export type CommitReviewStats = {additions: number; deletions: number; files: number};

export function recordCommitStats(commitID: string, stats: CommitReviewStats): void {
  localStorage.setItem(metadataKey(STATS_PREFIX, commitID), JSON.stringify(stats));
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
}

export function getCommitStats(commitID: string): CommitReviewStats | null {
  try {
    return JSON.parse(localStorage.getItem(metadataKey(STATS_PREFIX, commitID)) ?? 'null');
  } catch {
    return null;
  }
}

export function isReviewProgressComplete(kind: 'file' | 'commit', id: string): boolean {
  return localStorage.getItem(progressKey(kind, id)) === 'true';
}

export function setReviewProgressComplete(
  kind: 'file' | 'commit',
  id: string,
  complete: boolean,
): void {
  const key = progressKey(kind, id);
  if (complete) {
    localStorage.setItem(key, 'true');
  } else {
    localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, {detail: {kind, id, complete}}));
}

export function useReviewProgress(kind: 'file' | 'commit', id: string): [boolean, () => void] {
  const key = progressKey(kind, id);
  const [reviewed, setReviewed] = useState(() => isReviewProgressComplete(kind, id));
  useEffect(() => setReviewed(isReviewProgressComplete(kind, id)), [id, key, kind]);
  useEffect(() => {
    const update = () => setReviewed(isReviewProgressComplete(kind, id));
    window.addEventListener(PROGRESS_EVENT, update);
    return () => window.removeEventListener(PROGRESS_EVENT, update);
  }, [id, kind]);
  const toggle = useCallback(() => {
    setReviewed(value => {
      const next = !value;
      setReviewProgressComplete(kind, id, next);
      return next;
    });
  }, [id, kind]);
  return [reviewed, toggle];
}

export function useReviewProgressVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion(value => value + 1);
    window.addEventListener(PROGRESS_EVENT, update);
    return () => window.removeEventListener(PROGRESS_EVENT, update);
  }, []);
  return version;
}
