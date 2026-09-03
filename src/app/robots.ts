import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private, transactional and administrative surfaces are never indexed.
        disallow: [
          "/api/",
          "/conta",
          "/conta/",
          "/criar/",
          "/checkout",
          "/checkout/",
          "/admin",
          "/admin/",
          "/atelie/painel",
          "/atelie/painel/",
          "/pedido/",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
