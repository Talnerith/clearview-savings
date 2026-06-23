// Sanitize a user-supplied `next` redirect target down to a same-origin
// path. Server Actions and pages redirect() with a relative path (unlike
// app/auth/callback, which builds an absolute URL and compares origins), so
// here we only ever permit an internal absolute path like "/reset-password".
//
// Rejected as open-redirect vectors, falling back to the caregiver home:
//   - anything not starting with "/" (scheme/host, e.g. "https://evil")
//   - protocol-relative "//evil" and the "/\evil" / backslash variants that
//     some browsers normalize to "//"
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/caregiver",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
