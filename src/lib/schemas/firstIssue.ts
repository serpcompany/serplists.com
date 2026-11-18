import { z } from "zod";

const issueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

const issuesOfAFailedParse = z.array(issueSchema).nonempty();

export type FirstIssue = z.infer<typeof issueSchema>;

export const firstIssue = (error: z.ZodError): FirstIssue => issuesOfAFailedParse.parse(error.issues)[0];
