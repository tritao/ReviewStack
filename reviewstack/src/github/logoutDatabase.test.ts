/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {closeDatabaseOnVersionChange} from './databaseLifecycle';

test('closes an IndexedDB connection when deletion requests a version change', () => {
  const db = {onversionchange: null, close: jest.fn()} as unknown as IDBDatabase;
  closeDatabaseOnVersionChange(db);
  expect(db.onversionchange).not.toBeNull();
  db.onversionchange?.({} as IDBVersionChangeEvent);
  expect(db.close).toHaveBeenCalledTimes(1);
});
