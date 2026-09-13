/** JSON.stringify that converts bigint to number (safe for money minors in JS range). */
export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item));
}
