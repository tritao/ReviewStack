/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {VersionCommit} from './github/types';

import {
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestSelectedVersionCommitsAtom,
} from './jotai';
import {isLongCommitMessage} from './selectedCommitMessage';
import {shortOid} from './utils';
import {ChevronDownIcon, ChevronUpIcon} from '@primer/octicons-react';
import {Box, Button, Heading, Text} from '@primer/react';
import {useAtomValue} from 'jotai';
import {useEffect, useState} from 'react';

export default function SelectedCommitContext(): React.ReactElement | null {
  const target = useAtomValue(gitHubPullRequestReviewTargetAtom);
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const [expanded, setExpanded] = useState(false);
  const selectedIndex =
    target.type === 'commit' ? commits.findIndex(commit => commit.commit === target.commitID) : -1;
  const commit = commits[selectedIndex];

  useEffect(() => setExpanded(false), [commit?.commit]);

  if (target.type !== 'commit' || commit == null) {
    return null;
  }

  return (
    <Box
      className="selected-commit-context"
      borderWidth={1}
      borderStyle="solid"
      borderColor="border.default"
      borderRadius={4}
      padding={3}>
      <Text display="block" color="fg.muted" fontSize={0}>
        Commit {selectedIndex + 1} of {commits.length} · {shortOid(commit.commit)} ·{' '}
        {commit.author != null ? `${commit.author} · ` : ''}
        {new Date(commit.committedDate).toLocaleDateString()}
      </Text>
      <Heading as="h2" sx={{fontSize: 2, mt: 1}}>
        {commit.title}
      </Heading>
      <CommitMessageBody commit={commit} expanded={expanded} onChangeExpanded={setExpanded} />
    </Box>
  );
}

function CommitMessageBody({
  commit,
  expanded,
  onChangeExpanded,
}: {
  commit: VersionCommit;
  expanded: boolean;
  onChangeExpanded: (expanded: boolean) => void;
}): React.ReactElement | null {
  const body = commit.messageBody?.trim();
  if (body == null || body === '') {
    return null;
  }
  const collapsible = isLongCommitMessage(body);
  return (
    <Box marginTop={2}>
      <Text
        as="div"
        className={collapsible && !expanded ? 'selected-commit-message-collapsed' : undefined}
        sx={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
        {body}
      </Text>
      {collapsible && (
        <Button
          size="small"
          variant="invisible"
          trailingVisual={expanded ? ChevronUpIcon : ChevronDownIcon}
          aria-expanded={expanded}
          onClick={() => onChangeExpanded(!expanded)}
          sx={{mt: 1}}>
          {expanded ? 'Collapse' : 'Show full message'}
        </Button>
      )}
    </Box>
  );
}
