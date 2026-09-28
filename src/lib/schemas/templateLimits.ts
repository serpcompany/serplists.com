// Field limits the API enforces (functions/api/utils/payloads.ts). Every server write path
// and the app use the same numbers, so a stored row always fits when a client sends it back.

export const TEMPLATE_TITLE_MAX = 160;
export const TEMPLATE_DESCRIPTION_MAX = 5000;
export const TEMPLATE_SEO_TITLE_MAX = 160;
export const TEMPLATE_SEO_DESCRIPTION_MAX = 320;
export const TEMPLATE_LIST_MAX_ITEMS = 20;
export const TEMPLATE_LIST_ITEM_MAX = 80;
export const TEMPLATE_SLUG_MAX = 160;
export const TEAM_SLUG_MAX = 120;
export const RUN_TITLE_MAX = 160;
