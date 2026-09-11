import {parseDevstackStackBodyResult} from './devstack.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_COUNT = 10;
const MAX_TEXT_LENGTH = 100_000;
const MAX_PATCH_LENGTH = 32_000;
const MAX_FILES = 200;

export class ReviewStackError extends Error {
  constructor(message, code = 'reviewstack_error') {
    super(message);
    this.name = 'ReviewStackError';
    this.code = code;
  }
}

export function createGitHubClient({token, env, fetchImpl = fetch}) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new ReviewStackError('No GitHub credential is available.', 'github_auth_required');
  }
  return new GitHubClient(token, env, fetchImpl);
}

class GitHubClient {
  constructor(token, env, fetchImpl) {
    this.token = token;
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  repository(owner, repo) {
    validateRepositoryPart(owner, 'owner');
    validateRepositoryPart(repo, 'repo');
    const repository = `${owner}/${repo}`;
    const allowed = parseAllowedRepositories(this.env.MCP_ALLOWED_REPOSITORIES);
    if (allowed.length === 0 || !isAllowedRepository(repository, allowed)) {
      throw new ReviewStackError(
        `Repository ${repository} is not in MCP_ALLOWED_REPOSITORIES.`,
        'repository_not_allowed',
      );
    }
    return repository;
  }

  async json(path, init = {}) {
    const response = await this.fetchImpl(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'ReviewStack-MCP',
        ...(init.headers ?? {}),
      },
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof value?.message === 'string' ? `: ${value.message}` : '';
      throw new ReviewStackError(
        `GitHub request failed (${response.status})${detail}`,
        response.status === 401 ? 'github_auth_required' : 'github_request_failed',
      );
    }
    return value;
  }

  async list(path, limit = DEFAULT_PAGE_SIZE) {
    const boundedLimit = Math.max(1, Math.min(limit, MAX_FILES));
    const items = [];
    for (let page = 1; page <= MAX_PAGE_COUNT && items.length < boundedLimit; page++) {
      const perPage = Math.min(DEFAULT_PAGE_SIZE, boundedLimit - items.length);
      const separator = path.includes('?') ? '&' : '?';
      const pageItems = await this.json(`${path}${separator}per_page=${perPage}&page=${page}`);
      if (!Array.isArray(pageItems)) {
        throw new ReviewStackError(
          'GitHub returned an unexpected list response.',
          'github_response',
        );
      }
      items.push(...pageItems);
      if (pageItems.length < perPage) {
        break;
      }
    }
    return items.slice(0, boundedLimit);
  }

  async pullRequest(owner, repo, number) {
    this.repository(owner, repo);
    validateNumber(number, 'pull request number');
    const value = await this.json(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
    );
    return normalizePullRequest(value);
  }

  async pullRequestCommits(owner, repo, number, limit = MAX_FILES) {
    this.repository(owner, repo);
    validateNumber(number, 'pull request number');
    const commits = await this.list(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/commits`,
      limit,
    );
    return commits.map(normalizeCommit);
  }

  async commitDiff(owner, repo, sha, limit = MAX_FILES) {
    this.repository(owner, repo);
    validateSha(sha);
    const value = await this.json(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(
        sha,
      )}`,
    );
    const files = Array.isArray(value.files)
      ? value.files.slice(0, Math.min(limit, MAX_FILES))
      : [];
    return {
      sha: typeof value.sha === 'string' ? value.sha : sha,
      message: truncate(value.commit?.message ?? '', MAX_TEXT_LENGTH),
      files: files.map(normalizeFile),
      totalFiles: Array.isArray(value.files) ? value.files.length : files.length,
      truncated: Array.isArray(value.files) && value.files.length > files.length,
    };
  }

  async pullRequestFiles(owner, repo, number, limit = MAX_FILES) {
    this.repository(owner, repo);
    validateNumber(number, 'pull request number');
    const files = await this.list(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files`,
      limit,
    );
    return files.map(normalizeFile);
  }

  async reviewThreads(owner, repo, number, limit = 100) {
    this.repository(owner, repo);
    validateNumber(number, 'pull request number');
    const [inline, issue] = await Promise.all([
      this.list(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/comments`,
        limit,
      ),
      this.list(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`,
        limit,
      ),
    ]);
    return [
      ...inline.map(comment => ({
        kind: 'inline',
        id: comment.id,
        path: comment.path ?? null,
        line: comment.line ?? comment.original_line ?? null,
        side: comment.side ?? null,
        body: truncate(comment.body ?? '', MAX_TEXT_LENGTH),
        author: comment.user?.login ?? null,
        commitSha: comment.commit_id ?? null,
        createdAt: comment.created_at ?? null,
        updatedAt: comment.updated_at ?? null,
        inReplyTo: comment.in_reply_to_id ?? null,
      })),
      ...issue.map(comment => ({
        kind: 'conversation',
        id: comment.id,
        path: null,
        line: null,
        side: null,
        body: truncate(comment.body ?? '', MAX_TEXT_LENGTH),
        author: comment.user?.login ?? null,
        commitSha: null,
        createdAt: comment.created_at ?? null,
        updatedAt: comment.updated_at ?? null,
        inReplyTo: null,
      })),
    ].slice(0, Math.min(limit * 2, 200));
  }

  async checks(owner, repo, sha, limit = 100) {
    this.repository(owner, repo);
    validateSha(sha);
    const [checkRuns, status] = await Promise.all([
      this.json(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/commits/${encodeURIComponent(sha)}/check-runs?per_page=${Math.min(limit, 100)}`,
      ),
      this.json(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/commits/${encodeURIComponent(sha)}/status`,
      ),
    ]);
    return {
      commitSha: sha,
      checkRuns: (Array.isArray(checkRuns?.check_runs) ? checkRuns.check_runs : [])
        .slice(0, limit)
        .map(run => ({
          name: run.name ?? null,
          status: run.status ?? null,
          conclusion: run.conclusion ?? null,
          detailsUrl: run.details_url ?? null,
          summary: truncate(run.output?.summary ?? '', 4_000),
        })),
      statuses: (Array.isArray(status?.statuses) ? status.statuses : [])
        .slice(0, limit)
        .map(item => ({
          context: item.context ?? null,
          state: item.state ?? null,
          description: truncate(item.description ?? '', 4_000),
          targetUrl: item.target_url ?? null,
        })),
    };
  }

  async stack(owner, repo, number) {
    const pullRequest = await this.pullRequest(owner, repo, number);
    const parsed = parseDevstackStackBodyResult(pullRequest.body);
    if (parsed.type !== 'valid') {
      return {
        currentPullRequest: number,
        metadata: parsed.type === 'absent' ? null : {error: parsed.message},
        layers: [],
      };
    }
    return {
      currentPullRequest: number,
      metadata: parsed.metadata,
      layers: parsed.metadata.stack.map((layer, index) => ({
        ...layer,
        isCurrent: index === parsed.metadata.currentStackEntry,
      })),
    };
  }

  async layerDiff(owner, repo, number, layerPullRequest, commitLimit = 20) {
    const current = await this.pullRequest(owner, repo, number);
    const parsed = parseDevstackStackBodyResult(current.body);
    const targetNumber = layerPullRequest ?? number;
    if (parsed.type !== 'valid') {
      return {
        diffType: 'pull_request',
        pullRequest: targetNumber,
        files: await this.pullRequestFiles(owner, repo, targetNumber),
        stack: parsed.type === 'absent' ? null : {error: parsed.message},
      };
    }

    const layer = parsed.metadata.stack.find(entry => entry.number === targetNumber);
    if (layer == null) {
      throw new ReviewStackError(
        `Pull request ${targetNumber} is not present in the stack for ${number}.`,
        'layer_not_found',
      );
    }

    const commits =
      parsed.metadata.version === 2 && Array.isArray(layer.commits)
        ? layer.commits.slice(0, commitLimit)
        : (await this.pullRequestCommits(owner, repo, targetNumber, commitLimit)).map(
            commit => commit.sha,
          );
    const diffs = await Promise.all(
      commits.map(commit => this.commitDiff(owner, repo, commit, MAX_FILES)),
    );
    return {
      diffType: 'stack_layer_commits',
      pullRequest: targetNumber,
      stackVersion: parsed.metadata.version,
      commits: diffs,
      truncated: commits.length < (layer.commits?.length ?? layer.numCommits),
    };
  }
}

export async function getReviewContext({client, owner, repo, number, layerPullRequest}) {
  const pullRequest = await client.pullRequest(owner, repo, number);
  const [stack, commits, diff, threads, checks] = await Promise.all([
    client.stack(owner, repo, number),
    client.pullRequestCommits(owner, repo, number, 50),
    layerPullRequest == null
      ? client
          .pullRequestFiles(owner, repo, number, MAX_FILES)
          .then(files => ({diffType: 'pull_request_files', pullRequest: number, files}))
      : client.layerDiff(owner, repo, number, layerPullRequest, 20),
    client.reviewThreads(owner, repo, number, 100),
    client.checks(owner, repo, pullRequest.head.sha, 100),
  ]);
  return {
    pullRequest,
    stack,
    commits,
    diff,
    reviewThreads: threads,
    checks,
  };
}

function normalizePullRequest(value) {
  return {
    number: value.number,
    title: truncate(value.title ?? '', MAX_TEXT_LENGTH),
    body: truncate(value.body ?? '', MAX_TEXT_LENGTH),
    state: value.state ?? null,
    draft: value.draft ?? null,
    htmlUrl: value.html_url ?? null,
    author: value.user?.login ?? null,
    createdAt: value.created_at ?? null,
    updatedAt: value.updated_at ?? null,
    mergedAt: value.merged_at ?? null,
    base: {
      ref: value.base?.ref ?? null,
      sha: value.base?.sha ?? null,
      repository: value.base?.repo?.full_name ?? null,
    },
    head: {
      ref: value.head?.ref ?? null,
      sha: value.head?.sha ?? null,
      repository: value.head?.repo?.full_name ?? null,
    },
    labels: Array.isArray(value.labels)
      ? value.labels.map(label => label.name).filter(name => typeof name === 'string')
      : [],
    additions: value.additions ?? null,
    deletions: value.deletions ?? null,
    changedFiles: value.changed_files ?? null,
    comments: value.comments ?? null,
    reviewComments: value.review_comments ?? null,
  };
}

function normalizeCommit(value) {
  return {
    sha: value.sha ?? null,
    message: truncate(value.commit?.message ?? '', MAX_TEXT_LENGTH),
    headline: truncate((value.commit?.message ?? '').split('\n', 1)[0], 2_000),
    author: value.author?.login ?? value.commit?.author?.name ?? null,
    committedAt: value.commit?.committer?.date ?? null,
    parents: Array.isArray(value.parents)
      ? value.parents.map(parent => parent.sha).filter(Boolean)
      : [],
  };
}

function normalizeFile(value) {
  return {
    path: value.filename ?? null,
    status: value.status ?? null,
    additions: value.additions ?? null,
    deletions: value.deletions ?? null,
    changes: value.changes ?? null,
    previousPath: value.previous_filename ?? null,
    patch: value.patch == null ? null : truncate(value.patch, MAX_PATCH_LENGTH),
    patchTruncated: typeof value.patch === 'string' && value.patch.length > MAX_PATCH_LENGTH,
    blobUrl: value.blob_url ?? null,
    rawUrl: value.raw_url ?? null,
  };
}

export function parseAllowedRepositories(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+|\/\*)$/.test(item));
}

export function isAllowedRepository(repository, allowedRepositories) {
  return allowedRepositories.some(allowed => {
    if (allowed.endsWith('/*')) {
      return repository.startsWith(allowed.slice(0, -1));
    }
    return allowed === repository;
  });
}

function validateRepositoryPart(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new ReviewStackError(`Invalid GitHub ${label}.`, 'invalid_repository');
  }
}

function validateNumber(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ReviewStackError(`Invalid ${label}.`, 'invalid_input');
  }
}

function validateSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new ReviewStackError(
      'Commit SHA must be a 40-character hexadecimal object ID.',
      'invalid_input',
    );
  }
}

function truncate(value, limit) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…[truncated]`;
}
