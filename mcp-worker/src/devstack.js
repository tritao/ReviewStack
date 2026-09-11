const DEVSTACK_METADATA = /<!--\s*DEVSTACK:REVIEWSTACK\s+({[\s\S]*?})\s*-->/;
const GIT_OBJECT_ID = /^[0-9a-f]{40}$/;

/**
 * Keep this parser in the MCP worker in sync with reviewstack/src/devstackStack.ts.
 * The worker cannot import the browser package because the latter includes
 * React/Jotai code and is built for a different runtime.
 */
export function parseDevstackStackBodyResult(body) {
  const match = body.match(DEVSTACK_METADATA);
  if (match == null) {
    return body.includes('DEVSTACK:REVIEWSTACK')
      ? {type: 'invalid', message: 'The DEVSTACK:REVIEWSTACK comment is malformed.'}
      : {type: 'absent'};
  }

  try {
    const metadata = JSON.parse(match[1]);
    if (
      (metadata.version !== 1 && metadata.version !== 2) ||
      !Number.isInteger(metadata.current) ||
      !Array.isArray(metadata.stack)
    ) {
      return {
        type: 'invalid',
        message: 'Devstack metadata must use version 1 or 2 and contain current and stack fields.',
      };
    }

    const stack = metadata.stack.map(entry => {
      const exactCommits = Array.isArray(entry?.commits) ? entry.commits : undefined;
      return {
        number: entry?.number,
        numCommits: exactCommits?.length ?? entry?.commits,
        ...(exactCommits == null ? {} : {commits: exactCommits}),
      };
    });

    const hasWrongCommitShape = metadata.stack.some(entry => {
      const commits = entry?.commits;
      return metadata.version === 1 ? !Number.isInteger(commits) : !Array.isArray(commits);
    });

    if (
      hasWrongCommitShape ||
      stack.some(
        entry =>
          !Number.isInteger(entry.number) ||
          entry.number < 1 ||
          !Number.isInteger(entry.numCommits) ||
          entry.numCommits < 1 ||
          (entry.commits != null &&
            entry.commits.some(oid => typeof oid !== 'string' || !GIT_OBJECT_ID.test(oid))),
      )
    ) {
      return {
        type: 'invalid',
        message:
          'Every devstack layer needs a positive PR number and the commit representation required by its metadata version.',
      };
    }

    const currentStackEntry = stack.findIndex(entry => entry.number === metadata.current);
    if (
      currentStackEntry === -1 ||
      stack.some((entry, index) => index !== currentStackEntry && entry.number === metadata.current)
    ) {
      return {
        type: 'invalid',
        message: 'The current PR must occur exactly once in the devstack layer list.',
      };
    }

    return {
      type: 'valid',
      metadata: {
        version: metadata.version,
        stack,
        currentStackEntry,
      },
    };
  } catch {
    return {type: 'invalid', message: 'The devstack metadata comment does not contain valid JSON.'};
  }
}
