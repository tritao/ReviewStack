/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type GitHubClient from './GitHubClient';
import type {PullRequest} from './pullRequestTimelineTypes';
import type {PullsQueryInput, PullsWithPageInfo} from './pullsTypes';
import type {CommitComparison} from './restApiTypes';
import type {Blob, Commit, GitObjectID, ID, Tree} from './types';
import type {
  AddCommentMutationData,
  AddCommentMutationVariables,
  AddLabelsToLabelableInput,
  AddLabelsToLabelableMutationData,
  AddLabelsToLabelableMutationVariables,
  AddPullRequestReviewInput,
  AddPullRequestReviewMutationData,
  AddPullRequestReviewMutationVariables,
  AddPullRequestReviewCommentInput,
  AddPullRequestReviewCommentMutationData,
  AddPullRequestReviewCommentMutationVariables,
  CommitQueryData,
  CommitQueryVariables,
  LabelFragment,
  PullRequestQueryData,
  PullRequestQueryVariables,
  PullsQueryData,
  PullsQueryVariables,
  RemoveLabelsFromLabelableInput,
  RemoveLabelsFromLabelableMutationData,
  RemoveLabelsFromLabelableMutationVariables,
  RepoAssignableUsersQueryData,
  RepoAssignableUsersQueryVariables,
  RepoLabelsQueryData,
  RepoLabelsQueryVariables,
  RequestReviewsInput,
  RequestReviewsMutationData,
  RequestReviewsMutationVariables,
  StackPullRequestFragment,
  StackPullRequestQueryVariables,
  StackPullRequestQueryData,
  SubmitPullRequestReviewInput,
  SubmitPullRequestReviewMutationData,
  SubmitPullRequestReviewMutationVariables,
  TreeQueryData,
  TreeQueryVariables,
  UserFragment,
} from '../generated/graphql';

import {globalCacheStats} from './GitHubClientStats';
import {fetchWithRetry} from './fetchWithRetry';
import {createGraphQLEndpointForHostname} from './gitHubCredentials';
import queryGraphQL from './queryGraphQL';
import {
  AddCommentMutation,
  AddLabelsToLabelableMutation,
  AddPullRequestReviewMutation,
  AddPullRequestReviewCommentMutation,
  CommitQuery,
  PullRequestQuery,
  PullsQuery,
  RemoveLabelsFromLabelableMutation,
  RepoAssignableUsersQuery,
  RepoLabelsQuery,
  RequestReviewsMutation,
  StackPullRequestQuery,
  SubmitPullRequestReviewMutation,
  TreeQuery,
} from '../generated/graphql';
import {createRequestHeaders} from 'shared/github/auth';
import {notEmpty} from 'shared/utils';

const MAX_PARENT_COMMITS_TO_FETCH = 10;
const NUM_COMMENTS_TO_FETCH = 10;
const NUM_TIMELINE_ITEMS_TO_FETCH = 100;
const MAX_BLOBS_PER_GRAPHQL_QUERY = 20;

/**
 * Implementation of GitHub client that fetches data via GraphQL.
 */
export default class GraphQLGitHubClient implements GitHubClient {
  private requestHeaders: Record<string, string>;
  private graphQLEndpoint: string;

  /**
   * An instance of GraphQLGitHubClient is specific to a GitHub
   * (hostname, organization, name). To query information about a different
   * repo, create a new instance with a separate set of parameters.
   *
   * @param hostname to use when making API requests. For consumer GitHub, this
   *   is "github.com". For GitHub Enterprise, it should be the hostname for
   *   the GitHub Enterprise (GHE) account. Note that if the GHE hostname is
   *   "foo.example.com", then "foo.example.com" should be passed as the value
   *   of `hostname` rather than "api.foo.example.com".
   * @param organization name of the GitHub organization to which the repository
   *   belongs
   * @param repositoryName name of the GitHub repository within the organization
   * @param token GitHub Personal Access Token (PAT) to authenticate requests
   */
  constructor(
    private hostname: string,
    private organization: string,
    private repositoryName: string,
    token: string,
  ) {
    this.requestHeaders = createRequestHeaders(token);
    this.graphQLEndpoint = createGraphQLEndpointForHostname(hostname);
  }

  async getCommit(oid: GitObjectID): Promise<Commit | null> {
    const variables = {
      oid,
      org: this.organization,
      repo: this.repositoryName,
      numParents: MAX_PARENT_COMMITS_TO_FETCH,
    };

    const data = await this.query<CommitQueryData, CommitQueryVariables>(CommitQuery, variables);
    ++globalCacheStats.gitHubGetCommit;
    const object = data?.repositoryOwner?.repository?.object;

    if (object?.__typename !== 'Commit') {
      return null;
    }

    const {
      id,
      oid: resolvedOid,
      committedDate,
      url,
      message,
      messageBody,
      messageBodyHTML,
      messageHeadline,
      messageHeadlineHTML,
      tree,
      parents: rawParents,
    } = object;
    // TODO(mbolin): Check rawParents.totalCount against MAX_PARENT_COMMITS_TO_FETCH
    const parents = (rawParents?.nodes ?? []).map(obj => obj?.oid).filter(notEmpty);
    return {
      id,
      oid: resolvedOid,
      committedDate,
      url,
      message,
      messageHeadline,
      messageHeadlineHTML,
      messageBody,
      messageBodyHTML,
      parents,
      tree: objectToTree(tree),
    };
  }

  async getTree(oid: GitObjectID): Promise<Tree | null> {
    const variables = {
      org: this.organization,
      repo: this.repositoryName,
      oid,
    };

    const data = await this.query<TreeQueryData, TreeQueryVariables>(TreeQuery, variables);
    ++globalCacheStats.gitHubGetTree;
    return objectToTree(data?.repositoryOwner?.repository?.object);
  }

  async getBlob(oid: GitObjectID): Promise<Blob | null> {
    // At the time of this writing, the GitHub GraphQL API v4 does not appear to
    // support fetching the content for binary blobs. For now, we use GitHub's
    // database API as a workaround.
    const url = `https://api.${this.hostname}/repos/${encodeURIComponent(
      this.organization,
    )}/${encodeURIComponent(this.repositoryName)}/git/blobs/${oid}`;
    const response = await fetchWithRetry(
      url,
      {
        headers: this.requestHeaders,
        method: 'GET',
      },
      `fetch blob ${oid}`,
    );
    ++globalCacheStats.gitHubGetBlob;

    const {status} = response;
    if (status === 404) {
      return null;
    }

    if (!response.ok) {
      throw await githubRestError(response, `fetch blob ${oid}`);
    }

    const json = await response.json();
    const {content, encoding, sha, size, node_id} = json;
    const decodedContent = encoding === 'base64' ? decodeBase64(content) : null;
    // If we were unable to get the text contents, tag blob as binary.
    const isBinary = decodedContent == null || isBinaryContent(decodedContent);
    const text =
      decodedContent != null && !isBinary
        ? // Takes the result of the original base64-encoded string (whose
          // encoded value may contain non-ASCII UTF-8 characters) from the
          // call to atob() and uses a combination of decodeURIComponent()
          // and escape() to ensure the non-ASCII characters are decoded
          // correctly in the resulting JavaScript string.
          //
          // https://stackoverflow.com/a/30106551 details the problem and
          // proposes this code as one of the solutions. Note that this uses
          // the deprecated escape() function, and while we could use an
          // alternative implementation that does not use escape(), using
          // escape() is attractive because it is a built-in and is likely
          // faster than a solution we could code by hand.
          new TextDecoder().decode(decodedContent)
        : content;
    return {
      id: node_id,
      oid: sha,
      byteSize: size,
      isBinary,
      isTruncated: false,
      text,
    };
  }

  async getBlobs(
    oids: GitObjectID[],
    signal?: AbortSignal,
  ): Promise<Map<GitObjectID, Blob | null>> {
    const uniqueOIDs = [...new Set(oids)];
    const batches: GitObjectID[][] = [];
    for (let index = 0; index < uniqueOIDs.length; index += MAX_BLOBS_PER_GRAPHQL_QUERY) {
      batches.push(uniqueOIDs.slice(index, index + MAX_BLOBS_PER_GRAPHQL_QUERY));
    }

    const result = new Map<GitObjectID, Blob | null>();
    const pending = [...batches];
    const fetchNextBatch = async (): Promise<void> => {
      if (signal?.aborted) {
        throw new DOMException('Blob request was cancelled', 'AbortError');
      }
      const batch = pending.pop();
      if (batch == null) {
        return;
      }
      const fetched = await this.getBlobBatch(batch, signal);
      fetched.forEach((blob, oid) => result.set(oid, blob));
      return fetchNextBatch();
    };
    await Promise.all(Array.from({length: Math.min(2, pending.length)}, () => fetchNextBatch()));
    return result;
  }

  private async getBlobBatch(
    oids: GitObjectID[],
    signal?: AbortSignal,
  ): Promise<Map<GitObjectID, Blob | null>> {
    const oidVariables = oids.map((_oid, index) => `$oid${index}: GitObjectID!`).join(', ');
    const selections = oids
      .map(
        (_oid, index) => `blob${index}: object(oid: $oid${index}) {
          ... on Blob { id oid byteSize isBinary isTruncated text }
        }`,
      )
      .join('\n');
    const query = `query ReviewStackBlobs($org: String!, $repo: String!, ${oidVariables}) {
      repositoryOwner(login: $org) {
        repository(name: $repo) { ${selections} }
      }
    }`;
    const variables: Record<string, string> = {
      org: this.organization,
      repo: this.repositoryName,
    };
    oids.forEach((oid, index) => {
      variables[`oid${index}`] = oid;
    });
    const data = await this.query<BlobBatchQueryData, Record<string, string>>(
      query,
      variables,
      signal,
    );
    ++globalCacheStats.gitHubGetBlob;
    const repository = data.repositoryOwner?.repository;
    return new Map(
      oids.map((oid, index) => {
        const object = repository?.[`blob${index}`];
        return [oid, object?.oid === oid ? object : null];
      }),
    );
  }

  async getCommitComparison(
    base: GitObjectID,
    head: GitObjectID,
  ): Promise<CommitComparison | null> {
    // The GitHub GraphQL API v4 does not appear to support comparison of two
    // commits. For now, we use GitHub's REST API `compare` endpoint. The
    // `basehead` param comprises two parts, `base` and `head`, each of which
    // can be either a branch name or commit hash.
    // https://docs.github.com/en/rest/reference/commits#compare-two-commits
    const url = `https://api.${this.hostname}/repos/${encodeURIComponent(
      this.organization,
    )}/${encodeURIComponent(this.repositoryName)}/compare/${base}...${head}`;
    const response = await fetchWithRetry(
      url,
      {
        headers: this.requestHeaders,
        method: 'GET',
      },
      'compare commits',
    );
    ++globalCacheStats.gitHubGetCommitComparison;

    // Specifying an invalid `basehead` returns a 404 Not Found.
    const {status} = response;
    if (status === 404) {
      return null;
    }

    if (!response.ok) {
      throw await githubRestError(response, 'compare commits');
    }

    const json = await response.json();

    return {
      mergeBaseCommit: json.merge_base_commit,
      commits: json.commits,
    };
  }

  async getPullRequest(pr: number): Promise<PullRequest | null> {
    const variables = {
      owner: this.organization,
      name: this.repositoryName,
      pr,
      numComments: NUM_COMMENTS_TO_FETCH,
      numTimelineItems: NUM_TIMELINE_ITEMS_TO_FETCH,
    };
    const data = await this.query<PullRequestQueryData, PullRequestQueryVariables>(
      PullRequestQuery,
      variables,
    );
    ++globalCacheStats.gitHubGetPullRequest;
    return data?.repository?.pullRequest ?? null;
  }

  async getPullRequests(input: PullsQueryInput): Promise<PullsWithPageInfo | null> {
    const variables = {
      ...input,
      labels: input.labels.length === 0 ? null : input.labels,
      owner: this.organization,
      name: this.repositoryName,
    };
    const data = await this.query<PullsQueryData, PullsQueryVariables>(PullsQuery, variables);
    ++globalCacheStats.gitHubGetPullRequests;
    const repository = data.repository;
    if (repository == null) {
      return null;
    }

    const {nodes, pageInfo, totalCount} = repository.pullRequests;
    const pullRequests = (nodes ?? []).filter(notEmpty);

    return {pullRequests, pageInfo, totalCount};
  }

  async getRepoAssignableUsers(query: string | null): Promise<UserFragment[]> {
    const variables = {
      owner: this.organization,
      name: this.repositoryName,
      query,
    };
    const data = await this.query<RepoAssignableUsersQueryData, RepoAssignableUsersQueryVariables>(
      RepoAssignableUsersQuery,
      variables,
    );

    return (data.repository?.assignableUsers?.nodes ?? []).filter(notEmpty);
  }

  async getRepoLabels(query: string | null): Promise<LabelFragment[]> {
    const variables = {
      owner: this.organization,
      name: this.repositoryName,
      query,
    };
    const data = await this.query<RepoLabelsQueryData, RepoLabelsQueryVariables>(
      RepoLabelsQuery,
      variables,
    );

    return (data.repository?.labels?.nodes ?? []).filter(notEmpty);
  }

  async getStackPullRequests(prs: number[]): Promise<StackPullRequestFragment[]> {
    // Note that Repository.pullRequests() in GitHub's GraphQL API supports
    // a number of filters, but unfortunately giving it a set of PR numbers is
    // not one of them, so we have to make a separate GraphQL call for each PR.
    // It would be nice to update this if the API changes.
    const data = await Promise.all(
      prs.map(pr =>
        this.query<StackPullRequestQueryData, StackPullRequestQueryVariables>(
          StackPullRequestQuery,
          {
            owner: this.organization,
            name: this.repositoryName,
            pr,
          },
        ),
      ),
    );

    return data.map(({repository}) => repository?.pullRequest).filter(notEmpty);
  }

  addComment(id: ID, body: string): Promise<AddCommentMutationData> {
    const variables = {
      id,
      body,
    };
    return this.query<AddCommentMutationData, AddCommentMutationVariables>(
      AddCommentMutation,
      variables,
    );
  }

  addLabels(input: AddLabelsToLabelableInput): Promise<AddLabelsToLabelableMutationData> {
    return this.query<AddLabelsToLabelableMutationData, AddLabelsToLabelableMutationVariables>(
      AddLabelsToLabelableMutation,
      {input},
    );
  }

  addPullRequestReview(
    input: AddPullRequestReviewInput,
  ): Promise<AddPullRequestReviewMutationData> {
    return this.query<AddPullRequestReviewMutationData, AddPullRequestReviewMutationVariables>(
      AddPullRequestReviewMutation,
      {input},
    );
  }

  addPullRequestReviewComment(
    input: AddPullRequestReviewCommentInput,
  ): Promise<AddPullRequestReviewCommentMutationData> {
    return this.query<
      AddPullRequestReviewCommentMutationData,
      AddPullRequestReviewCommentMutationVariables
    >(AddPullRequestReviewCommentMutation, {input});
  }

  removeLabels(
    input: RemoveLabelsFromLabelableInput,
  ): Promise<RemoveLabelsFromLabelableMutationData> {
    return this.query<
      RemoveLabelsFromLabelableMutationData,
      RemoveLabelsFromLabelableMutationVariables
    >(RemoveLabelsFromLabelableMutation, {input});
  }

  requestReviews(input: RequestReviewsInput): Promise<RequestReviewsMutationData> {
    return this.query<RequestReviewsMutationData, RequestReviewsMutationVariables>(
      RequestReviewsMutation,
      {input},
    );
  }

  submitPullRequestReview(
    input: SubmitPullRequestReviewInput,
  ): Promise<SubmitPullRequestReviewMutationData> {
    return this.query<
      SubmitPullRequestReviewMutationData,
      SubmitPullRequestReviewMutationVariables
    >(SubmitPullRequestReviewMutation, {input});
  }

  private query<TData, TVariables>(
    query: string,
    variables: TVariables,
    signal?: AbortSignal,
  ): Promise<TData> {
    return queryGraphQL(query, variables, this.requestHeaders, this.graphQLEndpoint, signal);
  }
}

type BlobBatchQueryData = {
  repositoryOwner?: {
    repository?: Record<string, Blob | null> | null;
  } | null;
};

function decodeBase64(content: string): Uint8Array {
  const binary = window.atob(content.replace(/\s/g, ''));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function githubRestError(response: Response, operation: string): Promise<Error> {
  const status = response.status;
  const body = (await response.json().catch(() => null)) as {message?: unknown} | null;
  const apiMessage = typeof body?.message === 'string' ? body.message : response.statusText;
  if (status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = response.headers.get('x-ratelimit-reset');
    const resetMessage =
      reset == null ? '' : ` until ${new Date(Number(reset) * 1000).toLocaleString()}`;
    return new Error(`GitHub rate limit exceeded${resetMessage} while trying to ${operation}.`);
  }
  if (status === 403) {
    return new Error(`GitHub denied permission to ${operation}: ${apiMessage}`);
  }
  if (status === 422) {
    return new Error(`GitHub rejected the request to ${operation}: ${apiMessage}`);
  }
  return new Error(`GitHub API error ${status} while trying to ${operation}: ${apiMessage}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objectToTree(object: any): Tree {
  const {id, oid, entries} = object;
  return {
    id,
    oid,
    entries,
  };
}

/**
 * https://stackoverflow.com/a/6134127/396304 identifies the logic in Git
 * itself for determining whether a file is binary. It appears the heuristic
 * is "if there is a NUL in the first 8000 bytes, assume binary," so that's
 * what we implement here.
 */
function isBinaryContent(blob: Uint8Array): boolean {
  const maxLen = Math.min(8000, blob.length);
  for (let i = 0; i < maxLen; ++i) {
    if (blob[i] === 0) {
      return true;
    }
  }
  return false;
}
