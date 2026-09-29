import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  McpOAuthRefreshFamily,
  McpOAuthSnapshot,
} from "./mcpOAuthSnapshot";
import { McpOAuthError } from "./mcpOAuthPolicy";
import { McpOAuthState } from "./mcpOAuthState";

type Grant = { id: string; expiresAt: number };
type Refresh<T> = { grant: T; used: boolean };
type Family = Omit<McpOAuthRefreshFamily, "grantId">;
const PREFIX = "mrt2.";
const PAYLOAD_BYTES = 52;
const MAC_BYTES = 32;

/** V1 digests drain at their original expiry; new rotations retain one MAC key
 * and generation per grant. Family keys belong only in encrypted snapshots. */
export class McpOAuthRefreshTokens<T extends Grant> {
  private readonly legacy: McpOAuthState<Refresh<T>>;
  private readonly families = new Map<string, Family>();
  constructor(
    private readonly now: () => number,
    private readonly grants: ReadonlyMap<string, T>,
  ) {
    this.legacy = new McpOAuthState(now, 8192);
  }
  get(secret: string): Refresh<T> | undefined {
    if (/^[A-Za-z0-9_-]{43}$/.test(secret)) return this.legacy.get(secret);
    if (!/^mrt2\.[A-Za-z0-9_-]{112}$/.test(secret)) return undefined;
    const encoded = secret.slice(PREFIX.length);
    const bytes = Buffer.from(encoded, "base64url");
    if (
      bytes.length !== PAYLOAD_BYTES + MAC_BYTES ||
      bytes.toString("base64url") !== encoded
    )
      return undefined;
    const payload = bytes.subarray(0, PAYLOAD_BYTES);
    const grantId = payload.toString("ascii", 0, 36);
    const family = this.families.get(grantId);
    const grant = this.grants.get(grantId);
    if (
      !family ||
      !grant ||
      !timingSafeEqual(mac(payload, family.key), bytes.subarray(PAYLOAD_BYTES))
    )
      return undefined;
    const generation = readActiveGeneration(payload, family, grant, this.now());
    return generation === undefined
      ? undefined
      : { grant, used: generation < family.generation };
  }
  issue(grant: T, lifetimeMs: number): string {
    const current = this.families.get(grant.id);
    const generation = (current?.generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation))
      throw new McpOAuthError(
        "temporarily_unavailable",
        "Refresh generation capacity reached. Reconnect.",
        503,
      );
    const family = {
      key: current?.key ?? randomBytes(32).toString("base64url"),
      generation,
    };
    const payload = Buffer.alloc(PAYLOAD_BYTES);
    payload.write(grant.id, 0, 36, "ascii");
    payload.writeBigUInt64BE(BigInt(generation), 36);
    const expiresAt = Math.min(grant.expiresAt, this.now() + lifetimeMs);
    payload.writeBigUInt64BE(BigInt(expiresAt), 44);
    const token =
      PREFIX +
      Buffer.concat([payload, mac(payload, family.key)]).toString("base64url");
    this.families.set(grant.id, family);
    return token;
  }
  legacySnapshot(): McpOAuthSnapshot["refresh"] {
    return this.legacy.snapshot((entry) => ({
      grantId: entry.grant.id,
      used: entry.used,
    }));
  }
  snapshot(): McpOAuthRefreshFamily[] {
    return [...this.families].map(([grantId, family]) => ({
      grantId,
      ...family,
    }));
  }
  restore(
    records: McpOAuthSnapshot["refresh"],
    families: readonly McpOAuthRefreshFamily[],
    requireGrant: (id: string) => T,
  ): void {
    this.legacy.restore(records, (entry) => ({
      grant: requireGrant(entry.grantId),
      used: entry.used,
    }));
    this.families.clear();
    for (const { grantId, key, generation } of families)
      this.families.set(grantId, { key, generation });
  }
  prune(inactive: (grant: T) => boolean): void {
    this.legacy.removeWhere((entry) => inactive(entry.grant));
    for (const id of this.families.keys()) {
      const grant = this.grants.get(id);
      if (!grant || inactive(grant)) this.families.delete(id);
    }
  }
  clear(): void {
    this.legacy.clear();
    this.families.clear();
  }
}

function mac(payload: Buffer, key: string): Buffer {
  return createHmac("sha256", Buffer.from(key, "base64url"))
    .update("carrot-mcp-refresh-v2\0")
    .update(payload)
    .digest();
}

function readActiveGeneration(
  payload: Buffer,
  family: Family,
  grant: Grant,
  now: number,
): number | undefined {
  const generation = Number(payload.readBigUInt64BE(36));
  const expiresAt = Number(payload.readBigUInt64BE(44));
  return Number.isSafeInteger(generation) &&
    generation >= 1 &&
    generation <= family.generation &&
    Number.isSafeInteger(expiresAt) &&
    expiresAt > now &&
    expiresAt <= grant.expiresAt
    ? generation
    : undefined;
}
