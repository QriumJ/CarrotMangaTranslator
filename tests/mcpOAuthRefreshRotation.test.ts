import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "vitest";
import { McpOAuthProvider } from "../src/main/mcp/mcpOAuthProvider";
import { McpOAuthSession } from "../src/main/mcp/mcpOAuthSession";
import { oauthDigest } from "../src/main/mcp/mcpOAuthPolicy";
import { mcpTestEncryption } from "./mcpEncryption.fixture";

const ISSUER = "https://carrot.tail-test.ts.net";
const RESOURCE = `${ISSUER}/mcp`;
const CALLBACK = "http://127.0.0.1:43123/callback/rotation";
const PASSWORD = "p".repeat(43);
const VERIFIER = "v".repeat(43);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = 1_700_000_000_000;
type Tokens = ReturnType<McpOAuthProvider["token"]>;

function fixture() {
  let now = START;
  const create = () =>
    new McpOAuthProvider(ISSUER, PASSWORD, () => now, { persistent: true });
  let provider = create();
  return {
    get provider() {
      return provider;
    },
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    restart: (snapshot: unknown = provider.snapshot()) => {
      provider.close();
      provider = create();
      provider.restore(snapshot);
    },
  };
}
function authorization(provider: McpOAuthProvider, clientId: string) {
  const pending = provider.begin({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    resource: RESOURCE,
    state: "rotation-test",
    scope: "carrot.read offline_access",
    code_challenge: oauthDigest(VERIFIER),
    code_challenge_method: "S256",
  });
  const redirect = new URL(
    provider.approve(
      {
        transaction: pending.transaction,
        decision: "approve",
        pairing_secret: PASSWORD,
      },
      pending.cookie,
    ),
  );
  return {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    resource: RESOURCE,
    code: redirect.searchParams.get("code"),
    code_verifier: VERIFIER,
  };
}
function connect(provider: McpOAuthProvider) {
  const client = provider.register({
    redirect_uris: [CALLBACK],
    token_endpoint_auth_method: "none",
  });
  return {
    clientId: client.client_id,
    tokens: provider.token(authorization(provider, client.client_id)),
  };
}
function refresh(clientId: string, token: string) {
  return {
    grant_type: "refresh_token",
    client_id: clientId,
    resource: RESOURCE,
    refresh_token: token,
  };
}
function accepts(provider: McpOAuthProvider, tokens: Tokens) {
  return provider.accepts(`Bearer ${tokens.access_token}`);
}
function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** The installed v1 persistence contract, independent of new token internals. */
function legacySnapshot(accessCount = 1, refreshCount = 2) {
  const clientId = oauthDigest("historical-public-client");
  const accessToken = oauthDigest("historical-active-access");
  const refreshToken = oauthDigest("historical-current-refresh");
  const replayToken = oauthDigest("historical-used-refresh");
  const grantId = "00000000-0000-4000-8000-000000000001";
  return {
    clientId,
    accessToken,
    refreshToken,
    replayToken,
    snapshot: {
      version: 1,
      issuer: ISSUER,
      clients: [
        {
          digest: oauthDigest(clientId),
          expiresAt: Number.MAX_SAFE_INTEGER,
          value: {
            name: "Existing client",
            redirects: [CALLBACK],
            method: "none",
          },
        },
      ],
      grants: [
        {
          id: grantId,
          clientId,
          scope: "carrot.read offline_access",
          resource: RESOURCE,
          expiresAt: Number.MAX_SAFE_INTEGER,
          revoked: false,
          createdAt: START,
        },
      ],
      access: Array.from({ length: accessCount }, (_, index) => ({
        digest: oauthDigest(index ? `historical-access-${index}` : accessToken),
        expiresAt: START + 1,
        value: grantId,
      })),
      refresh: Array.from({ length: refreshCount }, (_, index) => ({
        digest: oauthDigest(
          index === 0
            ? refreshToken
            : index === 1
              ? replayToken
              : `historical-used-refresh-${index}`,
        ),
        expiresAt: START + 90 * DAY,
        value: { grantId, used: index !== 0 },
      })),
    },
  };
}

it("does not consume a refresh token when access capacity rejects its replacement", () => {
  const f = fixture();
  const legacy = legacySnapshot(8192);
  f.restart(legacy.snapshot);
  const input = refresh(legacy.clientId, legacy.refreshToken);
  const before = fingerprint(f.provider.snapshot());
  assert.throws(() => f.provider.token(input), { status: 503 });
  assert.equal(
    fingerprint(f.provider.snapshot()) === before,
    true,
    "An unsuccessful rotation must not alter authorization state",
  );
  f.advance(2);
  const tokens = f.provider.token(input);
  assert.equal(accepts(f.provider, tokens), true);
});

it("can retry the same refresh after a capacity failure was saved and restarted", async () => {
  const f = fixture();
  const legacy = legacySnapshot(8192);
  f.restart(legacy.snapshot);
  let saved = f.provider.snapshot();
  const session = new McpOAuthSession(f.provider, {
    save: async (state) => {
      saved = structuredClone(state);
    },
  });
  const input = refresh(legacy.clientId, legacy.refreshToken);
  await assert.rejects(
    session.run(() => f.provider.token(input)),
    { status: 503 },
  );
  await session.close();
  f.advance(2);
  f.restart(saved);
  const tokens = f.provider.token(input);
  assert.equal(accepts(f.provider, tokens), true);
});

it("rolls back issued access when a restored refresh family reaches its generation limit", () => {
  const f = fixture();
  const legacy = legacySnapshot();
  f.restart({
    ...legacy.snapshot,
    version: 2,
    families: [
      {
        grantId: legacy.snapshot.grants[0].id,
        key: oauthDigest("synthetic-generation-limit-family"),
        generation: Number.MAX_SAFE_INTEGER,
      },
    ],
  });
  const before = fingerprint(f.provider.snapshot());
  const input = refresh(legacy.clientId, legacy.refreshToken);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => f.provider.token(input), {
      code: "temporarily_unavailable",
      status: 503,
    });
    assert.equal(
      fingerprint(f.provider.snapshot()) === before,
      true,
      "Failed refresh issuance must neither leak access nor consume the old token",
    );
    assert.equal(f.provider.accepts(`Bearer ${legacy.accessToken}`), true);
  }
});

it("does not consume an authorization code on capacity failure before a successful retry", () => {
  const f = fixture();
  const legacy = legacySnapshot(8192);
  f.restart(legacy.snapshot);
  const input = authorization(f.provider, legacy.clientId);
  assert.throws(() => f.provider.token(input), { status: 503 });
  f.advance(2);
  const tokens = f.provider.token(input);
  assert.equal(accepts(f.provider, tokens), true);
});

it("rotates a full v1 refresh snapshot and still detects legacy replay after restart", () => {
  const f = fixture();
  const legacy = legacySnapshot(1, 8192);
  f.restart(legacy.snapshot);
  assert.equal(f.provider.accepts(`Bearer ${legacy.accessToken}`), true);
  const tokens = f.provider.token(
    refresh(legacy.clientId, legacy.refreshToken),
  );
  f.restart();
  assert.equal(accepts(f.provider, tokens), true);
  assert.throws(() =>
    f.provider.token(refresh(legacy.clientId, legacy.replayToken)),
  );
  assert.equal(accepts(f.provider, tokens), false);
  f.restart();
  assert.equal(accepts(f.provider, tokens), false);
});

it("keeps five hourly connections usable for 92 days with daily restarts and bounded encrypted state", () => {
  const f = fixture();
  const connections = Array.from({ length: 5 }, () => connect(f.provider));
  const encryption = mcpTestEncryption();
  const encryptedBytes = () =>
    encryption.encrypt(JSON.stringify(f.provider.snapshot())).toString("base64")
      .length;
  const baselineBytes = encryptedBytes();
  let maximumBytes = baselineBytes;
  for (let hour = 1; hour <= 92 * 24; hour++) {
    f.advance(HOUR);
    for (const [index, connection] of connections.entries()) {
      try {
        connection.tokens = f.provider.token(
          refresh(connection.clientId, connection.tokens.refresh_token),
        );
      } catch (error) {
        assert.equal(
          error instanceof Error,
          true,
          "Refresh threw a non-error value",
        );
        assert.fail(
          `Hourly refresh failed at hour ${hour}, connection ${index + 1}`,
        );
      }
      assert.equal(accepts(f.provider, connection.tokens), true);
    }
    if (hour % 24 === 0) {
      maximumBytes = Math.max(maximumBytes, encryptedBytes());
      f.restart();
      for (const connection of connections)
        assert.equal(accepts(f.provider, connection.tokens), true);
    }
  }
  // A representation-independent allowance, not a prescribed record count/layout.
  assert.ok(
    maximumBytes <= baselineBytes + 64 * 1024,
    "Stable connections must not accumulate encrypted replay records",
  );
  assert.equal(f.provider.connections().length, connections.length);
}, 60_000);

it("bounds encrypted refresh history before the old capacity ceiling is reached", () => {
  const f = fixture();
  const connections = Array.from({ length: 5 }, () => connect(f.provider));
  const encryption = mcpTestEncryption();
  const size = () =>
    encryption.encrypt(JSON.stringify(f.provider.snapshot())).toString("base64")
      .length;
  const baseline = size();
  for (let hour = 0; hour < 14 * 24; hour++) {
    f.advance(HOUR);
    for (const connection of connections)
      connection.tokens = f.provider.token(
        refresh(connection.clientId, connection.tokens.refresh_token),
      );
  }
  assert.ok(
    size() <= baseline + 64 * 1024,
    "Two weeks of stable connections must not grow an unbounded replay archive",
  );
});

it("preserves a legacy active session and replay authority across successive restarts", () => {
  const f = fixture();
  const legacy = legacySnapshot();
  f.restart(legacy.snapshot);
  assert.equal(f.provider.accepts(`Bearer ${legacy.accessToken}`), true);
  f.advance(HOUR);
  const next = f.provider.token(refresh(legacy.clientId, legacy.refreshToken));
  f.restart();
  const latest = f.provider.token(refresh(legacy.clientId, next.refresh_token));
  f.restart();
  assert.throws(() =>
    f.provider.token(refresh(legacy.clientId, legacy.refreshToken)),
  );
  assert.equal(accepts(f.provider, latest), false);
});

it("rejects forged or tampered refresh tokens without revoking the active connection", () => {
  const f = fixture();
  const connection = connect(f.provider);
  const token = connection.tokens.refresh_token;
  const positions = [0, Math.floor(token.length / 2), token.length - 1];
  const invalid = [
    "unknown-token",
    `${token}A`,
    ...positions.map(
      (position) =>
        token.slice(0, position) +
        (token[position] === "A" ? "B" : "A") +
        token.slice(position + 1),
    ),
  ];
  for (const candidate of invalid) {
    assert.throws(() =>
      f.provider.token(refresh(connection.clientId, candidate)),
    );
    assert.equal(accepts(f.provider, connection.tokens), true);
  }
  const next = f.provider.token(refresh(connection.clientId, token));
  f.restart();
  assert.equal(accepts(f.provider, next), true);
});

it("rejects mismatched client, resource and scope without consuming a legitimate token", () => {
  const f = fixture();
  const first = connect(f.provider);
  const second = connect(f.provider);
  const input = refresh(first.clientId, first.tokens.refresh_token);
  for (const change of [
    { client_id: second.clientId },
    { resource: "https://other.example/mcp" },
    { scope: "carrot.read" },
  ]) {
    assert.throws(() => f.provider.token({ ...input, ...change }));
    assert.equal(accepts(f.provider, first.tokens), true);
    assert.equal(accepts(f.provider, second.tokens), true);
  }
  assert.equal(accepts(f.provider, f.provider.token(input)), true);
});

it("revokes the current family when an older unexpired token is replayed after restart", () => {
  const f = fixture();
  const connection = connect(f.provider);
  const previous = refresh(
    connection.clientId,
    connection.tokens.refresh_token,
  );
  f.advance(DAY);
  const tokens = f.provider.token(previous);
  f.restart();
  assert.throws(() => f.provider.token(previous));
  assert.equal(accepts(f.provider, tokens), false);
  f.restart();
  assert.throws(() =>
    f.provider.token(refresh(connection.clientId, tokens.refresh_token)),
  );
});

for (const which of ["current", "previous"] as const) {
  it(`supports direct revocation using a ${which} refresh token across restart`, () => {
    const f = fixture();
    const connection = connect(f.provider);
    const latest = f.provider.token(
      refresh(connection.clientId, connection.tokens.refresh_token),
    );
    f.restart();
    f.provider.revoke({
      client_id: connection.clientId,
      token:
        which === "current"
          ? latest.refresh_token
          : connection.tokens.refresh_token,
    });
    assert.equal(accepts(f.provider, latest), false);
    f.restart();
    assert.equal(accepts(f.provider, latest), false);
    assert.throws(() =>
      f.provider.token(refresh(connection.clientId, latest.refresh_token)),
    );
  });
}
