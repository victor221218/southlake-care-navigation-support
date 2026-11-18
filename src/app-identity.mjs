import path from 'node:path';

export const APP_NAME = 'Southlake Care Navigation Support';
// Keep the existing storage and installation identity so upgrades retain accounts and memory.
export const LEGACY_DATA_FOLDER = 'Southlake Hive';
export const windowsDataDirectory = (appData, override) => override && path.isAbsolute(override)
  ? override : path.join(appData, LEGACY_DATA_FOLDER);
