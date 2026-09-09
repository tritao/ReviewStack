import {fetchWithRetry, GITHUB_RETRY_EVENT} from './fetchWithRetry';

const ok = () => new Response('{}', {status: 200});

afterEach(() => jest.restoreAllMocks());

test('retries transient responses with exponential backoff', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response('', {status: 503}))
    .mockResolvedValue(ok());
  const sleep = jest.fn().mockResolvedValue(undefined);
  await expect(
    fetchWithRetry('/api', {}, 'load PR', {sleep, random: () => 0.5}),
  ).resolves.toHaveProperty('status', 200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(500, undefined);
});

test('honors Retry-After', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response('', {status: 429, headers: {'retry-after': '2'}}))
    .mockResolvedValue(ok());
  const sleep = jest.fn().mockResolvedValue(undefined);
  await fetchWithRetry('/api', {}, 'load PR', {sleep});
  expect(sleep).toHaveBeenCalledWith(2000, undefined);
});

test('announces retry progress for the UI', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response('', {status: 503}))
    .mockResolvedValue(ok());
  const listener = jest.fn();
  globalThis.addEventListener(GITHUB_RETRY_EVENT, listener);
  try {
    await fetchWithRetry('/api', {}, 'load pull request', {
      sleep: async () => {},
      random: () => 0.5,
    });
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      attempt: 1,
      delayMs: 500,
      maxAttempts: 3,
      operation: 'load pull request',
    });
  } finally {
    globalThis.removeEventListener(GITHUB_RETRY_EVENT, listener);
  }
});

test('does not retry a distant rate-limit reset', async () => {
  const response = new Response('', {
    status: 403,
    headers: {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '200'},
  });
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
  await expect(fetchWithRetry('/api', {}, 'load PR', {now: () => 0})).resolves.toBe(response);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('retries network failures but not permanent responses', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(ok());
  await fetchWithRetry('/api', {}, 'load PR', {sleep: async () => {}});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockClear().mockResolvedValue(new Response('', {status: 401}));
  await expect(fetchWithRetry('/api', {}, 'load PR')).resolves.toHaveProperty('status', 401);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('stops after the attempt limit', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', {status: 502}));
  await expect(
    fetchWithRetry('/api', {}, 'load PR', {maxAttempts: 3, sleep: async () => {}}),
  ).resolves.toHaveProperty('status', 502);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('cancels during backoff', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', {status: 503}));
  const controller = new AbortController();
  const pending = fetchWithRetry('/api', {signal: controller.signal}, 'load PR');
  controller.abort();
  await expect(pending).rejects.toMatchObject({name: 'AbortError'});
});
