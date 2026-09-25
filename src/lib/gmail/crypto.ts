import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts Gmail tokens before they're stored, so the database (and anyone
// who can read a row) only ever sees ciphertext. The key lives only on the
// server, in GMAIL_TOKEN_KEY: 32 random bytes, base64-encoded.
// Generate one with:  openssl rand -base64 32
//
// AES-256-GCM, stored as "v1.<iv>.<auth tag>.<ciphertext>" (base64url).

function key() {
  const raw = process.env.GMAIL_TOKEN_KEY;
  if (!raw) throw new Error("Gmail isn't set up: GMAIL_TOKEN_KEY is missing.");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error("GMAIL_TOKEN_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32).");
  }
  return bytes;
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptToken(stored: string) {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
