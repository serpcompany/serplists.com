export const HISTORY_DISPLAY_LIMIT = 8;
export const HISTORY_FULL_LIMIT = 100;

export const historyLimitFor = (showingAll: boolean): number => (showingAll ? HISTORY_FULL_LIMIT : HISTORY_DISPLAY_LIMIT);
