export type CodeConvention = { selector: string; message: string; owners?: string[] };

export const APP_CONVENTIONS: CodeConvention[];
export const API_CONVENTIONS: CodeConvention[];
export const SCRIPT_CONVENTIONS: CodeConvention[];
export const BROWSER_TEST_CONVENTIONS: CodeConvention[];
export const INTEGRATION_TEST_CONVENTIONS: CodeConvention[];
export const E2E_TEMPLATE_PAGES: string[];
export const E2E_TEMPLATE_API_SLUGS: string[];
export const DELIBERATELY_MISSING_PREFIX: string;
