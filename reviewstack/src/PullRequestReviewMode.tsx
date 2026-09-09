/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  gitHubPullRequestComparableVersionsAtom,
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestSelectedVersionCommitsAtom,
  gitHubPullRequestSelectedVersionIndexAtom,
  gitHubPullRequestVersionsAtom,
} from './jotai';
import {updateReviewURL} from './reviewURL';
import {shortOid} from './utils';
import {ActionList, ActionMenu, Button, ButtonGroup} from '@primer/react';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';
import {useEffect} from 'react';

export default function PullRequestReviewMode(): React.ReactElement {
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const versions = useAtomValue(gitHubPullRequestVersionsAtom);
  const selectedVersionIndex = useAtomValue(gitHubPullRequestSelectedVersionIndexAtom);
  const [target, setTarget] = useAtom(gitHubPullRequestReviewTargetAtom);
  const setComparableVersions = useSetAtom(gitHubPullRequestComparableVersionsAtom);
  const selectedIndex =
    target.type === 'commit' ? commits.findIndex(commit => commit.commit === target.commitID) : -1;

  useEffect(() => {
    if (target.type === 'commit' && selectedIndex === -1) {
      setTarget({type: 'layer'});
    }
  }, [selectedIndex, setTarget, target.type]);

  const selectLayer = () => {
    setTarget({type: 'layer'});
    const version = versions[selectedVersionIndex];
    setComparableVersions(
      version == null ? null : {beforeCommitID: null, afterCommitID: version.headCommit},
    );
    updateReviewURL({mode: 'layer', commitID: null});
  };
  const selectCommit = (index: number) => {
    const commit = commits[index];
    if (commit != null) {
      setTarget({type: 'commit', commitID: commit.commit});
      updateReviewURL({mode: 'commit', commitID: commit.commit});
    }
  };

  return (
    <>
      <ButtonGroup>
        <Button
          title="Review only the changes introduced by this pull-request layer"
          variant={target.type === 'layer' ? 'primary' : 'default'}
          onClick={selectLayer}>
          Layer
        </Button>
        <Button
          variant={target.type === 'commit' ? 'primary' : 'default'}
          title="Review one commit from this version at a time"
          disabled={commits.length === 0}
          onClick={() => selectCommit(selectedIndex === -1 ? commits.length - 1 : selectedIndex)}>
          Commit
        </Button>
      </ButtonGroup>
      {target.type === 'commit' && (
        <>
          <Button disabled={selectedIndex <= 0} onClick={() => selectCommit(selectedIndex - 1)}>
            Previous
          </Button>
          <ActionMenu>
            <ActionMenu.Button>
              {selectedIndex + 1}/{commits.length} · {shortOid(target.commitID)}
            </ActionMenu.Button>
            <ActionMenu.Overlay width="large">
              <ActionList selectionVariant="single">
                {commits.map((commit, index) => (
                  <ActionList.Item
                    key={commit.commit}
                    selected={index === selectedIndex}
                    onSelect={() => selectCommit(index)}>
                    {index + 1}. {commit.title}
                  </ActionList.Item>
                ))}
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
          <Button
            disabled={selectedIndex === -1 || selectedIndex >= commits.length - 1}
            onClick={() => selectCommit(selectedIndex + 1)}>
            Next
          </Button>
        </>
      )}
    </>
  );
}
