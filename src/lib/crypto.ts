import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY_BASE64;
  if (!b64) throw new Error("ENCRYPTION_KEY_BASE64 não definida");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY_BASE64 deve ter 32 bytes");
  return key;
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

export function encrypt(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decrypt(cipherText: string): string {
  const key = getKey();
  const payload: EncryptedPayload = JSON.parse(
    Buffer.from(cipherText, "base64").toString("utf8")
  );
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
