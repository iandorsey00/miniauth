import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function getEncryptionKeyMaterial() {
  const configured = process.env.AUTH_TOTP_ENCRYPTION_KEY?.trim();

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY is required in production for TOTP.");
  }

  return "miniauth-dev-totp-key";
}

function getEncryptionKey() {
  return crypto.createHash("sha256").update(getEncryptionKeyMaterial()).digest();
}

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string) {
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function hotp(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function formatRecoveryCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function buildTotpProvisioningUri({
  issuer,
  accountName,
  secret,
}: {
  issuer: string;
  accountName: string;
  secret: string;
}) {
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function verifyTotpCode(secret: string, code: string, window = 1) {
  const normalizedCode = code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(secret, counter + offset) === normalizedCode) {
      return true;
    }
  }

  return false;
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptTotpSecret(payload: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");

  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted TOTP secret payload.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () =>
    formatRecoveryCode(crypto.randomBytes(4).toString("hex").slice(0, 8).toUpperCase()),
  );
}

export function normalizeRecoveryCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
