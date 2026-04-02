export type DevTestUser = {
  email: string;
  password: string;
  name: string;
  color: string;
};

export const DEV_TEST_USER_DEFAULT_PASSWORD = "password123";
export const DEV_TEST_USER_PASSWORD_RESET_COMMAND = "pnpm run db:reset:test-user-passwords";

export const DEV_TEST_USERS: DevTestUser[] = [
  { email: "checklists@serp.co", password: DEV_TEST_USER_DEFAULT_PASSWORD, name: "SERP (Pro)", color: "bg-amber-500" },
  { email: "admin@test.com", password: DEV_TEST_USER_DEFAULT_PASSWORD, name: "Admin (Pro)", color: "bg-red-500" },
  { email: "john@test.com", password: DEV_TEST_USER_DEFAULT_PASSWORD, name: "John (Free)", color: "bg-blue-500" },
  { email: "jane@test.com", password: DEV_TEST_USER_DEFAULT_PASSWORD, name: "Jane (Pro)", color: "bg-purple-500" },
  { email: "bob@test.com", password: DEV_TEST_USER_DEFAULT_PASSWORD, name: "Bob (Free)", color: "bg-green-500" },
];

export function getDevTestUserPasswordHelp() {
  return `Default local seed password: ${DEV_TEST_USER_DEFAULT_PASSWORD}. Changed one? Run ${DEV_TEST_USER_PASSWORD_RESET_COMMAND}.`;
}
