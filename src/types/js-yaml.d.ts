// The installed js-yaml package has no declarations. Keep parsing unknown until
// the existing Zod schemas validate it; document only the API this app consumes.
declare module 'js-yaml' {
  interface DumpOptions {
    noRefs?: boolean;
    lineWidth?: number;
    sortKeys?: boolean | ((left: string, right: string) => number);
  }
  const yaml: {
    load(source: string): unknown;
    dump(value: unknown, options?: DumpOptions): string;
  };
  export default yaml;
}
