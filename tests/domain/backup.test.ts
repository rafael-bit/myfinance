import { describe, expect, it } from "vitest";
import { encryptBackup, decryptBackup, hashSecret, verifySecret } from "@/infra/auth/crypto";
import { BACKUP_VERSION } from "@/shared/constants";

describe("backup round-trip", () => {
  it("encrypts and decrypts with version", async () => {
    const payload = JSON.stringify({ backup_version: BACKUP_VERSION, hello: "world" });
    const cipher = await encryptBackup(payload, "senha-super-secreta");
    expect(cipher).not.toContain("hello");
    const plain = await decryptBackup(cipher, "senha-super-secreta");
    expect(JSON.parse(plain).backup_version).toBe(1);
  });

  it("hashes passwords without storing plaintext", async () => {
    const hashed = await hashSecret("minha-senha");
    expect(hashed.hash).not.toContain("minha-senha");
    expect(await verifySecret("minha-senha", hashed.salt, hashed.hash)).toBe(true);
    expect(await verifySecret("outra", hashed.salt, hashed.hash)).toBe(false);
  });
});
