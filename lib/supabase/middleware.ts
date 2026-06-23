import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAalState } from "@/lib/auth/aal";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() refreshes the auth cookie if needed. Do not remove this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Caregiver routes require a session.
  if (!user && path.startsWith("/caregiver")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Caregiver routes also require AAL2 *if* the caregiver has a verified
  // factor. An AAL1 session with a factor (e.g. just after the password
  // step, or after a password reset) is bounced to the TOTP challenge.
  // No factor → AAL1 is sufficient; AAL2 → through. Patient routes are not
  // under /caregiver and are never gated (spec hard constraint).
  if (user && path.startsWith("/caregiver")) {
    if ((await getAalState(supabase)) === "aal1-needs-aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/challenge";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Already-signed-in caregivers shouldn't see auth pages.
  if (user && (path === "/sign-in" || path === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/caregiver";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Admin routes: single-admin exact-string match against ADMIN_EMAIL.
  // 404 (not 403, and not a redirect to sign-in) for any request from a
  // non-admin — signed out or signed in — so the route's existence is not
  // leaked by response-shape asymmetry.
  if (path === "/admin" || path.startsWith("/admin/")) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || user?.email !== adminEmail) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return supabaseResponse;
}
