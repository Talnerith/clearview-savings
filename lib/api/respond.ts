import "server-only";

// JSON response + CORS helpers for the mobile API surface (app/api/m/*).
//
// These endpoints are consumed by the Clearview Savings mobile app
// (clearview-savings-mobile). Native fetch is not subject to CORS, but the
// Expo *web* build is, so we reflect an allow-listed Origin. The allow-list is
// env-driven (MOBILE_ALLOWED_ORIGINS, comma-separated) with the Expo dev server
// origins as sensible defaults so local development works out of the box.

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8081", // Expo web dev server
  "http://localhost:19006", // Expo web (legacy port)
];

function allowedOrigins(): string[] {
  const fromEnv = (process.env.MOBILE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...fromEnv];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  // No Origin header → a native (non-browser) client; no CORS headers needed.
  if (!origin) return {};
  if (!allowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// A handled, client-safe error. Carries an HTTP status and a stable machine
// `code` the mobile client switches on, plus a calm human message. Anything
// NOT thrown as an ApiError is treated as a 500 with a generic message — we
// never leak internals to the client.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonOk(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

// Maps a thrown helper Error to a client-safe ApiError. Known invariant
// messages (ownership, conflicts, missing rows) keep their calm message and get
// a meaningful status; anything else becomes a generic 500 so internals don't
// leak. ApiErrors pass through unchanged.
export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const msg = err instanceof Error ? err.message : "";
  if (/belong/i.test(msg)) return new ApiError(403, "invalid_target", msg);
  if (/already exists/i.test(msg)) return new ApiError(409, "conflict", msg);
  if (/not found/i.test(msg)) return new ApiError(404, "not_found", msg);
  return new ApiError(500, "internal_error", "Something went wrong.");
}

export function jsonError(
  req: Request,
  err: unknown,
): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: err.message, code: err.code },
      { status: err.status, headers: corsHeaders(req) },
    );
  }
  // Unknown/unexpected: don't leak details.
  return Response.json(
    { error: "Something went wrong.", code: "internal_error" },
    { status: 500, headers: corsHeaders(req) },
  );
}

// Preflight handler shared by every endpoint.
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
