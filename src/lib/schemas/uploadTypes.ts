// Image types the API stores for avatars (functions/api/handlers/uploads.ts). The avatar
// picker offers and checks the same list, so a file the API would refuse is caught first.
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
