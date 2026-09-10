/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import GraphQLGitHubClient from './GraphQLGitHubClient';
import {TextDecoder as NodeTextDecoder} from 'util';

const OID_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OID_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

Object.defineProperty(global, 'TextDecoder', {value: NodeTextDecoder, configurable: true});

function client(): GraphQLGitHubClient {
  return new GraphQLGitHubClient('github.com', 'FreeCAD', 'FreeCAD', 'token');
}

function mockResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
    ...init,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('returns null only for a missing REST blob', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(mockResponse({message: 'Not Found'}, {status: 404}));
  await expect(client().getBlob(OID_A)).resolves.toBeNull();
});

test('returns null for a missing GraphQL tree object', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(mockResponse({data: {repositoryOwner: {repository: {object: null}}}}));
  await expect(client().getTree(OID_A)).resolves.toBeNull();
});

test('returns null for a commit without a root tree', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    mockResponse({
      data: {
        repositoryOwner: {
          repository: {
            object: {
              __typename: 'Commit',
              id: 'commit-node',
              oid: OID_A,
              committedDate: '2024-01-01T00:00:00Z',
              url: 'https://github.com/FreeCAD/FreeCAD/commit/a',
              message: 'message',
              messageBody: '',
              messageBodyHTML: '',
              messageHeadline: 'message',
              messageHeadlineHTML: 'message',
              tree: null,
              parents: {nodes: [], totalCount: 0},
            },
          },
        },
      },
    }),
  );
  await expect(client().getCommit(OID_A)).resolves.toBeNull();
});

test('reports a REST rate limit instead of treating it as a missing blob', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      mockResponse(
        {message: 'API rate limit exceeded'},
        {status: 403, headers: {'x-ratelimit-remaining': '0'}},
      ),
    );
  await expect(client().getBlob(OID_A)).rejects.toThrow('GitHub rate limit exceeded');
});

test('decodes UTF-8 REST blob content without deprecated escape conversion', async () => {
  const content = 'T2zDoSwgRnJlZUNBRCE=';
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      mockResponse({content, encoding: 'base64', node_id: 'node', sha: OID_A, size: 14}),
    );
  await expect(client().getBlob(OID_A)).resolves.toMatchObject({
    oid: OID_A,
    isBinary: false,
    text: 'Olá, FreeCAD!',
  });
});

test('loads multiple text blobs in one GraphQL request', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
    mockResponse({
      data: {
        repositoryOwner: {
          repository: {
            blob0: {
              id: 'node-a',
              oid: OID_A,
              byteSize: 3,
              isBinary: false,
              isTruncated: false,
              text: 'one',
            },
            blob1: {
              id: 'node-b',
              oid: OID_B,
              byteSize: 3,
              isBinary: false,
              isTruncated: false,
              text: 'two',
            },
          },
        },
      },
    }),
  );

  const blobs = await client().getBlobs([OID_A, OID_B, OID_A]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(blobs.get(OID_A)?.text).toBe('one');
  expect(blobs.get(OID_B)?.text).toBe('two');
  const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
  expect(request.query).toContain('blob0: object');
  expect(request.query).toContain('blob1: object');
});

test('does not start batch requests after cancellation', async () => {
  const fetchMock = jest.spyOn(global, 'fetch');
  const controller = new AbortController();
  controller.abort();
  await expect(client().getBlobs([OID_A], controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
