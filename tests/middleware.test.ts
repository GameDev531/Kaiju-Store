import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "@/middleware";

/**
 * The middleware is a pre-filter, not the security boundary — but the two
 * properties it DOES own are easy to break with a careless matcher edit:
 *
 *   1. API routes must never be redirected. A payment webhook that receives a
 *      307 to a sign-in page is a broken integration, and the failure looks
 *      like "the provider stopped sending events" rather than like a bug here.
 *   2. Gated routes must produce a real redirect status, not a 200 carrying a
 *      redirect shell, so monitoring and clients can branch on it.
 */

const request = (path: string, cookies: Record<string, string> = {}) => {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
};

describe("route matcher", () => {
  const matcher = new RegExp(
    (config.matcher as string[])[0]!.replace(/^\//, "^/").replace(/\$$/, "$"),
  );

  it("excludes API routes so webhooks are never redirected", () => {
    for (const path of ["/api/health", "/api/webhooks/payments", "/api/webhooks/shipping", "/api/files/abc"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it("excludes static assets and crawler files", () => {
    for (const path of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/robots.txt", "/sitemap.xml"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it("includes the application's own pages", () => {
    for (const path of ["/", "/loja", "/conta", "/admin", "/atelie/painel"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });
});

describe("authentication pre-filter", () => {
  it("redirects a session-less request to sign-in with a real 307", () => {
    for (const path of ["/conta", "/conta/medidas", "/admin", "/atelie/painel", "/pedido/KJ-AAAA-BBBB", "/checkout"]) {
      const response = middleware(request(path));
      expect(response.status, path).toBe(307);
      const location = response.headers.get("location")!;
      expect(location).toContain("/entrar");
      expect(location).toContain(encodeURIComponent(path));
    }
  });

  it("lets a request with a session cookie through to the real check", () => {
    // Presence only — the page still validates the token against the database.
    for (const name of ["__Host-kaiju_session", "kaiju_session"]) {
      const response = middleware(request("/conta", { [name]: "whatever" }));
      expect(response.status, name).toBe(200);
    }
  });

  it("does not gate public routes", () => {
    for (const path of ["/", "/loja", "/criar", "/entrar", "/faq", "/trabalhos", "/politicas/termos"]) {
      expect(middleware(request(path)).status, path).toBe(200);
    }
  });

  it("does not gate /criar itself, only the studio behind it", () => {
    // The landing page must render for signed-out visitors so they can read
    // what the flow is before being asked to create an account.
    expect(middleware(request("/criar")).status).toBe(200);
  });

  it("preserves the query string in the return path", () => {
    const req = new NextRequest(new URL("http://localhost:3000/conta/pedidos?estado=PAID"));
    const location = middleware(req).headers.get("location")!;
    expect(location).toContain(encodeURIComponent("/conta/pedidos?estado=PAID"));
  });
});

describe("development-only routes", () => {
  it("404s the payment simulator in a deployed environment", () => {
    const original = process.env.APP_ENV;
    try {
      for (const env of ["production", "staging"]) {
        process.env.APP_ENV = env;
        const response = middleware(request("/checkout/simulacao", { kaiju_session: "x" }));
        expect(response.status, env).toBe(404);
      }
    } finally {
      process.env.APP_ENV = original;
    }
  });

  it("allows it in development, where it is the only way to exercise the webhook path", () => {
    const original = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "development";
      const response = middleware(request("/checkout/simulacao", { kaiju_session: "x" }));
      expect(response.status).toBe(200);
    } finally {
      process.env.APP_ENV = original;
    }
  });
});
