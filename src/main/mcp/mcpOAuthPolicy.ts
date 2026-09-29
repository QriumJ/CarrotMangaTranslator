import { createHash, timingSafeEqual } from "node:crypto";

export class McpOAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function oauthRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new McpOAuthError("invalid_request", "An object is required.");
  return value as Record<string, unknown>;
}
export function oauthText(value: unknown, max = 2048): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max)
    throw new McpOAuthError("invalid_request", "A required field is invalid.");
  return value;
}
export function oauthDigest(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
export function oauthEqual(left: string, right: string): boolean {
  return timingSafeEqual(
    Buffer.from(oauthDigest(left)),
    Buffer.from(oauthDigest(right)),
  );
}
/** Hosted AI-app callbacks accepted by DCR, compared as exact strings. */
const CLAUDE_CALLBACKS: ReadonlySet<string> = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);
/** Origins a consent form may hand the browser back to. */
export const MCP_HOSTED_CALLBACK_ORIGINS = [
  "https://chatgpt.com",
  "https://claude.ai",
  "https://claude.com",
] as const;
/** DCR accepts ChatGPT and Claude's hosted callbacks plus the loopback callback
 * shapes Codex and Claude Code listen on. Each registration stores exact URIs.
 * Never fetch a caller-supplied client_uri, logo_uri or metadata URL. */
export function readMcpOAuthRedirect(value: unknown): string {
  const text = oauthText(value);
  let url: URL;
  try {
    url = new URL(text);
  } catch (_error) {
    throw new McpOAuthError("invalid_redirect_uri", "Invalid callback URL.");
  }
  if (
    !isSupportedMcpCallback(url) ||
    [url.username, url.password, url.search, url.hash].some(Boolean) ||
    url.href !== text
  )
    throw new McpOAuthError(
      "invalid_redirect_uri",
      "Use an exact ChatGPT or Claude callback, or a loopback HTTP callback on 127.0.0.1 or localhost with an explicit unprivileged port.",
    );
  return text;
}
function isSupportedMcpCallback(url: URL): boolean {
  const chatGpt =
    url.origin === "https://chatgpt.com" &&
    (/^\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname) ||
      url.pathname === "/connector_platform_oauth_redirect");
  return chatGpt || CLAUDE_CALLBACKS.has(url.href) || isLoopbackCallback(url);
}
/** Codex listens on 127.0.0.1; Claude Code registers `localhost`. */
function isLoopbackCallback(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    Number(url.port) >= 1024 &&
    /^\/callback(?:\/[A-Za-z0-9_-]{1,200})?$/.test(url.pathname)
  );
}
/** Hosted callbacks must match a registered URI exactly. A loopback callback
 * keeps its registered host and path but may use any unprivileged port
 * (RFC 8252 section 7.3): native clients listen on a fresh port per sign-in. */
export function matchesMcpOAuthRedirect(
  registered: readonly string[],
  requested: string,
): boolean {
  if (registered.includes(requested)) return true;
  let url: URL;
  try {
    url = new URL(readMcpOAuthRedirect(requested));
  } catch (_error) {
    return false;
  }
  if (!isLoopbackCallback(url)) return false;
  return registered.some((item) => {
    const known = new URL(item);
    return (
      isLoopbackCallback(known) &&
      known.hostname === url.hostname &&
      known.pathname === url.pathname
    );
  });
}
export function readOAuthScope(
  value: unknown,
  allowEdits = false,
  allowImages = false,
  allowProcessing = false,
): string {
  const scope = value === undefined ? "carrot.read" : oauthText(value, 200);
  const scopes = [...new Set(scope.split(" ").filter(Boolean))];
  if (
    !scopes.includes("carrot.read") ||
    scopes.some(
      (item) =>
        ![
          "carrot.read",
          ...(allowImages ? ["carrot.images"] : []),
          ...(allowEdits ? ["carrot.edit"] : []),
          ...(allowProcessing ? ["carrot.process"] : []),
          "offline_access",
        ].includes(item),
    )
  )
    throw new McpOAuthError(
      "invalid_scope",
      "Unsupported MCP permission. carrot.read is required.",
    );
  return scopes.join(" ");
}
export function assertOAuthResource(value: unknown, resource: string): void {
  if (value !== resource)
    throw new McpOAuthError(
      "invalid_target",
      "Use the exact resource from protected-resource metadata.",
    );
}
export function readPkceChallenge(value: unknown, method: unknown): string {
  const challenge = oauthText(value, 43);
  if (method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
    throw new McpOAuthError("invalid_request", "PKCE S256 is required.");
  return challenge;
}
export function verifyPkce(value: unknown, challenge: string): boolean {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9._~-]{43,128}$/.test(value) &&
    oauthEqual(oauthDigest(value), challenge)
  );
}
export function uniqueOAuthParams(
  params: URLSearchParams,
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key))
      throw new McpOAuthError(
        "invalid_request",
        "Duplicate parameters are not accepted.",
      );
    result[key] = value;
  }
  return result;
}
