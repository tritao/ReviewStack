import {
  createRestApiEndpointForHostname,
  fetchGitHubNotifications,
  getNotificationSubject,
} from './notifications';

afterEach(() => jest.restoreAllMocks());

test('uses the GitHub and Enterprise REST API endpoints', () => {
  expect(createRestApiEndpointForHostname('github.com')).toBe('https://api.github.com');
  expect(createRestApiEndpointForHostname('github.example.com')).toBe(
    'https://github.example.com/api/v3',
  );
});

test('filters unread notifications to pull-request and issue attention reasons', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify([
        {
          id: 'mention-1',
          reason: 'mention',
          updated_at: '2026-09-10T10:00:00Z',
          repository: {full_name: 'FreeCAD/FreeCAD'},
          subject: {
            title: 'Fix the selector',
            type: 'PullRequest',
            url: 'https://api.github.com/repos/FreeCAD/FreeCAD/pulls/123',
          },
        },
        {
          id: 'comment-1',
          reason: 'comment',
          updated_at: '2026-09-10T09:00:00Z',
          repository: {full_name: 'FreeCAD/FreeCAD'},
          subject: {
            title: 'Unrelated',
            type: 'PullRequest',
            url: 'https://api.github.com/repos/FreeCAD/FreeCAD/pulls/124',
          },
        },
        {
          id: 'issue-1',
          reason: 'mention',
          updated_at: '2026-09-10T08:00:00Z',
          repository: {full_name: 'FreeCAD/FreeCAD'},
          subject: {
            title: 'Issue',
            type: 'Issue',
            url: 'https://api.github.com/repos/FreeCAD/FreeCAD/issues/125',
          },
        },
      ]),
      {status: 200},
    ),
  );

  await expect(fetchGitHubNotifications('github.com', 'token')).resolves.toEqual([
    {
      id: 'mention-1',
      reason: 'mention',
      updatedAt: '2026-09-10T10:00:00Z',
      repositoryNameWithOwner: 'FreeCAD/FreeCAD',
      subjectTitle: 'Fix the selector',
      subjectType: 'PullRequest',
      subjectUrl: 'https://api.github.com/repos/FreeCAD/FreeCAD/pulls/123',
    },
    {
      id: 'issue-1',
      reason: 'mention',
      updatedAt: '2026-09-10T08:00:00Z',
      repositoryNameWithOwner: 'FreeCAD/FreeCAD',
      subjectTitle: 'Issue',
      subjectType: 'Issue',
      subjectUrl: 'https://api.github.com/repos/FreeCAD/FreeCAD/issues/125',
    },
  ]);
  expect(String(fetchMock.mock.calls[0][0])).toBe(
    'https://api.github.com/notifications?all=false&participating=true&per_page=50',
  );
});

test('extracts a subject route from a notification', () => {
  const notification = {
    id: '1',
    reason: 'mention' as const,
    updatedAt: '2026-09-10T10:00:00Z',
    repositoryNameWithOwner: 'FreeCAD/FreeCAD',
    subjectTitle: 'Fix the selector',
    subjectType: 'PullRequest',
    subjectUrl: 'https://api.github.com/repos/FreeCAD/FreeCAD/issues/123',
  };
  expect(getNotificationSubject(notification)).toEqual({
    repositoryNameWithOwner: 'FreeCAD/FreeCAD',
    number: 123,
    subjectType: 'PullRequest',
  });
  expect(
    getNotificationSubject({
      ...notification,
      subjectType: 'Issue',
      subjectUrl: 'https://api.github.com/repos/FreeCAD/FreeCAD/issues/123',
    }),
  ).toEqual({
    repositoryNameWithOwner: 'FreeCAD/FreeCAD',
    number: 123,
    subjectType: 'Issue',
  });
});
