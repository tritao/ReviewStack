/** Local, repository-scoped review progress that survives reloads. */
import {useCallback, useEffect, useState} from 'react';

const PREFIX = 'reviewstack.reviewed.v1';
const PROGRESS_EVENT = 'reviewstack-review-progress';

function progressKey(kind: 'file' | 'commit', id: string): string {
  return `${PREFIX}:${window.location.pathname}:${kind}:${id}`;
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
