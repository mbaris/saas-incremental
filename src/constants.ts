/** One simulation tick is a game-time unit; browser speed only changes tick frequency. */
export const DAY = 12;
export const MONTH = DAY * 30;
export const SAVE_VERSION = 16;
export const SAVE_KEY = `saas-incremental.save.v${SAVE_VERSION}`;

export const MAX_DRAFTS = 6;
export const QUEUE_LIMIT = 5;
export const CASH_GRACE = 3 * DAY;
export const CASH_SUSPEND = 14 * DAY;
export const CASH_CLOSE = 30 * DAY;
