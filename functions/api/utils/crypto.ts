function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function hmacSha256Hex(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(value)));
}

export function createInviteToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}
