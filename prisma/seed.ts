/**
 * Development seed.
 *
 * What this file deliberately does NOT create: fake reviews, fake ratings, fake
 * testimonials, fake order counts, or a fabricated roster of "partner ateliers".
 * The platform is new. Its interface is built to be honest about that, and
 * seeding invented social proof would make the honest components render lies in
 * every screenshot and demo.
 *
 * What it does create: the catalogue structure, one campaign, the plans, a
 * handful of clearly-labelled demo accounts, and enough production ateliers for
 * the matcher to have something to match against in a local environment.
 */
import { PrismaClient } from "@prisma/client";
import { buildSearchText } from "../src/server/domain/search-text";
import { isStyleId } from "../src/server/domain/styles";
import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, k: number, o: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const db = new PrismaClient();

async function hash(password: string): Promise<string> {
  const N = 1 << 16, r = 8, p = 1;
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

const DEMO_PASSWORD = "kaiju-desenvolvimento-2026";

async function main() {
  console.log("Seeding KAIJU…");

  // ---------------------------------------------------------------- plans --
  const plans = [
    {
      code: "FREE",
      name: "Grátis",
      priceCents: 0,
      currency: "BRL",
      entitlements: {
        aiAnalysesPerMonth: 3,
        savedDesigns: 10,
        jobBoardApply: true,
        jobBoardPost: false,
        aiConceptGenerator: false,
        prioritySupport: false,
      },
    },
    {
      code: "DESIGNER",
      name: "Designer",
      priceCents: 1200,
      currency: "USD",
      entitlements: {
        aiAnalysesPerMonth: 60,
        savedDesigns: 200,
        jobBoardApply: true,
        jobBoardPost: false,
        // The concept generator makes original compositions from described
        // aesthetics. It is not a "make me this character" tool, and the
        // product copy says so.
        aiConceptGenerator: true,
        // Ranking boost applies to the freelancer's visibility to recruiters.
        jobBoardRankingBoost: true,
        prioritySupport: true,
      },
    },
    {
      code: "ATELIER_PRO",
      name: "Ateliê Pro",
      priceCents: 4900,
      currency: "BRL",
      entitlements: {
        aiAnalysesPerMonth: 200,
        savedDesigns: 1000,
        jobBoardApply: true,
        jobBoardPost: false,
        aiConceptGenerator: true,
        productionAnalytics: true,
        prioritySupport: true,
      },
    },
  ];

  for (const plan of plans) {
    await db.plan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: "MONTH",
        entitlementsJson: JSON.stringify(plan.entitlements),
      },
      update: { entitlementsJson: JSON.stringify(plan.entitlements), priceCents: plan.priceCents },
    });
  }

  // ------------------------------------------------------------ collections --
  const collections = [
    {
      slug: "linha-kaiju",
      name: "Linha KAIJU",
      tagline: "As criaturas da casa — silhuetas pesadas, recorte técnico.",
      description:
        "Nossa linha original. Personagens, esculturas e grafismos desenvolvidos internamente pelo estúdio KAIJU. Nenhuma referência a franquias de terceiros.",
      rightsBasis: "ORIGINAL",
      position: 0,
    },
    {
      slug: "neo-tradicional",
      name: "Neo-tradicional",
      tagline: "Modelagem japonesa clássica, construção contemporânea.",
      description:
        "Haori, kimono e peças de recorte tradicional reinterpretadas em tecidos modernos. Formas de domínio público, execução autoral.",
      rightsBasis: "ORIGINAL",
      position: 1,
    },
    {
      slug: "oficina",
      name: "Oficina",
      tagline: "Utilitário, técnico, feito para durar.",
      description: "Peças de trabalho: bolsos que servem para algo, costura reforçada, tecido que aguenta uso.",
      rightsBasis: "ORIGINAL",
      position: 2,
    },
  ];

  const collectionIds: Record<string, string> = {};
  for (const c of collections) {
    const row = await db.collection.upsert({
      where: { slug: c.slug },
      create: { ...c, published: true },
      update: { ...c, published: true },
    });
    collectionIds[c.slug] = row.id;
  }

  // ---------------------------------------------------------------- products --
  const products = [
    {
      slug: "bomber-kaiju-01",
      name: "Bomber KAIJU 01",
      subtitle: "Sarja pesada, forro acetinado, bordado dorsal",
      description:
        "Bomber de corpo amplo em sarja de algodão 320 g/m², punho e gola em ribana canelada, forro acetinado e bordado dorsal da criatura KAIJU 01 — arte original do estúdio. Feita sob encomenda: cada peça é cortada depois do pedido.",
      category: "OUTERWEAR",
      garmentType: "Jaqueta bomber",
      basePriceCents: 74_900,
      complexity: 4,
      collection: "linha-kaiju",
      tags: [["STYLE", "streetwear"], ["MOTIF", "mecha"], ["PALETTE", "dark"], ["FIT", "oversized"], ["FABRIC", "embroidered"]],
      // O primeiro é o estilo principal: é ele que rege a listagem por estilo.
      styles: ["streetwear-masc", "oversized", "anime-dark"],
      productionDaysMin: 18,
      productionDaysMax: 28,
    },
    {
      slug: "haori-corte-seco",
      name: "Haori Corte Seco",
      subtitle: "Modelagem tradicional, tecido técnico",
      description:
        "Haori de mangas amplas em nylon ripstop matte, com amarração lateral e vivo contrastante. Corte tradicional, material contemporâneo. Peça de forma histórica de domínio público, com execução e grafismo autorais.",
      category: "OUTERWEAR",
      garmentType: "Haori",
      basePriceCents: 58_900,
      complexity: 3,
      collection: "neo-tradicional",
      tags: [["STYLE", "neo_traditional"], ["MOTIF", "wafuku"], ["PALETTE", "dark"], ["FIT", "relaxed"], ["FABRIC", "technical"]],
      // O primeiro é o estilo principal: é ele que rege a listagem por estilo.
      styles: ["japanese-street", "japanese-fashion", "techwear"],
      productionDaysMin: 14,
      productionDaysMax: 22,
    },
    {
      slug: "camiseta-selo-oficina",
      name: "Camiseta Selo Oficina",
      subtitle: "Malha 30.1 penteada, serigrafia à base d'água",
      description:
        "Camiseta de corpo reto em malha penteada 180 g/m², gola careca reforçada com fita, serigrafia à base d'água do selo Oficina. Disponível em pronta-entrega.",
      category: "TOPS",
      garmentType: "Camiseta",
      basePriceCents: 14_900,
      complexity: 1,
      collection: "oficina",
      fulfilment: "STOCKED",
      tags: [["STYLE", "minimal"], ["PALETTE", "dark"], ["FIT", "relaxed"]],
      // O primeiro é o estilo principal: é ele que rege a listagem por estilo.
      styles: ["minimalista-masc", "casual-masc", "normcore"],
      productionDaysMin: 2,
      productionDaysMax: 4,
    },
    {
      slug: "calca-oficina-cargo",
      name: "Calça Oficina Cargo",
      subtitle: "Sarja rígida, seis bolsos, joelho articulado",
      description:
        "Calça de trabalho em sarja 100% algodão 280 g/m², seis bolsos funcionais, joelho com recorte articulado e barra reforçada. Modelagem reta com cós ajustável.",
      category: "BOTTOMS",
      garmentType: "Calça cargo",
      basePriceCents: 42_900,
      complexity: 3,
      collection: "oficina",
      tags: [["STYLE", "techwear"], ["FIT", "utility"], ["PALETTE", "dark"], ["FABRIC", "cotton"]],
      // O primeiro é o estilo principal: é ele que rege a listagem por estilo.
      styles: ["techwear", "workwear", "streetwear-masc"],
      productionDaysMin: 12,
      productionDaysMax: 20,
    },
    {
      slug: "moletom-criatura-noturna",
      name: "Moletom Criatura Noturna",
      subtitle: "Felpa francesa, capuz duplo, bordado no peito",
      description:
        "Moletom de capuz duplo em felpa francesa 340 g/m², bolso canguru embutido e bordado frontal da Criatura Noturna — ilustração original do estúdio.",
      category: "KNITWEAR",
      garmentType: "Moletom",
      basePriceCents: 39_900,
      complexity: 3,
      collection: "linha-kaiju",
      tags: [["STYLE", "streetwear"], ["MOTIF", "kawaii"], ["PALETTE", "pastel"], ["FIT", "oversized"], ["FABRIC", "embroidered"]],
      // O primeiro é o estilo principal: é ele que rege a listagem por estilo.
      styles: ["kawaii-universo", "oversized", "soft-girl"],
      productionDaysMin: 14,
      productionDaysMax: 22,
    },
    {
      slug: "kimono-curto-neon",
      name: "Kimono Curto Neon",
      subtitle: "Cetim de viscose, faixa obi, acabamento manual",
      description:
        "Kimono curto em cetim de viscose com faixa obi destacável e acabamento de barra feito à mão. Paleta com acentos neon sobre base escura.",
      category: "OUTERWEAR",
      garmentType: "Kimono curto",
      basePriceCents: 51_900,
      complexity: 4,
      collection: "neo-tradicional",
      tags: [["STYLE", "cyber"], ["MOTIF", "wafuku"], ["PALETTE", "neon"], ["FIT", "relaxed"]],
      // O primeiro é o estilo principal: é ele que rege a listagem por estilo.
      styles: ["cyber-futurista-fem", "japanese-fashion", "rave-festival"],
      productionDaysMin: 16,
      productionDaysMax: 26,
    },
  ] as const;

  for (const p of products) {
    const product = await db.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        category: p.category,
        garmentType: p.garmentType,
        basePriceCents: p.basePriceCents,
        currency: "BRL",
        complexity: p.complexity,
        fulfilment: "fulfilment" in p ? p.fulfilment : "MADE_TO_ORDER",
        rightsBasis: "ORIGINAL",
        published: true,
        productionDaysMin: p.productionDaysMin,
        productionDaysMax: p.productionDaysMax,
      },
      update: { published: true, basePriceCents: p.basePriceCents, description: p.description },
    });

    for (const [kind, value] of p.tags) {
      await db.productTag.upsert({
        where: { productId_kind_value: { productId: product.id, kind, value } },
        create: { productId: product.id, kind, value },
        update: {},
      });
    }

    // Estilos do catálogo fechado. Um id inválido aqui viraria uma peça
    // invisível na navegação por estilo, então falha alto em vez de gravar.
    for (const [position, styleId] of p.styles.entries()) {
      if (!isStyleId(styleId)) throw new Error(`Seed: estilo desconhecido "${styleId}" em ${p.slug}`);
      await db.productStyle.upsert({
        where: { productId_styleId: { productId: product.id, styleId } },
        create: { productId: product.id, styleId, isPrimary: position === 0, position },
        update: { isPrimary: position === 0, position },
      });
    }

    // O índice de busca é reescrito pela MESMA fórmula do runtime.
    await db.product.update({
      where: { id: product.id },
      data: {
        searchText: buildSearchText({
          name: p.name,
          subtitle: p.subtitle,
          description: p.description,
          garmentType: p.garmentType,
          category: p.category,
          styleIds: p.styles,
        }),
      },
    });

    // Accessories ship one-size; garments carry the full grade.
    const sizes: string[] =
      (p.category as string) === "ACCESSORIES" ? ["ÚNICO"] : ["PP", "P", "M", "G", "GG", "XGG"];
    for (const size of sizes) {
      const sku = `${p.slug.toUpperCase().replace(/-/g, "")}-${size}`;
      await db.productVariant.upsert({
        where: { sku },
        create: {
          productId: product.id,
          sku,
          size,
          colorway: "Padrão",
          stockOnHand: "fulfilment" in p && p.fulfilment === "STOCKED" ? 12 : 0,
        },
        update: {},
      });
    }

    // Media: a technical drawing placeholder, honestly labelled. No stock photos
    // pretending to be the product.
    const existingMedia = await db.productMedia.count({ where: { productId: product.id } });
    if (existingMedia === 0) {
      await db.productMedia.createMany({
        data: [
          { productId: product.id, url: "", alt: `Desenho técnico frontal — ${p.name}`, kind: "TECHNICAL_DRAWING", view: "FRONT", position: 0 },
          { productId: product.id, url: "", alt: `Desenho técnico das costas — ${p.name}`, kind: "TECHNICAL_DRAWING", view: "BACK", position: 1 },
        ],
      });
    }

    const collectionId = collectionIds[p.collection];
    if (collectionId) {
      await db.productCollection.upsert({
        where: { productId_collectionId: { productId: product.id, collectionId } },
        create: { productId: product.id, collectionId },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------- campaign --
  const campaign = await db.campaign.upsert({
    where: { slug: "leve-3-miniatura" },
    create: {
      slug: "leve-3-miniatura",
      name: "Três peças, uma criatura",
      description:
        "Complete três peças entregues e sem devolução em 90 dias e receba uma miniatura original KAIJU, esculpida e impressa em resina pelo nosso estúdio. Escultura autoral — nenhum personagem de terceiro.",
      ruleJson: JSON.stringify({
        kind: "PURCHASE_THRESHOLD",
        minItems: 3,
        minSpendCents: 0,
        categories: [],
        windowDays: 90,
        // A qualifying order counts only after 7 settled days. This is what stops
        // "buy three, claim the miniature, refund everything".
        settlementDays: 7,
        excludeRewardItems: true,
      }),
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 365 * 86_400_000),
      active: true,
      maxGrantsPerUser: 1,
      maxGrantsTotal: 250,
    },
    update: { active: true },
  });

  const existingRewards = await db.reward.count({ where: { campaignId: campaign.id } });
  if (existingRewards === 0) {
    await db.reward.createMany({
      data: [
        {
          campaignId: campaign.id,
          name: "Miniatura KAIJU 01 — resina, 12 cm",
          kind: "MINIATURE_3D",
          description: "Escultura original do estúdio, impressa em resina e pintada à mão. Tiragem limitada.",
          rightsBasis: "ORIGINAL",
          inventoryTotal: 250,
        },
      ],
    });
  }

  // ---------------------------------------------------- demo accounts (dev) --
  // Clearly marked as development accounts. Not customers, not testimonials.
  const passwordHash = await hash(DEMO_PASSWORD);

  const admin = await db.user.upsert({
    where: { email: "admin@kaiju.local" },
    create: {
      email: "admin@kaiju.local",
      displayName: "Operação KAIJU (demo)",
      passwordHash,
      roles: "ADMIN,SUPER_ADMIN",
      emailVerified: new Date(),
    },
    update: {},
  });

  const customer = await db.user.upsert({
    where: { email: "cliente@kaiju.local" },
    create: {
      email: "cliente@kaiju.local",
      displayName: "Cliente Demo",
      passwordHash,
      roles: "CUSTOMER",
      emailVerified: new Date(),
    },
    update: {},
  });

  const existingProfile = await db.measurementProfile.count({ where: { userId: customer.id } });
  if (existingProfile === 0) {
    await db.measurementProfile.create({
      data: {
        userId: customer.id,
        name: "Meu corpo",
        isDefault: true,
        source: "SELF_REPORTED",
        heightMm: 1750, chestMm: 1000, waistMm: 860, hipMm: 1010,
        shoulderMm: 460, sleeveMm: 620, inseamMm: 800, outseamMm: 1050,
        neckMm: 390, thighMm: 580, wristMm: 175, torsoMm: 700,
      },
    });
    await db.address.create({
      data: {
        userId: customer.id,
        label: "Casa",
        recipient: "Cliente Demo",
        line1: "Rua de Exemplo, 100",
        district: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01310100",
        countryCode: "BR",
        isDefault: true,
      },
    });
  }

  // Development ateliers so the matcher has candidates locally. These are not
  // presented anywhere as real partners.
  const ateliers = [
    { email: "atelie.norte@kaiju.local", studio: "Ateliê Norte (demo)", city: "São Paulo", state: "SP", level: "TRUSTED", capacity: 5, maxComplexity: 5, specs: [["GARMENT", "OUTERWEAR", 5], ["GARMENT", "TOPS", 4], ["TECHNIQUE", "EMBROIDERY", 4], ["MATERIAL", "LEATHER", 3]] },
    { email: "atelie.sul@kaiju.local", studio: "Ateliê Sul (demo)", city: "Curitiba", state: "PR", level: "VERIFIED", capacity: 3, maxComplexity: 4, specs: [["GARMENT", "BOTTOMS", 5], ["GARMENT", "TOPS", 4], ["TECHNIQUE", "PRINTING", 3]] },
    { email: "bordado.leste@kaiju.local", studio: "Bordado Leste (demo)", city: "Recife", state: "PE", level: "VERIFIED", capacity: 6, maxComplexity: 3, specs: [["TECHNIQUE", "EMBROIDERY", 5], ["GARMENT", "TOPS", 3]] },
  ] as const;

  for (const a of ateliers) {
    const user = await db.user.upsert({
      where: { email: a.email },
      create: { email: a.email, displayName: a.studio, passwordHash, roles: "CUSTOMER,PRODUCER", emailVerified: new Date() },
      update: {},
    });
    const producer = await db.producer.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        studioName: a.studio,
        city: a.city,
        state: a.state,
        verificationLevel: a.level,
        verifiedAt: new Date(),
        status: "ACTIVE",
        weeklyCapacity: a.capacity,
        maxComplexity: a.maxComplexity,
        qualityScore: 700,
      },
      update: { status: "ACTIVE", verificationLevel: a.level },
    });
    for (const [kind, value, skill] of a.specs) {
      await db.producerSpecialization.upsert({
        where: { producerId_kind_value: { producerId: producer.id, kind, value } },
        create: { producerId: producer.id, kind, value, skillLevel: skill },
        update: { skillLevel: skill },
      });
    }
  }

  // ------------------------------------------------------------ feature flags --
  const flags = [
    { key: "ai.concept_generator", description: "Gerador de conceito visual do plano Designer.", enabled: false },
    { key: "creator.stores", description: "Lojas de criador.", enabled: true },
    { key: "jobs.board", description: "Quadro de vagas e projetos.", enabled: true },
    { key: "wholesale.program", description: "Programa de revenda.", enabled: true },
    { key: "rewards.campaigns", description: "Campanhas de colecionáveis.", enabled: true },
  ];
  for (const flag of flags) {
    await db.featureFlag.upsert({
      where: { key: flag.key },
      create: flag,
      update: { description: flag.description },
    });
  }

  console.log(`
Seed concluído.

Contas de DESENVOLVIMENTO (não são clientes reais):
  admin@kaiju.local     — ADMIN + SUPER_ADMIN
  cliente@kaiju.local   — CUSTOMER, com medidas e endereço
  atelie.norte@kaiju.local / atelie.sul@kaiju.local / bordado.leste@kaiju.local — PRODUCER

  Senha para todas: ${DEMO_PASSWORD}

Catálogo: ${products.length} produtos, ${collections.length} coleções, 1 campanha, ${flags.length} flags.
Nenhuma avaliação, depoimento ou métrica fictícia foi criada — por decisão de produto.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
