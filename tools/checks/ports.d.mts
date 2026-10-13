export type Role = "dev" | "e2e" | "preview";

export type Ports = Record<Role, number>;

export declare const mainPorts: Readonly<Ports>;
export declare const roles: readonly Role[];
export declare const firstWorktreePort: number;
export declare const portsPerWorktree: number;
export declare const lastSlot: number;

export declare function portsFor(slot: number): Ports;

export declare function checkoutPorts(folder?: string): Ports;

export declare function launch(
  port: number,
  command: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): { program: string | undefined; arguments: string[]; env: Record<string, string | undefined> };
