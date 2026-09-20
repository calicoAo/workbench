import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { mutationReceipts } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";

type MutationIdentity = {
  userId: number;
  operationId: string;
  commandType: string;
  contractVersion?: number;
  request: unknown;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function mutationFingerprint(commandType: string, contractVersion: number, request: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue({ commandType, contractVersion, request }))).digest("hex");
}

function isDuplicate(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

async function claimMutation(client: DatabaseClient, identity: MutationIdentity) {
  const contractVersion = identity.contractVersion ?? 1;
  const requestSnapshot = stableValue(identity.request);
  const requestFingerprint = mutationFingerprint(identity.commandType, contractVersion, requestSnapshot);
  try {
    await client.insert(mutationReceipts).values({
      userId: identity.userId,
      operationId: identity.operationId,
      commandType: identity.commandType,
      contractVersion,
      requestFingerprint,
      requestSnapshot,
      createdAt: new Date()
    });
    return { replay: false as const, requestFingerprint };
  } catch (error) {
    if (!isDuplicate(error)) throw error;
  }

  const [receipt] = await client
    .select()
    .from(mutationReceipts)
    .where(and(eq(mutationReceipts.userId, identity.userId), eq(mutationReceipts.operationId, identity.operationId)))
    .for("update");
  if (!receipt) throw new BusinessError(ErrorCode.CONFLICT, "mutation receipt is unavailable", 409);
  if (receipt.commandType !== identity.commandType || receipt.contractVersion !== contractVersion || receipt.requestFingerprint !== requestFingerprint) {
    throw new BusinessError(ErrorCode.CONFLICT, "operationId is already used with different parameters", 409);
  }
  if (!receipt.committedAt || receipt.resultMetadata === null) {
    throw new BusinessError(ErrorCode.CONFLICT, "mutation receipt requires repair", 409);
  }
  return { replay: true as const, result: receipt.resultMetadata };
}

export async function runMutation<T>(identity: MutationIdentity, execute: (client: DatabaseClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    const claim = await claimMutation(tx, identity);
    if (claim.replay) return claim.result as T;
    const result = await execute(tx);
    await tx
      .update(mutationReceipts)
      .set({
        resultReference: result && typeof result === "object" && "id" in result ? String((result as { id: unknown }).id) : null,
        resultMetadata: result,
        committedAt: new Date()
      })
      .where(and(eq(mutationReceipts.userId, identity.userId), eq(mutationReceipts.operationId, identity.operationId)));
    return result;
  });
}
