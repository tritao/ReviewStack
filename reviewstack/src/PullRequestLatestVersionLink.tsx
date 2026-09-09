/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  gitHubPullRequestComparableVersionsAtom,
  gitHubPullRequestIsViewingLatestAtom,
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestSelectedVersionIndexAtom,
  gitHubPullRequestVersionsAtom,
} from './jotai';
import {updateReviewURL} from './reviewURL';
import {ArrowLeftIcon} from '@primer/octicons-react';
import {Link, Text} from '@primer/react';
import {useAtomValue, useSetAtom} from 'jotai';
import {useCallback} from 'react';

export default function PullRequestLatestVersionLink(): React.ReactElement | null {
  const versions = useAtomValue(gitHubPullRequestVersionsAtom);
  const setSelectedVersionIndex = useSetAtom(gitHubPullRequestSelectedVersionIndexAtom);
  const setComparableVersions = useSetAtom(gitHubPullRequestComparableVersionsAtom);
  const setReviewTarget = useSetAtom(gitHubPullRequestReviewTargetAtom);
  const isViewingLatest = useAtomValue(gitHubPullRequestIsViewingLatestAtom);

  const onClick = useCallback(() => {
    // Reset to latest version
    const latestVersionIndex = Math.max(0, versions.length - 1);
    const latestVersion = versions[latestVersionIndex];
    setSelectedVersionIndex(latestVersionIndex);
    if (latestVersion != null) {
      setComparableVersions({
        // null means "use this version's recorded baseParent". This preserves
        // stack-aware bases instead of treating the base as another PR version.
        beforeCommitID: null,
        afterCommitID: latestVersion.headCommit,
      });
      setReviewTarget({type: 'layer'});
      updateReviewURL({mode: 'layer', commitID: null, versionID: latestVersion.headCommit});
    }
  }, [versions, setSelectedVersionIndex, setComparableVersions, setReviewTarget]);

  if (isViewingLatest) {
    return null;
  }

  return (
    <Link as="button" onClick={onClick}>
      <ArrowLeftIcon />
      <Text fontSize={0} fontWeight="bold" marginLeft={1}>
        Back to Latest
      </Text>
    </Link>
  );
}
