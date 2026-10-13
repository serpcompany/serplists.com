export type Route = { kind: "skip" } | { kind: "install"; checkout: string } | { kind: "run"; checkout: string; script: string };

export declare function withoutGitLocation(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function gitOutput(folder: string, ...args: string[]): string;
export declare function owningCheckout(folder: string): string | undefined;
export declare function ignoredByGit(file: string, folder: string): boolean;
export declare function routeHook(checkout: string | undefined, script: string, has?: (path: string) => boolean): Route;
export declare function installAdvice(checkout: string): string;
export declare function refuseUninstalled(checkout: string, told?: (advice: string) => boolean): never;
export declare function runInCheckout(route: Extract<Route, { kind: "run" }>, input: unknown): never;
export declare function changedPaths(...listings: string[]): string[];
export declare function toldFile(checkout: string, session: string | undefined): string | undefined;
export declare function alreadyTold(file: string | undefined, report: string): boolean;
export declare function forgetTold(file: string | undefined): void;
