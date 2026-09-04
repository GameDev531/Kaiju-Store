import type { Metadata } from "next";
import NotFound from "../not-found";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

/**
 * Addressable twin of the root not-found page.
 *
 * Middleware cannot invoke the framework's not-found boundary directly, so a
 * dev-only route that must 404 in a deployed environment is rewritten here —
 * which lets the response carry a real 404 status while rendering exactly the
 * same page a mistyped URL gets.
 */
export default function NotFoundRoute() {
  return <NotFound />;
}
