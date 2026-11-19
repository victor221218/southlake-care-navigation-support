import path from 'node:path';
import project from '../package.json' with { type: 'json' };

export const APP_NAME = project.productName;
// Keep the existing storage and installation identity so upgrades retain accounts and memory.
export const LEGACY_DATA_FOLDER = 'Southlake Hive';
export const windowsDataDirectory = (appData, override) => override && path.isAbsolute(override)
  ? override : path.join(appData, LEGACY_DATA_FOLDER);
