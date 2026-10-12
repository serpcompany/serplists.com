import { releaseCommitFrom } from '@/lib/schemas/release';

export const releaseCommit = (): string => releaseCommitFrom(process.env.NEXT_PUBLIC_RELEASE_COMMIT);
