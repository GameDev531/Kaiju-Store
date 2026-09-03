/**
 * The application's closed vocabularies.
 *
 * The database stores these as strings (portable across SQLite and PostgreSQL);
 * these unions plus the Zod enums below are what make them safe. Nothing writes
 * one of these columns without passing through the matching parser.
 */
import { z } from "zod";

// `const` type parameter keeps the literal union, so every switch over these stays exhaustive.
const tuple = <const T extends readonly [string, ...string[]]>(v: T) => v;

// ---------------------------------------------------------------- identity ---

export const ROLES = tuple(["CUSTOMER", "PRODUCER", "CREATOR", "SELLER", "RECRUITER", "MODERATOR", "SUPPORT", "FINANCE", "ADMIN", "SUPER_ADMIN"]);
export type Role = (typeof ROLES)[number];
export const RoleSchema = z.enum(ROLES);

/** Roles that require MFA and re-authentication for sensitive operations. */
export const PRIVILEGED_ROLES: readonly Role[] = ["MODERATOR", "SUPPORT", "FINANCE", "ADMIN", "SUPER_ADMIN"];
export const STAFF_ROLES: readonly Role[] = PRIVILEGED_ROLES;

export const USER_STATUSES = tuple(["ACTIVE", "SUSPENDED", "DELETION_REQUESTED", "DELETED"]);
export type UserStatus = (typeof USER_STATUSES)[number];

// ------------------------------------------------------------- references ---

export const REFERENCE_ROLES = tuple(["OVERALL", "SILHOUETTE", "SLEEVES", "COLOR", "DETAILS", "FABRIC", "PRINT", "FIT"]);
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export const ReferenceRoleSchema = z.enum(REFERENCE_ROLES);

export const REFERENCE_ROLE_LABELS: Record<ReferenceRole, { pt: string; hint: string }> = {
  OVERALL: { pt: "Peça inteira", hint: "A referência principal — a peça como um todo." },
  SILHOUETTE: { pt: "Silhueta e caimento", hint: "Use quando o formato do corpo da peça é o que importa." },
  SLEEVES: { pt: "Mangas", hint: "O tipo, comprimento e acabamento da manga." },
  COLOR: { pt: "Paleta de cor", hint: "As cores. Lembre: cor em foto depende da luz e da tela." },
  DETAILS: { pt: "Detalhes e aviamentos", hint: "Bolsos, zíperes, cordões, botões, bordados." },
  FABRIC: { pt: "Tecido e textura", hint: "Uma foto de perto do material ajuda muito." },
  PRINT: { pt: "Estampa e gráfico", hint: "Arte aplicada. Atenção a direitos de uso." },
  FIT: { pt: "Modelagem no corpo", hint: "Como a peça deve vestir: justa, solta, oversized." },
};

export const IP_FLAGS = tuple(["UNREVIEWED", "LIKELY_ORIGINAL", "POSSIBLE_THIRD_PARTY", "RESTRICTED"]);
export type IpFlag = (typeof IP_FLAGS)[number];

// ----------------------------------------------------------------- design ---

export const DESIGN_STATUSES = tuple(["DRAFT", "ANALYZING", "NEEDS_REVIEW", "APPROVED", "ORDERED", "ARCHIVED"]);
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

/** The four epistemic buckets. The whole AI contract rests on this distinction. */
export const CONFIDENCE_KINDS = tuple(["OBSERVED", "INFERRED", "UNCERTAIN", "RECOMMENDED"]);
export type ConfidenceKind = (typeof CONFIDENCE_KINDS)[number];
export const ConfidenceKindSchema = z.enum(CONFIDENCE_KINDS);

export const CONFIDENCE_META: Record<ConfidenceKind, { pt: string; meaning: string; tone: string }> = {
  OBSERVED: {
    pt: "Observado",
    meaning: "Visível diretamente na sua referência.",
    tone: "observed",
  },
  INFERRED: {
    pt: "Deduzido",
    meaning: "Uma leitura provável, não uma certeza. Confira antes de aprovar.",
    tone: "inferred",
  },
  UNCERTAIN: {
    pt: "Incerto",
    meaning: "Não dá para determinar por imagem. Precisa da sua decisão.",
    tone: "uncertain",
  },
  RECOMMENDED: {
    pt: "Sugerido",
    meaning: "Uma proposta do ateliê para chegar perto do resultado visual.",
    tone: "recommended",
  },
};

// --------------------------------------------------------------- catalog ----

export const PRODUCT_CATEGORIES = tuple(["TOPS", "OUTERWEAR", "BOTTOMS", "DRESSES", "KNITWEAR", "ACCESSORIES", "COLLECTIBLE"]);
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  TOPS: "Camisetas e tops",
  OUTERWEAR: "Jaquetas e casacos",
  BOTTOMS: "Calças e shorts",
  DRESSES: "Vestidos e conjuntos",
  KNITWEAR: "Tricô e moletom",
  ACCESSORIES: "Acessórios",
  COLLECTIBLE: "Colecionáveis",
};

export const FULFILMENT_KINDS = tuple(["MADE_TO_ORDER", "STOCKED", "COLLECTIBLE"]);
export type FulfilmentKind = (typeof FULFILMENT_KINDS)[number];

export const RIGHTS_BASES = tuple(["ORIGINAL", "LICENSED", "CREATOR_OWNED"]);
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export const RIGHTS_LABELS: Record<RightsBasis, { label: string; explanation: string }> = {
  ORIGINAL: {
    label: "Criação original KAIJU",
    explanation: "Arte e modelagem desenvolvidas pelo nosso estúdio. Nenhum personagem de terceiros.",
  },
  LICENSED: {
    label: "Licenciado",
    explanation: "Produzido sob contrato com o detentor dos direitos, identificado na ficha do produto.",
  },
  CREATOR_OWNED: {
    label: "Do criador",
    explanation: "Arte de um criador parceiro, que declara ser o titular dos direitos sobre ela.",
  },
};

export const MEDIA_KINDS = tuple(["STUDIO_PHOTO", "FLAT_LAY", "DETAIL_MACRO", "TECHNICAL_DRAWING", "AI_CONCEPT", "CUSTOMER_PHOTO"]);
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Labels that keep a render from ever passing as a photograph of a real garment. */
export const MEDIA_KIND_LABELS: Record<MediaKind, string | null> = {
  STUDIO_PHOTO: null,
  FLAT_LAY: null,
  DETAIL_MACRO: null,
  TECHNICAL_DRAWING: "Desenho técnico",
  AI_CONCEPT: "Conceito gerado por IA — não é foto da peça física",
  CUSTOMER_PHOTO: "Foto enviada por cliente",
};

// ---------------------------------------------------------------- orders ----

export const ORDER_STATUSES = tuple([
  "DRAFT",
  "QUOTED",
  "CUSTOMER_APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "PRODUCER_PENDING",
  "PRODUCER_ACCEPTED",
  "MATERIALS_PREPARATION",
  "CUTTING",
  "SEWING",
  "FINISHING",
  "QUALITY_CONTROL",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "REQUIRES_CUSTOMER_ACTION",
  "REQUIRES_PRODUCER_ACTION",
  "ON_HOLD",
  "DISPUTED",
  "CANCELLED",
  "REFUNDED",
]);
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_STATUS_LABELS: Record<OrderStatus, { pt: string; customerHint: string }> = {
  DRAFT: { pt: "Rascunho", customerHint: "Ainda montando o pedido." },
  QUOTED: { pt: "Orçado", customerHint: "O orçamento está pronto para sua aprovação." },
  CUSTOMER_APPROVED: { pt: "Aprovado por você", customerHint: "Especificação congelada. Falta o pagamento." },
  PAYMENT_PENDING: { pt: "Aguardando pagamento", customerHint: "Estamos aguardando a confirmação do pagamento." },
  PAID: { pt: "Pago", customerHint: "Pagamento confirmado. Procurando o ateliê certo." },
  PRODUCER_PENDING: { pt: "Buscando ateliê", customerHint: "Enviamos sua ficha para ateliês compatíveis." },
  PRODUCER_ACCEPTED: { pt: "Ateliê confirmado", customerHint: "Um ateliê aceitou a produção." },
  MATERIALS_PREPARATION: { pt: "Separando materiais", customerHint: "Tecidos e aviamentos sendo separados." },
  CUTTING: { pt: "Corte", customerHint: "O molde está sendo cortado." },
  SEWING: { pt: "Costura", customerHint: "A peça está sendo montada." },
  FINISHING: { pt: "Acabamento", customerHint: "Detalhes finais, bordado e passadoria." },
  QUALITY_CONTROL: { pt: "Controle de qualidade", customerHint: "Conferindo medidas e acabamento contra a ficha aprovada." },
  READY_TO_SHIP: { pt: "Pronto para envio", customerHint: "Embalado e aguardando coleta." },
  SHIPPED: { pt: "Enviado", customerHint: "A caminho. O código de rastreio está no pedido." },
  DELIVERED: { pt: "Entregue", customerHint: "Entregue. Você tem 7 dias para relatar qualquer problema." },
  COMPLETED: { pt: "Concluído", customerHint: "Pedido encerrado." },
  REQUIRES_CUSTOMER_ACTION: { pt: "Precisa de você", customerHint: "O ateliê tem uma dúvida que só você pode responder." },
  REQUIRES_PRODUCER_ACTION: { pt: "Aguardando o ateliê", customerHint: "Pedimos um retorno ao ateliê." },
  ON_HOLD: { pt: "Em espera", customerHint: "A produção está pausada. O motivo está no histórico." },
  DISPUTED: { pt: "Em análise", customerHint: "Abrimos uma análise sobre este pedido." },
  CANCELLED: { pt: "Cancelado", customerHint: "Pedido cancelado." },
  REFUNDED: { pt: "Reembolsado", customerHint: "O reembolso foi processado." },
};

/** Statuses the customer sees as "in the atelier", used to draw the tracker. */
export const PRODUCTION_STATUSES: readonly OrderStatus[] = [
  "MATERIALS_PREPARATION",
  "CUTTING",
  "SEWING",
  "FINISHING",
  "QUALITY_CONTROL",
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "CANCELLED", "REFUNDED"];

// ------------------------------------------------------------ production ----

export const JOB_STATUSES = tuple([
  "UNASSIGNED",
  "OFFERED",
  "ACCEPTED",
  "IN_PRODUCTION",
  "AWAITING_CLARIFICATION",
  "QC_PENDING",
  "QC_FAILED",
  "COMPLETED",
  "CANCELLED",
  "REASSIGNED",
]);
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PRODUCTION_STAGES = tuple(["MATERIALS", "CUTTING", "SEWING", "EMBROIDERY", "PRINTING", "FINISHING", "QC", "PACKED"]);
export type ProductionStageName = (typeof PRODUCTION_STAGES)[number];

export const STAGE_LABELS: Record<ProductionStageName, string> = {
  MATERIALS: "Materiais",
  CUTTING: "Corte",
  SEWING: "Costura",
  EMBROIDERY: "Bordado",
  PRINTING: "Estampa",
  FINISHING: "Acabamento",
  QC: "Qualidade",
  PACKED: "Embalado",
};

export const JOB_ROLES = tuple(["PRIMARY", "EMBROIDERY", "PRINTING", "THREE_D", "FINISHING"]);
export type JobRole = (typeof JOB_ROLES)[number];

export const VERIFICATION_LEVELS = tuple(["UNVERIFIED", "VERIFIED", "TRUSTED", "PREMIUM"]);
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const VERIFICATION_META: Record<VerificationLevel, { label: string; publicMeaning: string }> = {
  UNVERIFIED: { label: "Não verificado", publicMeaning: "Cadastro criado, documentação ainda não analisada. Não recebe pedidos." },
  VERIFIED: { label: "Verificado", publicMeaning: "Identidade e endereço conferidos por nossa equipe." },
  TRUSTED: { label: "Confiável", publicMeaning: "Verificado, com histórico consistente de entregas no prazo." },
  PREMIUM: { label: "Premium", publicMeaning: "Verificado, com histórico longo e índice de defeitos baixo." },
};

// -------------------------------------------------------------- shipping ----

export const SHIPMENT_STATUSES = tuple([
  "PENDING",
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_ATTEMPT",
  "RETURNED",
  "LOST",
]);
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: "Aguardando postagem",
  LABEL_CREATED: "Etiqueta emitida",
  PICKED_UP: "Coletado",
  IN_TRANSIT: "Em trânsito",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  FAILED_ATTEMPT: "Tentativa de entrega sem sucesso",
  RETURNED: "Devolvido ao remetente",
  LOST: "Extraviado",
};

// ------------------------------------------------------------- jobs board ---

export const DISCIPLINES = tuple(["SEWING", "PATTERN_MAKING", "EMBROIDERY", "ILLUSTRATION", "GRAPHIC_DESIGN", "THREE_D", "PHOTOGRAPHY"]);
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  SEWING: "Costura",
  PATTERN_MAKING: "Modelagem",
  EMBROIDERY: "Bordado",
  ILLUSTRATION: "Ilustração",
  GRAPHIC_DESIGN: "Design gráfico",
  THREE_D: "Modelagem 3D",
  PHOTOGRAPHY: "Fotografia",
};

export const ENGAGEMENTS = tuple(["FULL_TIME", "PART_TIME", "CONTRACT", "PROJECT"]);
export type Engagement = (typeof ENGAGEMENTS)[number];
export const ENGAGEMENT_LABELS: Record<Engagement, string> = {
  FULL_TIME: "Tempo integral",
  PART_TIME: "Meio período",
  CONTRACT: "Contrato",
  PROJECT: "Por projeto",
};

export const LOCATION_MODES = tuple(["ONSITE", "HYBRID", "REMOTE"]);
export type LocationMode = (typeof LOCATION_MODES)[number];
export const LOCATION_MODE_LABELS: Record<LocationMode, string> = {
  ONSITE: "Presencial",
  HYBRID: "Híbrido",
  REMOTE: "Remoto",
};

// ----------------------------------------------------- recommender facets ---

export const FACET_KINDS = tuple(["STYLE", "MOTIF", "PALETTE", "FIT", "FABRIC", "FANDOM_GENRE"]);
export type FacetKind = (typeof FACET_KINDS)[number];

export const INTERACTION_KINDS = tuple(["VIEW", "SEARCH", "ADD_TO_CART", "PURCHASE", "SAVE", "CUSTOMIZE", "DWELL"]);
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export const InteractionKindSchema = z.enum(INTERACTION_KINDS);

// ------------------------------------------------------------- utilities ----

export function parseRoles(raw: string | null | undefined): Role[] {
  if (!raw) return ["CUSTOMER"];
  const parsed = raw
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  return parsed.length > 0 ? parsed : ["CUSTOMER"];
}

export const serializeRoles = (roles: readonly Role[]): string =>
  Array.from(new Set(roles)).sort().join(",");
