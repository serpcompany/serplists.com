import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, sha256Hex } from "@functions/api/utils/crypto";

const SHA256_OF_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const HMAC_OF_THE_QUICK_BROWN_FOX = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

describe("the API's hashes, which answer null rather than throwing when the runtime can't compute them", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hashes a value as lowercase SHA-256 hex", async () => {
    expect(await sha256Hex("abc")).toBe(SHA256_OF_ABC);
  });

  it("signs a value as lowercase HMAC-SHA-256 hex", async () => {
    expect(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(HMAC_OF_THE_QUICK_BROWN_FOX);
  });

  it("answers null in a runtime without Web Crypto", async () => {
    vi.stubGlobal("crypto", undefined);

    expect(await sha256Hex("abc")).toBeNull();
    expect(await hmacSha256Hex("key", "abc")).toBeNull();
  });

  it("answers null in a runtime whose Web Crypto has no SubtleCrypto", async () => {
    vi.stubGlobal("crypto", {});

    expect(await sha256Hex("abc")).toBeNull();
    expect(await hmacSha256Hex("key", "abc")).toBeNull();
  });

  it("answers null when the digest or the signature fails", async () => {
    vi.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error("SHA-256 is unavailable"));
    vi.spyOn(crypto.subtle, "importKey").mockRejectedValue(new Error("HMAC is unavailable"));

    expect(await sha256Hex("abc")).toBeNull();
    expect(await hmacSha256Hex("key", "abc")).toBeNull();
  });
});
