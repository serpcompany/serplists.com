async function webCryptoHex(compute: () => Promise<ArrayBuffer>): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;

  try {
    return [...new Uint8Array(await compute())].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export function sha256Hex(value: string): Promise<string | null> {
  return webCryptoHex(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export function hmacSha256Hex(key: string, value: string): Promise<string | null> {
  return webCryptoHex(async () => {
    const encoder = new TextEncoder();
    const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", hmacKey, encoder.encode(value));
  });
}

export function createInviteToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}
