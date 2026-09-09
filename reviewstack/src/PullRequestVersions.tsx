/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import PullRequestLatestVersionLink from './PullRequestLatestVersionLink';
import PullRequestReviewMode from './PullRequestReviewMode';
import PullRequestVersionSelector from './PullRequestVersionSelector';
import {
  gitHubOrgAndRepoAtom,
  gitHubPullRequestComparableVersionsAtom,
  gitHubPullRequestIDAtom,
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestSelectedVersionIndexAtom,
  gitHubPullRequestVersionsAtom,
} from './jotai';
import {parseReviewURL, resolveReviewSelection, updateReviewURL} from './reviewURL';
import {Box} from '@primer/react';
import {useAtomValue, useSetAtom} from 'jotai';
import {useCallback, useEffect} from 'react';

export default function PullRequestVersions(): React.ReactElement | null {
  const {org, repo} = useAtomValue(gitHubOrgAndRepoAtom) ?? {};
  const pullRequestID = useAtomValue(gitHubPullRequestIDAtom);
  const versions = useAtomValue(gitHubPullRequestVersionsAtom);
  const setSelectedVersionIndex = useSetAtom(gitHubPullRequestSelectedVersionIndexAtom);
  const setReviewTarget = useSetAtom(gitHubPullRequestReviewTargetAtom);

  const setComparableVersions = useSetAtom(gitHubPullRequestComparableVersionsAtom);

  const applyURLState = useCallback(() => {
    if (versions.length === 0) {
      return;
    }
    const urlState = parseReviewURL(window.location.search);
    const selection = resolveReviewSelection(versions, urlState);
    if (selection == null) {
      return;
    }
    const {commitID, version, versionIndex} = selection;

    setSelectedVersionIndex(versionIndex);
    setComparableVersions({beforeCommitID: null, afterCommitID: version.headCommit});
    if (commitID != null) {
      setReviewTarget({type: 'commit', commitID});
    } else {
      setReviewTarget({type: 'layer'});
    }

    // Canonicalize stale or incomplete query state for reliable sharing.
    updateReviewURL(
      {
        mode: commitID != null ? 'commit' : 'layer',
        commitID,
        versionID: version.headCommit,
      },
      'replace',
    );
  }, [setComparableVersions, setReviewTarget, setSelectedVersionIndex, versions]);

  useEffect(() => {
    applyURLState();
  }, [applyURLState, org, pullRequestID, repo]);

  useEffect(() => {
    window.addEventListener('popstate', applyURLState);
    return () => window.removeEventListener('popstate', applyURLState);
  }, [applyURLState]);

  if (org == null || repo == null) {
    return null;
  }

  return (
    <Box display="flex" alignItems="center" gridGap={2}>
      <PullRequestReviewMode />
      <PullRequestVersionSelector org={org} repo={repo} />
      <PullRequestLatestVersionLink />
    </Box>
  );
}
