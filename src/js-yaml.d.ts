declare module "js-yaml" {
  export function load(source: string): unknown;
  export function dump(
    value: unknown,
    options?: {
      noRefs?: boolean;
      lineWidth?: number;
      sortKeys?: boolean;
    }
  ): string;

  const yaml: {
    load: typeof load;
    dump: typeof dump;
  };

  export default yaml;
}
