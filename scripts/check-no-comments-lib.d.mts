export { NO_COMMENTS_MESSAGE } from "./eslint-rules/no-comments.mjs";

export type CommentLanguage =
  | "yaml"
  | "toml"
  | "sql"
  | "css"
  | "json"
  | "xml"
  | "patch"
  | "dotenv"
  | "gitignore"
  | "gitattributes"
  | "npmrc";
export type CommentCheck = "generated" | "check-no-comments" | "ESLint" | "documentation" | "no comment syntax";
export interface FoundComment {
  line: number;
  language: string;
}

export const GENERATED_FILES: readonly string[];
export const WORKFLOWS_AWAITING_A_PERSON: readonly string[];
export const DOCUMENTATION_FORMATS: readonly string[];
export const FORMATS_WITHOUT_COMMENTS: readonly string[];

export function checkedLanguage(file: string): CommentLanguage | null;
export function awaitsAPerson(file: string): boolean;
export function commentCheckOf(file: string): CommentCheck | null;
export function filesGitTracksOrWouldTrack(): string[];
export function findComments(file: string, text: string): FoundComment[];
