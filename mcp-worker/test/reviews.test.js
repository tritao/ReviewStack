import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

import {
  addReviewNote,
  canViewReview,
  createReview,
  listReviews,
  updateFinding,
} from '../src/reviews.js';

class SqliteD1 {
  constructor(schema) {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(schema);
  }

  prepare(sql) {
    return new Statement(this.database, sql);
  }

  batch(statements) {
    this.database.exec('BEGIN');
    try {
      for (const statement of statements) statement.run();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return Promise.resolve({success: true});
  }
}

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new Statement(this.database, this.sql, values);
  }

  run() {
    return this.database.prepare(this.sql).run(...this.values);
  }

  all() {
    return {results: this.database.prepare(this.sql).all(...this.values)};
  }

  first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }
}

const pullRequest = {
  number: 123,
  title: 'Improve review flow',
  htmlUrl: 'https://github.com/FreeCAD/FreeCAD/pull/123',
  head: {sha: '1'.repeat(40)},
  base: {sha: '0'.repeat(40)},
};

async function makeEnvironment() {
  return {
    REVIEWS_DB: new SqliteD1(
      await readFile(new URL('../migrations/0001_reviews.sql', import.meta.url), 'utf8'),
    ),
  };
}

test('stores review drafts, findings, notes, and status changes transactionally', async () => {
  const env = await makeEnvironment();
  const identity = {subject: 'github:42', githubLogin: 'reviewer'};
  const result = await createReview(env, {
    identity,
    owner: 'FreeCAD',
    repo: 'FreeCAD',
    pullRequest,
    summary: 'The change is mostly safe, with one regression risk.',
    idempotencyKey: 'chatgpt-run-1',
    findings: [
      {
        fingerprint: 'finding-1',
        severity: 'high',
        path: 'src/Feature.cpp',
        startLine: 42,
        endLine: 44,
        title: 'State is not reset',
        body: 'The cached state survives a second invocation.',
        confidence: 0.9,
      },
    ],
  });

  assert.equal(result.created, true);
  assert.equal(result.review.findings.length, 1);
  assert.equal(result.review.findings[0].status, 'open');
  assert.equal(result.review.notes.length, 0);

  const duplicate = await createReview(env, {
    identity,
    owner: 'FreeCAD',
    repo: 'FreeCAD',
    pullRequest,
    summary: 'Retry should return the original draft.',
    idempotencyKey: 'chatgpt-run-1',
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.review.id, result.review.id);

  const listed = await listReviews(env, {owner: 'FreeCAD', repo: 'FreeCAD'});
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, result.review.id);

  const updated = await updateFinding(env, {
    identity: {subject: 'github:99', githubLogin: 'second-reviewer'},
    reviewId: result.review.id,
    findingId: result.review.findings[0].id,
    status: 'accepted',
  });
  assert.equal(updated.findings[0].status, 'accepted');

  const withNote = await addReviewNote(env, {
    identity: {subject: 'github:99', githubLogin: 'second-reviewer'},
    reviewId: result.review.id,
    body: 'Confirmed against the current stack layer.',
  });
  assert.equal(withNote.notes.length, 1);
  assert.equal(withNote.notes[0].authorLogin, 'second-reviewer');
  assert.equal(canViewReview(withNote, {subject: 'github:99'}), true);
});

test('private review drafts are visible only to their author', async () => {
  const env = await makeEnvironment();
  const identity = {subject: 'github:42', githubLogin: 'reviewer'};
  const result = await createReview(env, {
    identity,
    owner: 'FreeCAD',
    repo: 'FreeCAD',
    pullRequest,
    summary: 'Private notes for follow-up.',
    visibility: 'private',
  });

  assert.equal(canViewReview(result.review, identity), true);
  assert.equal(canViewReview(result.review, {subject: 'github:99'}), false);
  assert.equal((await listReviews(env, {owner: 'FreeCAD', repo: 'FreeCAD', identity})).length, 1);
  assert.equal(
    (await listReviews(env, {owner: 'FreeCAD', repo: 'FreeCAD', identity: {subject: 'github:99'}}))
      .length,
    0,
  );
  assert.equal((await listReviews(env, {owner: 'FreeCAD', repo: 'FreeCAD'})).length, 0);
});
