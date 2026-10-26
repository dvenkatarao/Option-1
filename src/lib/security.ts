import crypto from "crypto";
import { getEnv } from "@/lib/env";

/**
 * AES-256-GCM Security and Encryption Utility
 * Ensures broker API secrets, OAuth tokens, and connection credentials are encrypted at rest.
 * Uses 256-bit keys, authenticated encryption with 12-byte random IVs and 16-byte GCM tags.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag

/**
 * Derives a deterministic 32-byte (256-bit) key from the validated environment secret.
 * getEnv() refuses production start-up without a strong PORTFOLIO_ENCRYPTION_KEY.
 */
function getDerivedKey(): Buffer {
  return crypto.createHash("sha256").update(getEnv().PORTFOLIO_ENCRYPTION_KEY).digest();
}

/**
 * Encrypts a plaintext string or object using AES-256-GCM.
 * Output format: `iv_hex:auth_tag_hex:ciphertext_hex`
 */
export function encryptCredential(data: string | object): string {
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getDerivedKey();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM payload.
 * Verifies authenticity before returning the decrypted string.
 */
export function decryptCredential(payload: string): string {
  if (!payload || !payload.includes(":")) {
    throw new Error("Invalid encrypted payload format");
  }

  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Encrypted payload must contain IV, AuthTag, and Ciphertext");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = getDerivedKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Decrypts a JSON payload safely, returning null on error.
 */
export function decryptJson<T = unknown>(payload: string | null | undefined): T | null {
  if (!payload) return null;
  try {
    const text = decryptCredential(payload);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Masks an account number or identifier, showing only the last 4 characters.
 */
export function maskAccountNumber(acc: string | null | undefined): string {
  if (!acc) return "••••";
  const clean = acc.trim();
  if (clean.length <= 4) return `••••${clean}`;
  return `••••${clean.slice(-4)}`;
}

/**
 * Generates a collision-resistant unique ID with an optional prefix.
 */
export function generateId(prefix = "id"): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
