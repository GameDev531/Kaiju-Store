import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { SITE } from "@/lib/site";
import { STYLES } from "@/server/domain/styles";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    { path: "", priority: 1.0, changeFrequency: "daily" as const },
    { path: "/loja", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/colecoes", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/estilos", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/criar", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/como-funciona", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/sobre", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/contato", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/recompensas", priority: 0.6, changeFrequency: "weekly" as const },
    { path: "/trabalhos", priority: 0.7, changeFrequency: "daily" as const },
    { path: "/criadores", priority: 0.6, changeFrequency: "weekly" as const },
    { path: "/revenda", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/planos", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/atelie/entrar", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/rastrear", priority: 0.4, changeFrequency: "yearly" as const },
    { path: "/politicas/envio", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/politicas/trocas", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/politicas/privacidade", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/politicas/termos", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/politicas/cookies", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/politicas/direitos-autorais", priority: 0.4, changeFrequency: "yearly" as const },
  ];

  const [products, collections] = await Promise.all([
    db.product.findMany({ where: { published: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
  ]).catch(() => [[], []] as const);

  return [
    ...staticRoutes.map((r) => ({
      url: `${SITE.url}${r.path}`,
      lastModified: new Date(),
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...products.map((p) => ({
      url: `${SITE.url}/loja/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...collections.map((c) => ({
      url: `${SITE.url}/colecoes/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    // O catálogo de estilos é conteúdo estável e é por onde a maior parte da
    // busca externa entra ("techwear feminino", "dark academia roupas").
    ...STYLES.map((style) => ({
      url: `${SITE.url}/estilos/${style.id}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
