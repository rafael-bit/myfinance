export type SyncOperation = {
  id: string;
  entity: string;
  entityId: string;
  action: "upsert" | "delete";
  payload: unknown;
  idempotencyKey: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
};

export type SyncConflict = {
  id: string;
  entity: string;
  entityId: string;
  local: unknown;
  remote: unknown;
  fields: string[];
};

const MONEY_FIELDS = new Set(["amountMinor", "date", "accountId", "status", "totalMinor"]);

export function detectConflict(local: Record<string, unknown>, remote: Record<string, unknown>): string[] {
  return Object.keys({ ...local, ...remote }).filter((key) => {
    if (local[key] === remote[key]) return false;
    return MONEY_FIELDS.has(key);
  });
}

export function lwwMetadata<T extends { updatedAt: string; version: number }>(local: T, remote: T): T {
  if (remote.updatedAt > local.updatedAt) return remote;
  if (remote.updatedAt < local.updatedAt) return local;
  return remote.version >= local.version ? remote : local;
}
