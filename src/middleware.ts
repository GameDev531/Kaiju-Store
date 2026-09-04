import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge pre-filter for gated routes.
 *
 * Why this exists: `redirect()` and `notFound()` called inside a page component
 * cannot change the HTTP status once React has begun streaming, so a signed-out
 * request to /conta rendered the correct sign-in redirect *with a 200*. The
 * content was never wrong, but the status was — which misleads monitoring,
 * crawlers and any client that branches on it.
 *
 * What this is NOT: authentication. Middleware runs on the edge without database
 * access, so it can only see whether a session cookie is PRESENT — not whether
 * it is valid, unexpired, unrevoked, or belongs to someone with the right role.
 * Every page and action below still performs the real check against the database.
 * This layer exists to answer the obvious cases early and correctly; it is a
 * filter, never the boundary.
 */

/** Routes that require *some* session. Role checks happen in the page. */
const AUTHENTICATED_PREFIXES = [
  "/conta",
  "/admin",
  "/atelie/painel",
  "/pedido/",
  "/checkout",
];

/** Routes that must not exist outside a development environment. */
const DEV_ONLY_PREFIXES = ["/checkout/simulacao"];

const SESSION_COOKIES = ["__Host-kaiju_session", "kaiju_session"];

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  // The dev-only gate is a hard 404 in any deployed environment. The page itself
  // repeats this check — a middleware matcher edit must not be able to expose it.
  if (DEV_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const appEnv = process.env.APP_ENV ?? "development";
    if (appEnv === "production" || appEnv === "staging") {
      return NextResponse.rewrite(new URL("/nao-encontrado", request.url), { status: 404 });
    }
  }

  if (AUTHENTICATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
    if (!hasSession) {
      const target = new URL("/entrar", request.url);
      // Same-origin path only; the sign-in page validates this again.
      target.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(target, 307);
    }
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except static assets and the routes that must stay reachable
   * without a session. API routes do their own authentication and must not be
   * redirected — a webhook receiving a 307 to a sign-in page is a broken
   * integration, not a protected one.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
