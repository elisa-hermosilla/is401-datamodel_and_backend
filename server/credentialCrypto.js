import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function key() {
  const encoded = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new Error("APP_ENCRYPTION_KEY is required to save or read encrypted credentials");
  }
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32 || value.toString("base64") !== encoded) {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return value;
}

export function isEncryptedCredential(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function credentialContext(field, userId) {
  return `${field}:user:${userId}`;
}

export function encryptCredential(value, context) {
  if (value == null || value === "") return value;
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(`duelist:${context}:v1`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const packed = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  return `${PREFIX}${packed.toString("base64")}`;
}

export function decryptCredential(value, context) {
  if (value == null || value === "" || !isEncryptedCredential(value)) return value;
  let packed;
  try {
    packed = Buffer.from(value.slice(PREFIX.length), "base64");
    if (packed.length < NONCE_BYTES + TAG_BYTES) throw new Error("Invalid ciphertext");
    const nonce = packed.subarray(0, NONCE_BYTES);
    const tag = packed.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const ciphertext = packed.subarray(NONCE_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key(), nonce);
    decipher.setAAD(Buffer.from(`duelist:${context}:v1`, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Could not decrypt a saved credential. Check APP_ENCRYPTION_KEY and the stored value.");
  }
}

