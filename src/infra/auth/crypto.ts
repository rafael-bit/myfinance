import { PBKDF2_ITERATIONS } from "@/shared/constants";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashSecret(secret: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const hash = await pbkdf2(secret, salt, PBKDF2_ITERATIONS);
  return {
    kdf: "pbkdf2-sha256",
    salt: toHex(salt),
    hash: toHex(hash),
    params: JSON.stringify({ iterations: PBKDF2_ITERATIONS, hash: "SHA-256", length: 256 }),
  };
}

export async function verifySecret(secret: string, saltHex: string, expectedHex: string): Promise<boolean> {
  const hash = await pbkdf2(secret, fromHex(saltHex), PBKDF2_ITERATIONS);
  const expected = fromHex(expectedHex);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes).replace(/(.{4})/g, "$1-").slice(0, 39);
}

export async function encryptBackup(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const rawKey = await pbkdf2(secret, salt, PBKDF2_ITERATIONS);
  const key = await crypto.subtle.importKey("raw", rawKey as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
  return JSON.stringify({
    v: 1,
    alg: "AES-GCM",
    kdf: "pbkdf2-sha256",
    salt: toHex(salt),
    iv: toHex(iv),
    data: toBase64(new Uint8Array(cipher)),
  });
}

export async function decryptBackup(payload: string, secret: string): Promise<string> {
  const parsed = JSON.parse(payload) as { salt: string; iv: string; data: string };
  const rawKey = await pbkdf2(secret, fromHex(parsed.salt), PBKDF2_ITERATIONS);
  const key = await crypto.subtle.importKey("raw", rawKey as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(parsed.iv) as BufferSource },
    key,
    fromBase64(parsed.data) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
