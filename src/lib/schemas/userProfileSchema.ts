import { z } from "zod";

export const USER_NAME_MAX_LENGTH = 100;
export const USER_IMAGE_URL_MAX_LENGTH = 2048;
const DISPLAY_USERNAME_MAX_LENGTH = 30;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export const userNameSchema = z
  .string({ required_error: "Enter your name.", invalid_type_error: "Name must be text." })
  .trim()
  .min(1, "Enter your name.")
  .max(USER_NAME_MAX_LENGTH, `Name must be ${USER_NAME_MAX_LENGTH} characters or fewer.`)
  .refine((value) => !hasControlCharacters(value), "Name contains characters that are not allowed.");

export const displayUsernameSchema = z
  .string({ invalid_type_error: "Display username must be text." })
  .max(DISPLAY_USERNAME_MAX_LENGTH, `Display username must be ${DISPLAY_USERNAME_MAX_LENGTH} characters or fewer.`)
  .refine((value) => !hasControlCharacters(value), "Display username contains characters that are not allowed.")
  .nullable();
