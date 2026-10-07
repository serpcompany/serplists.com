import { z } from "zod";

export const authStatusSchema = z.object({
  accountRegistrationAvailable: z.boolean(),
  emailAuthAvailable: z.boolean(),
  emailVerificationRequired: z.boolean(),
});

export type AuthStatus = z.infer<typeof authStatusSchema>;
