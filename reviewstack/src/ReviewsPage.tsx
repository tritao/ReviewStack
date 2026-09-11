/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Link from './Link';
import {AlertIcon, ArrowLeftIcon, CommentIcon} from '@primer/octicons-react';
import {Box, Button, Flash, Heading, Label, Text, TextInput} from '@primer/react';
import {useCallback, useEffect, useState} from 'react';

type ReviewSummary = {
  id: string;
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  title: string;
  summary: string;
  status: 'draft' | 'ready' | 'archived' | string;
  visibility: 'repository' | 'private' | string;
  authorLogin: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReviewDetail = ReviewSummary & {
  findings: Finding[];
  notes: Note[];
};

type Finding = {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | string;
  path: string;
  startLine: number | null;
  endLine: number | null;
  title: string;
  body: string;
  confidence: number | null;
  status: 'open' | 'accepted' | 'dismissed' | 'resolved' | string;
};

type Note = {
  id: string;
  body: string;
  authorLogin: string | null;
  createdAt: string;
};

type Props = {
  endpoint: string;
  token: string;
  reviewId?: string;
};

export default function ReviewsPage({endpoint, token, reviewId}: Props): React.ReactElement {
  return reviewId == null ? (
    <ReviewList endpoint={endpoint} token={token} />
  ) : (
    <ReviewDetailPage endpoint={endpoint} token={token} reviewId={reviewId} />
  );
}

function ReviewList({endpoint, token}: Omit<Props, 'reviewId'>): React.ReactElement {
  const [owner, setOwner] = useState('FreeCAD');
  const [repo, setRepo] = useState('FreeCAD');
  const [number, setNumber] = useState('');
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [state, setState] = useState<LoadState>({type: 'idle'});

  const loadReviews = useCallback(async () => {
    const normalizedOwner = owner.trim();
    const normalizedRepo = repo.trim();
    if (normalizedOwner.length === 0 || normalizedRepo.length === 0) {
      setState({type: 'error', message: 'Enter both a repository owner and name.'});
      return;
    }
    const url = new URL('/api/reviews', new URL(endpoint).origin);
    url.searchParams.set('owner', normalizedOwner);
    url.searchParams.set('repo', normalizedRepo);
    if (number.trim().length > 0) {
      url.searchParams.set('number', number.trim());
    }
    setState({type: 'loading'});
    try {
      const response = await fetch(url, {
        headers: {Accept: 'application/json', Authorization: `Bearer ${token}`},
        credentials: 'omit',
      });
      const body = (await response.json().catch(() => null)) as {
        reviews?: ReviewSummary[];
        error_description?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error_description || `Review service returned HTTP ${response.status}.`,
        );
      }
      setReviews(Array.isArray(body?.reviews) ? body?.reviews ?? [] : []);
      setState({type: 'ready'});
    } catch (error) {
      setState({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not load saved reviews.',
      });
    }
  }, [endpoint, number, owner, repo, token]);

  useEffect(() => {
    void loadReviews();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box as="main" paddingX={[3, 4]} paddingY={4} sx={{maxWidth: 1_100, marginX: 'auto'}}>
      <Box paddingBottom={4}>
        <Text color="accent.fg" fontWeight="bold">
          Shared review workspace
        </Text>
        <Heading as="h1" sx={{fontSize: [4, 5], marginTop: 1}}>
          Saved reviews
        </Heading>
        <Text as="p" color="fg.muted" fontSize={2} sx={{maxWidth: 760}}>
          Review drafts saved by ChatGPT and other authorized reviewers. Drafts are tied to a pull
          request head commit so stale findings remain easy to identify.
        </Text>
      </Box>

      <Box
        as="form"
        onSubmit={event => {
          event.preventDefault();
          void loadReviews();
        }}
        display="flex"
        flexWrap="wrap"
        gridGap={2}
        alignItems="end"
        padding={3}
        marginBottom={4}
        borderWidth={1}
        borderStyle="solid"
        borderColor="border.default"
        borderRadius={2}>
        <Field label="Owner" value={owner} onChange={setOwner} />
        <Field label="Repository" value={repo} onChange={setRepo} />
        <Field label="PR number (optional)" value={number} onChange={setNumber} />
        <Button type="submit" variant="primary" disabled={state.type === 'loading'}>
          {state.type === 'loading' ? 'Loading…' : 'Find reviews'}
        </Button>
      </Box>

      {state.type === 'error' ? (
        <Flash variant="danger" sx={{mb: 3}}>
          <AlertIcon aria-hidden="true" /> {state.message}
        </Flash>
      ) : null}
      {state.type === 'ready' && reviews.length === 0 ? (
        <Box padding={4} borderWidth={1} borderStyle="dashed" borderColor="border.default">
          <Text color="fg.muted">No saved reviews matched this repository.</Text>
        </Box>
      ) : null}
      <Box as="ul" padding={0} margin={0} sx={{listStyle: 'none'}}>
        {reviews.map(review => (
          <ReviewRow key={review.id} review={review} />
        ))}
      </Box>
    </Box>
  );
}

function ReviewRow({review}: {review: ReviewSummary}): React.ReactElement {
  return (
    <Box
      as="li"
      padding={3}
      marginBottom={3}
      borderWidth={1}
      borderStyle="solid"
      borderColor="border.default"
      borderRadius={2}>
      <Box display="flex" justifyContent="space-between" flexWrap="wrap" gridGap={2}>
        <Box>
          <Text color="fg.muted">
            {review.owner}/{review.repo} #{review.number}
          </Text>
          <Heading as="h2" sx={{fontSize: 3, marginTop: 1}}>
            <Link href={`/reviews/${review.id}`}>{review.title}</Link>
          </Heading>
        </Box>
        <Label variant={review.status === 'ready' ? 'success' : 'secondary'}>{review.status}</Label>
      </Box>
      <Text as="p" sx={{whiteSpace: 'pre-wrap'}}>
        {review.summary}
      </Text>
      <Text color="fg.muted" fontSize={0}>
        {review.authorLogin == null ? 'Unknown reviewer' : `by ${review.authorLogin}`} · head{' '}
        <Text as="code">{review.headSha.slice(0, 12)}</Text> · updated{' '}
        {formatDate(review.updatedAt)}
      </Text>
    </Box>
  );
}

function ReviewDetailPage({
  endpoint,
  token,
  reviewId,
}: Required<Pick<Props, 'endpoint' | 'token' | 'reviewId'>>): React.ReactElement {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [state, setState] = useState<LoadState>({type: 'loading'});

  useEffect(() => {
    const load = async () => {
      setState({type: 'loading'});
      try {
        const url = new URL(
          `/api/reviews/${encodeURIComponent(reviewId)}`,
          new URL(endpoint).origin,
        );
        const response = await fetch(url, {
          headers: {Accept: 'application/json', Authorization: `Bearer ${token}`},
          credentials: 'omit',
        });
        const body = (await response.json().catch(() => null)) as
          | ReviewDetail
          | {error_description?: string}
          | null;
        const errorDescription =
          body != null && 'error_description' in body ? body.error_description : undefined;
        if (!response.ok || body == null || !('findings' in body)) {
          throw new Error(errorDescription || `Review service returned HTTP ${response.status}.`);
        }
        setReview(body);
        setState({type: 'ready'});
      } catch (error) {
        setState({
          type: 'error',
          message: error instanceof Error ? error.message : 'Could not load this review.',
        });
      }
    };
    void load();
  }, [endpoint, reviewId, token]);

  if (state.type === 'loading') {
    return <Box padding={4}>Loading review…</Box>;
  }
  if (state.type === 'error') {
    return (
      <Box as="main" padding={4} sx={{maxWidth: 1_100, marginX: 'auto'}}>
        <Link href="/reviews">
          <ArrowLeftIcon aria-hidden="true" /> Back to saved reviews
        </Link>
        <Flash variant="danger" sx={{mt: 3}}>
          <AlertIcon aria-hidden="true" /> {state.message}
        </Flash>
      </Box>
    );
  }
  if (review == null) {
    return <></>;
  }

  return (
    <Box as="main" paddingX={[3, 4]} paddingY={4} sx={{maxWidth: 1_100, marginX: 'auto'}}>
      <Link href="/reviews">
        <ArrowLeftIcon aria-hidden="true" /> Back to saved reviews
      </Link>
      <Box paddingY={3}>
        <Text color="fg.muted">
          {review.owner}/{review.repo} #{review.number}
        </Text>
        <Heading as="h1" sx={{fontSize: [4, 5], marginTop: 1}}>
          {review.title}
        </Heading>
        <Text color="fg.muted">
          {review.authorLogin == null ? 'Unknown reviewer' : `by ${review.authorLogin}`} · head{' '}
          <Text as="code">{review.headSha}</Text>
        </Text>
      </Box>
      <Box padding={3} marginBottom={4} bg="canvas.subtle" borderRadius={2}>
        <Text sx={{whiteSpace: 'pre-wrap'}}>{review.summary}</Text>
      </Box>
      <Heading as="h2" sx={{fontSize: 3}}>
        Findings ({review.findings.length})
      </Heading>
      {review.findings.length === 0 ? (
        <Text color="fg.muted">No findings were saved.</Text>
      ) : (
        <Box as="ul" padding={0} margin={0} marginTop={2} sx={{listStyle: 'none'}}>
          {review.findings.map(finding => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </Box>
      )}
      <Heading as="h2" sx={{fontSize: 3, marginTop: 4}}>
        Reviewer notes ({review.notes.length})
      </Heading>
      {review.notes.length === 0 ? (
        <Text color="fg.muted">No notes were saved.</Text>
      ) : (
        <Box as="ul" padding={0} margin={0} marginTop={2} sx={{listStyle: 'none'}}>
          {review.notes.map(note => (
            <Box
              key={note.id}
              as="li"
              padding={3}
              marginBottom={2}
              borderBottomWidth={1}
              borderColor="border.muted">
              <Text sx={{whiteSpace: 'pre-wrap'}}>{note.body}</Text>
              <Text display="block" color="fg.muted" fontSize={0} marginTop={1}>
                <CommentIcon aria-hidden="true" /> {note.authorLogin ?? 'Unknown reviewer'} ·{' '}
                {formatDate(note.createdAt)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function FindingRow({finding}: {finding: Finding}): React.ReactElement {
  const location =
    finding.startLine == null
      ? finding.path
      : `${finding.path}:${finding.startLine}${
          finding.endLine != null && finding.endLine !== finding.startLine
            ? `-${finding.endLine}`
            : ''
        }`;
  return (
    <Box
      as="li"
      padding={3}
      marginBottom={2}
      borderWidth={1}
      borderStyle="solid"
      borderColor="border.default"
      borderRadius={2}>
      <Box display="flex" flexWrap="wrap" gridGap={2} alignItems="center">
        <Label
          variant={
            finding.severity === 'critical' || finding.severity === 'high'
              ? 'attention'
              : 'secondary'
          }>
          {finding.severity}
        </Label>
        <Text as="code">{location}</Text>
        <Label variant="secondary">{finding.status}</Label>
      </Box>
      <Heading as="h3" sx={{fontSize: 2, marginTop: 2}}>
        {finding.title}
      </Heading>
      <Text sx={{whiteSpace: 'pre-wrap'}}>{finding.body}</Text>
    </Box>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <Box sx={{minWidth: 180, flex: '1 1 180px'}}>
      <Text as="label" display="block" fontWeight="bold" fontSize={0} marginBottom={1}>
        {label}
      </Text>
      <TextInput block value={value} onChange={event => onChange(event.target.value)} />
    </Box>
  );
}

type LoadState =
  | {type: 'idle'}
  | {type: 'loading'}
  | {type: 'ready'}
  | {type: 'error'; message: string};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}
