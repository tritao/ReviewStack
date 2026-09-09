/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Box} from '@primer/react';

export default function StyledOcticon({
  icon,
  color,
}: {
  icon: React.ElementType;
  color?: string;
}): React.ReactElement {
  return <Box as={icon} color={color} />;
}
