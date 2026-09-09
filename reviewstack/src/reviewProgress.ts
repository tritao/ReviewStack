/** Local, repository-scoped review progress that survives reloads. */
import {useCallback, useEffect, useState} from 'react';

const PREFIX = 'reviewstack.reviewed.v1';

export function useReviewProgress(kind: 'file' | 'commit', id: string): [boolean, () => void] {
  const key = `${PREFIX}:${window.location.pathname}:${kind}:${id}`;
  const [reviewed, setReviewed] = useState(() => localStorage.getItem(key) === 'true');
  useEffect(() => setReviewed(localStorage.getItem(key) === 'true'), [key]);
  const toggle = useCallback(() => {
    setReviewed(value => {
      const next = !value;
      if (next) {
        localStorage.setItem(key, 'true');
      } else {
        localStorage.removeItem(key);
      }
      return next;
    });
  }, [key]);
  return [reviewed, toggle];
}
