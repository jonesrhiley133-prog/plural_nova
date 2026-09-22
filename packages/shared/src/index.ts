export * from './ids.js';
export * from './time.js';
export * from './types.js';
export * from './collections/index.js';
export * from './emotions.js';
export * from './terminology.js';
export * from './themes.js';
export * from './color.js';
export * from './achievements.js';
export * from './navigation.js';
export * from './backup.js';
export * from './settings.js';
export * from './validation.js';
export * from './analytics.js';
export * from './strings.js';
export * from './demo.js';

export const APP_NAME = 'PluralNova';
/**
 * Kept in step with package.json by a test, not by memory.
 *
 * It cannot simply read package.json: this module is bundled into the browser,
 * where there is no package.json to read. So it is written twice and checked
 * once — the Android versionCode is derived from the npm version, and a
 * mismatch would have the app reporting a version it is not.
 */
export const APP_VERSION = '1.0.2';
/** Bumped whenever the wire shape of the API changes incompatibly. */
export const API_VERSION = 1;
