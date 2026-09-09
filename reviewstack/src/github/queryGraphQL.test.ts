import queryGraphQL from './queryGraphQL';

const request = (query = 'query Test { viewer { login } }') =>
  queryGraphQL(query, {}, {}, 'https://api.github.test/graphql');

afterEach(() => jest.restoreAllMocks());

test('retries GraphQL rate-limit responses', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      new Response(JSON.stringify({errors: [{type: 'RATE_LIMITED', message: 'slow down'}]}), {
        status: 200,
      }),
    )
    .mockResolvedValue(new Response(JSON.stringify({data: {viewer: {login: 'test'}}})));
  await expect(request()).resolves.toEqual({viewer: {login: 'test'}});
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('does not retry GraphQL validation errors', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({errors: [{type: 'GRAPHQL_VALIDATION_FAILED', message: 'bad'}]})),
    );
  await expect(request()).rejects.toBe('Error: bad');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('does not replay mutations after a transient response', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response('', {status: 503, statusText: 'Unavailable'}));
  await expect(
    request('mutation Test { addComment(input: {}) { clientMutationId } }'),
  ).rejects.toBe('HTTP request error: 503: Unavailable');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
