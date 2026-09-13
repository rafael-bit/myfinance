const UUID_V7_VERSION = 0x70;
const UUID_VARIANT = 0x80;

export function createId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const now = BigInt(Date.now());
  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | UUID_V7_VERSION;
  bytes[7] = bytes[7];
  bytes[8] = (bytes[8] & 0x3f) | UUID_VARIANT;
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").replace(
    /(.{8})(.{4})(.{4})(.{4})(.{12})/,
    "$1-$2-$3-$4-$5",
  );
}

export function createIdempotencyKey(prefix = "op"): string {
  return `${prefix}_${createId()}`;
}
