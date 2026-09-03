/**
 * Brand and site constants.
 *
 * KAIJU is an original brand: the name, the mark, the sculpts and the garment
 * designs are the company's own. It is not affiliated with, and does not
 * reproduce, any existing franchise. That claim is only true if the catalogue
 * keeps it true, which is why rights metadata is a required field on every
 * product rather than a note in a policy page.
 *
 * Trademark note for the operator: clear the wordmark in your classes (25, 35)
 * and jurisdictions before launch. Nothing in this codebase asserts that it has
 * been cleared.
 */

export const SITE = {
  name: "KAIJU",
  legalName: "KAIJU Atelier",
  tagline: "Ateliê digital de moda sob medida",
  /** The promise, in one line. Used on the home hero and in the OG description. */
  proposition: "Achou a peça perfeita na sua cabeça? Agora faça ela existir.",
  description:
    "KAIJU transforma referências visuais em ficha técnica de produção. Você aprova cada linha, um ateliê verificado costura, e a peça chega pelo correio.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  locale: "pt-BR",
  currency: "BRL",
  /** Contact routes. Response windows are commitments — keep them achievable. */
  contact: {
    support: "suporte@kaiju.example",
    copyright: "direitos@kaiju.example",
    privacy: "privacidade@kaiju.example",
    partners: "ateliês@kaiju.example",
    responseHours: 48,
  },
  policyVersion: "2026-09-01",
} as const;

export const NAV_PRIMARY = [
  { href: "/loja", label: "Loja" },
  { href: "/colecoes", label: "Coleções" },
  { href: "/criar", label: "Criar minha peça" },
  { href: "/criadores", label: "Criadores" },
  { href: "/trabalhos", label: "Trabalhos" },
  { href: "/como-funciona", label: "Como funciona" },
] as const;

export const NAV_FOOTER = {
  Produto: [
    { href: "/loja", label: "Loja" },
    { href: "/colecoes", label: "Coleções" },
    { href: "/criar", label: "Criar minha peça" },
    { href: "/recompensas", label: "Campanhas e colecionáveis" },
    { href: "/rastrear", label: "Rastrear pedido" },
  ],
  Ecossistema: [
    { href: "/atelie/entrar", label: "Sou costureiro(a)" },
    { href: "/criadores/abrir", label: "Sou criador(a)" },
    { href: "/revenda", label: "Sou lojista" },
    { href: "/trabalhos", label: "Vagas e projetos" },
    { href: "/planos", label: "Planos e ferramentas" },
  ],
  Confiança: [
    { href: "/como-funciona", label: "Como funciona" },
    { href: "/sobre", label: "Sobre" },
    { href: "/faq", label: "Perguntas frequentes" },
    { href: "/contato", label: "Contato" },
    { href: "/politicas/direitos-autorais", label: "Direitos autorais" },
  ],
  Políticas: [
    { href: "/politicas/envio", label: "Envio" },
    { href: "/politicas/trocas", label: "Trocas e refação" },
    { href: "/politicas/privacidade", label: "Privacidade" },
    { href: "/politicas/termos", label: "Termos de uso" },
    { href: "/politicas/cookies", label: "Cookies" },
  ],
} as const;

/**
 * The five FAQ entries on the primary FAQ section — the questions a real
 * customer asks before spending money on something that does not exist yet.
 * Exactly five, deliberately: a wall of twenty reads as evasion.
 */
export const PRIMARY_FAQ = [
  {
    q: "Como funciona uma peça sob medida aqui?",
    a: "Você envia uma ou mais referências e diz para que serve cada uma — esta é a silhueta, esta é a manga, esta é a cor. Nosso analisador monta uma ficha técnica estruturada com tudo o que dá para determinar, e marca claramente o que não dá. Você edita, aprova linha por linha, e só então o pedido vai para um ateliê verificado. Você acompanha corte, costura e acabamento com fotos reais da sua peça.",
  },
  {
    q: "O quanto a análise por IA acerta?",
    a: "Ela acerta o que é visível e erra o que não é — e a diferença está escrita na tela. Cada campo da ficha vem marcado como Observado, Deduzido, Incerto ou Sugerido. Composição de tecido, gramatura, cor calibrada e medidas em centímetros não são determináveis por foto, e nós não fingimos que são: aparecem como incertos ou como sugestão do ateliê, esperando a sua decisão. A ficha que vai para a costureira é a que você aprovou, não a que a IA propôs.",
  },
  {
    q: "Como funcionam as medidas?",
    a: "Você preenche um perfil de medidas com fita métrica seguindo nosso guia — leva uns cinco minutos. Sem medidas, o pedido não entra em produção: é um bloqueio explícito, não um esquecimento. Toda peça é feita com uma tolerância acordada (padrão ±15 mm), e o ateliê confere as medidas finais contra a ficha aprovada no controle de qualidade, registrando os números.",
  },
  {
    q: "Quanto tempo leva a produção?",
    a: "Depende da complexidade da peça, e o prazo aparece no seu orçamento antes de você pagar — normalmente entre 7 e 40 dias de produção, mais o envio. Peças com bordado, couro ou construção elaborada ficam na faixa mais longa. Se um ateliê atrasar, você vê isso no acompanhamento do pedido, não descobre pelo silêncio.",
  },
  {
    q: "E se a peça chegar diferente da ficha que aprovei?",
    a: "A ficha aprovada é o contrato de produção, e ela fica registrada com uma assinatura digital da versão exata. Se a peça divergir dela — medida fora da tolerância, material trocado, detalhe faltando — o conserto é por nossa conta: refação ou reembolso, conforme o caso, definido na Política de trocas e refação. Erro de medida informada por você é tratado de forma diferente, e a política diz exatamente como.",
  },
] as const;
