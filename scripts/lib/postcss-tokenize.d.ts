declare module "postcss/lib/tokenize" {
  import type { Input } from "postcss";

  export interface Tokenizer {
    nextToken(): unknown;
    endOfFile(): boolean;
  }

  export default function tokenizer(input: Input, options?: { ignoreErrors?: boolean }): Tokenizer;
}
