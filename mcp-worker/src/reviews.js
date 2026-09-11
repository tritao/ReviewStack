import {ReviewStackError} from './github.js';

const MAX_FINDINGS = 100;
const MAX_NOTES = 100;
const MAX_LIST_LIMIT = 50;
const MAX_TEXT_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 500;
const MAX_PATH_LENGTH = 2_000;
const VISIBILITIES = new Set(['repository', 'private']);
const FINDING_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const FINDING_STATUSES = new Set(['open', 'accepted', 'dismissed', 'resolved']);

export function reviewDatabase(env) {
  if (env.REVIEWS_DB == null || typeof env.REVIEWS_DB.prepare !== 'function') {
    throw new ReviewStackError(
      'The ReviewStack review database is not configured.',
      'reviews_db_unconfigured',
    );
  }
  return env.REVIEWS_DB;
}

export async function createReview(
  env,
  {
    identity,
    owner,
    repo,
    pullRequest,
    layerPullRequest = null,
    title,
    summary,
    findings = [],
    visibility = 'repository',
    idempotencyKey = null,
  },
) {
  const db = reviewDatabase(env);
  const normalized = normalizeCreateInput({
    identity,
    owner,
    repo,
    pullRequest,
    layerPullRequest,
    title,
    summary,
    findings,
    visibility,
    idempotencyKey,
  });
  const now = new Date().toISOString();

  if (normalized.idempotencyKey != null) {
    const existing = await findIdempotentReview(db, normalized);
    if (existing != null) {
      return {created: false, review: await getReview(env, existing.id)};
    }
  }

  const reviewId = randomId();
  const statements = [
    db
      .prepare(
        `INSERT INTO reviews (
          id, owner, repo, pr_number, head_sha, base_sha, layer_pr_number,
          title, summary, status, visibility, author_subject, author_login,
          idempotency_key, source_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reviewId,
        normalized.owner,
        normalized.repo,
        normalized.pullRequest.number,
        normalized.pullRequest.head.sha,
        normalized.pullRequest.base.sha,
        normalized.layerPullRequest,
        normalized.title,
        normalized.summary,
        normalized.visibility,
        normalized.identity.subject,
        normalized.identity.githubLogin,
        normalized.idempotencyKey,
        normalized.pullRequest.htmlUrl,
        now,
        now,
      ),
  ];

  for (const finding of normalized.findings) {
    statements.push(
      db
        .prepare(
          `INSERT INTO review_findings (
            id, review_id, fingerprint, severity, path, start_line, end_line,
            title, body, confidence, status, created_by_subject, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
        )
        .bind(
          finding.id,
          reviewId,
          finding.fingerprint,
          finding.severity,
          finding.path,
          finding.startLine,
          finding.endLine,
          finding.title,
          finding.body,
          finding.confidence,
          normalized.identity.subject,
          now,
          now,
        ),
    );
  }

  statements.push(
    eventStatement(
      db,
      reviewId,
      normalized.identity,
      'review.created',
      {
        findingCount: normalized.findings.length,
        visibility: normalized.visibility,
        headSha: normalized.pullRequest.head.sha,
      },
      now,
    ),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    // The preflight lookup above is only an optimization. If two retries race,
    // the database's unique idempotency index wins; return that committed draft
    // instead of surfacing a transient constraint error.
    if (normalized.idempotencyKey != null) {
      const existing = await findIdempotentReview(db, normalized);
      if (existing != null) {
        return {created: false, review: await getReview(env, existing.id)};
      }
    }
    throw error;
  }
  return {created: true, review: await getReview(env, reviewId)};
}

export async function listReviews(env, {owner, repo, number = null, limit = 20, identity = null}) {
  const db = reviewDatabase(env);
  const normalizedIdentity = identity == null ? null : normalizeIdentity(identity);
  const normalizedLimit = normalizeLimit(limit);
  validateRepository(owner, repo);
  if (number != null) validateNumber(number, 'pull request number');
  const whereNumber = number == null ? '' : ' AND pr_number = ?';
  const whereVisibility =
    normalizedIdentity == null
      ? " AND visibility != 'private'"
      : " AND (visibility != 'private' OR author_subject = ?)";
  const bindings = [owner, repo];
  if (normalizedIdentity != null) bindings.push(normalizedIdentity.subject);
  if (number != null) bindings.push(number);
  bindings.push(normalizedLimit);
  const result = await db
    .prepare(
      `SELECT id, owner, repo, pr_number, head_sha, base_sha, layer_pr_number,
              title, summary, status, visibility, author_subject, author_login,
              source_url, created_at, updated_at
         FROM reviews
        WHERE owner = ? AND repo = ?${whereVisibility}${whereNumber}
        ORDER BY updated_at DESC
        LIMIT ?`,
    )
    .bind(...bindings)
    .all();
  return (result.results ?? []).map(normalizeReview);
}

export async function getReview(env, reviewId) {
  const db = reviewDatabase(env);
  const id = validateId(reviewId, 'review ID');
  const reviewResult = await db
    .prepare(
      `SELECT id, owner, repo, pr_number, head_sha, base_sha, layer_pr_number,
              title, summary, status, visibility, author_subject, author_login,
              source_url, created_at, updated_at
         FROM reviews
        WHERE id = ?`,
    )
    .bind(id)
    .first();
  if (reviewResult == null) {
    throw new ReviewStackError(`Review ${id} was not found.`, 'review_not_found');
  }

  const [findingsResult, notesResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, review_id, fingerprint, severity, path, start_line, end_line,
                title, body, confidence, status, created_by_subject, created_at, updated_at
           FROM review_findings
          WHERE review_id = ?
          ORDER BY CASE severity
                     WHEN 'critical' THEN 0
                     WHEN 'high' THEN 1
                     WHEN 'medium' THEN 2
                     WHEN 'low' THEN 3
                     ELSE 4
                   END, path, start_line`,
      )
      .bind(id)
      .all(),
    db
      .prepare(
        `SELECT id, review_id, body, author_subject, author_login, created_at
           FROM review_notes
          WHERE review_id = ?
          ORDER BY created_at
          LIMIT ?`,
      )
      .bind(id, MAX_NOTES)
      .all(),
  ]);

  return {
    ...normalizeReview(reviewResult),
    findings: (findingsResult.results ?? []).map(normalizeFinding),
    notes: (notesResult.results ?? []).map(normalizeNote),
  };
}

export async function updateFinding(env, {identity, reviewId, findingId, status}) {
  const db = reviewDatabase(env);
  const normalizedIdentity = normalizeIdentity(identity);
  const normalizedStatus = requiredEnum(status, FINDING_STATUSES, 'finding status');
  const id = validateId(findingId, 'finding ID');
  const review = await getReview(env, reviewId);
  if (!review.findings.some(finding => finding.id === id)) {
    throw new ReviewStackError(`Finding ${id} was not found.`, 'finding_not_found');
  }
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        'UPDATE review_findings SET status = ?, updated_at = ? WHERE id = ? AND review_id = ?',
      )
      .bind(normalizedStatus, now, id, review.id),
    db.prepare('UPDATE reviews SET updated_at = ? WHERE id = ?').bind(now, review.id),
    eventStatement(
      db,
      review.id,
      normalizedIdentity,
      'finding.updated',
      {
        findingId: id,
        status: normalizedStatus,
      },
      now,
    ),
  ]);
  return getReview(env, review.id);
}

export async function addReviewNote(env, {identity, reviewId, body}) {
  const db = reviewDatabase(env);
  const normalizedIdentity = normalizeIdentity(identity);
  const review = await getReview(env, reviewId);
  const normalizedBody = boundedText(body, MAX_TEXT_LENGTH, 'note body');
  const now = new Date().toISOString();
  const noteId = randomId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO review_notes (id, review_id, body, author_subject, author_login, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        noteId,
        review.id,
        normalizedBody,
        normalizedIdentity.subject,
        normalizedIdentity.githubLogin,
        now,
      ),
    db.prepare('UPDATE reviews SET updated_at = ? WHERE id = ?').bind(now, review.id),
    eventStatement(db, review.id, normalizedIdentity, 'note.created', {noteId}, now),
  ]);
  return getReview(env, review.id);
}

export function canViewReview(review, identity) {
  return (
    review.visibility !== 'private' ||
    (identity != null && review.authorSubject === identity.subject)
  );
}

function normalizeIdentity(identity) {
  if (identity == null || typeof identity.subject !== 'string' || identity.subject.length === 0) {
    throw new ReviewStackError('An authenticated reviewer is required.', 'github_auth_required');
  }
  return identity;
}

function normalizeCreateInput(input) {
  validateRepository(input.owner, input.repo);
  const identity = normalizeIdentity(input.identity);
  if (input.pullRequest == null || !Number.isInteger(input.pullRequest.number)) {
    throw new ReviewStackError('A valid pull request is required.', 'invalid_input');
  }
  validateSha(input.pullRequest.head?.sha, 'pull request head SHA');
  validateSha(input.pullRequest.base?.sha, 'pull request base SHA');
  if (input.layerPullRequest != null)
    validateNumber(input.layerPullRequest, 'layer pull request number');
  const visibility = requiredEnum(input.visibility, VISIBILITIES, 'review visibility');
  const findings = Array.isArray(input.findings) ? input.findings : [];
  if (findings.length > MAX_FINDINGS) {
    throw new ReviewStackError(
      `A review may contain at most ${MAX_FINDINGS} findings.`,
      'invalid_input',
    );
  }
  const normalizedFindings = findings.map(normalizeFindingInput);
  if (
    new Set(normalizedFindings.map(finding => finding.fingerprint)).size !==
    normalizedFindings.length
  ) {
    throw new ReviewStackError(
      'A review cannot contain duplicate finding fingerprints.',
      'invalid_input',
    );
  }
  return {
    ...input,
    identity,
    owner: input.owner.trim(),
    repo: input.repo.trim(),
    title: boundedText(
      input.title || `Review pull request #${input.pullRequest.number}`,
      MAX_TITLE_LENGTH,
      'review title',
    ),
    summary: boundedText(input.summary, MAX_TEXT_LENGTH, 'review summary'),
    findings: normalizedFindings,
    visibility,
    idempotencyKey: optionalText(input.idempotencyKey, 200),
  };
}

function normalizeFindingInput(input, index) {
  if (input == null || typeof input !== 'object') {
    throw new ReviewStackError(`Finding ${index + 1} is invalid.`, 'invalid_input');
  }
  const path = boundedText(input.path, MAX_PATH_LENGTH, `finding ${index + 1} path`);
  const title = boundedText(input.title, MAX_TITLE_LENGTH, `finding ${index + 1} title`);
  const body = boundedText(input.body, MAX_TEXT_LENGTH, `finding ${index + 1} body`);
  const severity = requiredEnum(input.severity || 'medium', FINDING_SEVERITIES, 'finding severity');
  const startLine = optionalPositiveInteger(input.startLine, `finding ${index + 1} start line`);
  const endLine = optionalPositiveInteger(input.endLine, `finding ${index + 1} end line`);
  if (startLine != null && endLine != null && endLine < startLine) {
    throw new ReviewStackError(`Finding ${index + 1} has an invalid line range.`, 'invalid_input');
  }
  const confidence = input.confidence == null ? null : Number(input.confidence);
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new ReviewStackError(
      `Finding ${index + 1} confidence must be between 0 and 1.`,
      'invalid_input',
    );
  }
  return {
    id: randomId(),
    fingerprint: optionalText(input.fingerprint, 500) || `${path}:${startLine ?? ''}:${title}`,
    severity,
    path,
    startLine,
    endLine,
    title,
    body,
    confidence,
  };
}

async function findIdempotentReview(db, input) {
  return db
    .prepare(
      `SELECT id FROM reviews
        WHERE owner = ? AND repo = ? AND pr_number = ? AND head_sha = ?
          AND author_subject = ? AND idempotency_key = ?`,
    )
    .bind(
      input.owner,
      input.repo,
      input.pullRequest.number,
      input.pullRequest.head.sha,
      input.identity.subject,
      input.idempotencyKey,
    )
    .first();
}

function eventStatement(db, reviewId, identity, eventType, payload, createdAt) {
  return db
    .prepare(
      `INSERT INTO review_events (id, review_id, actor_subject, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(randomId(), reviewId, identity.subject, eventType, JSON.stringify(payload), createdAt);
}

function normalizeReview(value) {
  return {
    id: value.id,
    owner: value.owner,
    repo: value.repo,
    number: value.pr_number,
    headSha: value.head_sha,
    baseSha: value.base_sha,
    layerPullRequest: value.layer_pr_number,
    title: value.title,
    summary: value.summary,
    status: value.status,
    visibility: value.visibility,
    authorSubject: value.author_subject,
    authorLogin: value.author_login,
    sourceUrl: value.source_url,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function normalizeFinding(value) {
  return {
    id: value.id,
    reviewId: value.review_id,
    fingerprint: value.fingerprint,
    severity: value.severity,
    path: value.path,
    startLine: value.start_line,
    endLine: value.end_line,
    title: value.title,
    body: value.body,
    confidence: value.confidence,
    status: value.status,
    createdBySubject: value.created_by_subject,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function normalizeNote(value) {
  return {
    id: value.id,
    reviewId: value.review_id,
    body: value.body,
    authorSubject: value.author_subject,
    authorLogin: value.author_login,
    createdAt: value.created_at,
  };
}

function validateRepository(owner, repo) {
  if (
    typeof owner !== 'string' ||
    !/^[A-Za-z0-9_.-]+$/.test(owner) ||
    typeof repo !== 'string' ||
    !/^[A-Za-z0-9_.-]+$/.test(repo)
  ) {
    throw new ReviewStackError('Invalid GitHub repository.', 'invalid_repository');
  }
}

function validateSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new ReviewStackError(
      `${label} must be a 40-character hexadecimal object ID.`,
      'invalid_input',
    );
  }
}

function validateNumber(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ReviewStackError(`Invalid ${label}.`, 'invalid_input');
  }
}

function validateId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new ReviewStackError(`Invalid ${label}.`, 'invalid_input');
  }
  return value;
}

function normalizeLimit(value) {
  if (value == null) return 20;
  if (!Number.isInteger(value) || value < 1) {
    throw new ReviewStackError('Review limit must be a positive integer.', 'invalid_input');
  }
  return Math.min(value, MAX_LIST_LIMIT);
}

function optionalPositiveInteger(value, label) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new ReviewStackError(`${label} must be a positive integer.`, 'invalid_input');
  }
  return value;
}

function requiredEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ReviewStackError(`Invalid ${label}.`, 'invalid_input');
  }
  return value;
}

function boundedText(value, limit, label) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > limit) {
    throw new ReviewStackError(
      `${label} must be non-empty and at most ${limit} characters.`,
      'invalid_input',
    );
  }
  return value.trim();
}

function optionalText(value, limit) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > limit) {
    throw new ReviewStackError(
      `Optional text must be at most ${limit} characters.`,
      'invalid_input',
    );
  }
  return value.trim();
}

function randomId() {
  return crypto.randomUUID();
}
