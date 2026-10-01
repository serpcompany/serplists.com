export type CodeConvention = { selector: string; message: string; owners?: string[] };

export const APP_CONVENTIONS: CodeConvention[];
export const API_CONVENTIONS: CodeConvention[];
export const SCRIPT_CONVENTIONS: CodeConvention[];
export const BROWSER_AND_INTEGRATION_TEST_CONVENTIONS: CodeConvention[];
