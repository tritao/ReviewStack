/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Theme} from '@primer/react/lib/ThemeProvider';

import {useTheme} from '@primer/react';
import React from 'react';

/**
 * React component that dynamically generates a <style> element using values
 * from the active Primer theme. Normally, we can rely on specifying the `sx`
 * prop for our React components, but for <BodyHTML>, we get the HTML as an
 * opaque string, so we cannot leverage `sx`.
 */
// eslint-disable-next-line prefer-arrow-callback
export default React.memo(function PrimerStyles(): React.ReactElement {
  const {theme} = useTheme();
  return (
    <style>
      {`
${defineStyleOnBody(theme)}

.PRT-review-comment-text {
  font-size: 13px;
  line-height: 16px;
}

.reviewstack .drawer-label {
  background-color: ${theme?.colors.neutral.muted};
}

.reviewstack {
  --panel-view-border: ${theme?.colors.border.default};
}

/* Primer renders menus and dialogs here. Keep transient UI above sticky review content. */
#__primerPortalRoot__ {
  z-index: 100;
}
`}
    </style>
  );
});

/**
 * Defining a style on <body> admittedly makes <App> "less portable" because it
 * imposes requirements on the look of the host page, but this is the most
 * straightforward way to ensure things look right when <App> is less than the
 * height of the full page. We can make this an option on the props for <App>
 * if it becomes an issue.
 */
function defineStyleOnBody(theme: Theme | undefined) {
  return `\
body {
  background-color: ${theme?.colors.canvas.default};
}`;
}
