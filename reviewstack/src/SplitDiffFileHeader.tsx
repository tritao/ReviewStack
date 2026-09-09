/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {useReviewProgress} from './reviewProgress';
import {ChevronDownIcon, ChevronRightIcon} from '@primer/octicons-react';
import {Box, Checkbox, Text, Tooltip} from '@primer/react';

export function FileHeader({
  path,
  open,
  onChangeOpen,
}: {
  path: string;
  open?: boolean;
  onChangeOpen?: (open: boolean) => void;
}) {
  const [viewed, toggleViewed] = useReviewProgress('file', path);
  // Even though the enclosing <SplitDiffView> will have border-radius set, we
  // have to define it again here or things don't look right.
  const color = 'fg.muted';

  const pathSeparator = '/';
  const pathParts = path.split(pathSeparator);

  const filePathParts = (
    <Text fontFamily="mono" fontSize={12} sx={{flexGrow: 1}}>
      {pathParts.reduce((acc, part, idx) => {
        // Nest path parts in a particular way so we can use plain CSS
        // hover selectors to underline nested sub-paths.
        const pathSoFar = pathParts.slice(idx).join(pathSeparator);
        return (
          <span className="file-header-copyable-path" key={idx}>
            {acc}
            <PathTooltip
              text={`Copy ${pathSoFar}`}
              direction="se"
              className="file-header-path-element">
              <span
                onClick={() => {
                  navigator.clipboard.writeText(pathSoFar);
                }}>
                {part}
                {idx < pathParts.length - 1 ? pathSeparator : ''}
              </span>
            </PathTooltip>
          </span>
        );
      }, <span />)}
    </Text>
  );

  return (
    <Box
      className="split-diff-view-file-header"
      display="flex"
      alignItems="center"
      bg="accent.subtle"
      color={color}
      paddingX={2}
      paddingY={1}
      lineHeight={2}
      backgroundColor="canvas.subtle"
      borderTopRightRadius={2}
      borderTopLeftRadius={2}
      borderBottomColor="border.default"
      borderBottomStyle="solid"
      borderBottomWidth="1px">
      {onChangeOpen && (
        <Box
          paddingRight={2}
          onClick={() => onChangeOpen(!open)}
          sx={{
            cursor: 'pointer',
            display: 'flex',
          }}>
          {open ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
        </Box>
      )}
      <Box sx={{display: 'flex', flexGrow: 1}}>{filePathParts}</Box>
      <Box as="label" display="flex" alignItems="center" gridGap={1} marginLeft={2}>
        <Checkbox checked={viewed} onChange={toggleViewed} aria-label={`Mark ${path} as viewed`} />
        <Text fontSize={12}>Viewed</Text>
      </Box>
    </Box>
  );
}
const PathTooltip = Tooltip as unknown as React.ComponentType<{
  text: string;
  direction?: 'se';
  className?: string;
  children: React.ReactNode;
}>;
