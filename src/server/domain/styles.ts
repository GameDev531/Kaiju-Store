/**
 * O catálogo de estilos.
 *
 * Esta é a espinha do produto para busca e recomendação. Um estilo não é uma
 * etiqueta solta: ele carrega
 *
 *   · `aliases` — como as pessoas realmente escrevem. Inclui erro comum de
 *     grafia, mistura de português e inglês, e o termo que só existe no TikTok.
 *     Sem isso, quem procura "kaual" ou "old money style" não acha nada.
 *   · `facets` — as dimensões que o recomendador pontua. Dois estilos podem
 *     compartilhar paleta sem compartilhar silhueta, e é essa sobreposição
 *     parcial que faz uma recomendação parecer inteligente em vez de aleatória.
 *   · `related` — vizinhança curada, para "quem gosta disto costuma gostar".
 *
 * Grupo é APRESENTAÇÃO, não identidade. Um estilo listado em FEMININO descreve
 * a modelagem com que a peça é normalmente cortada, e qualquer pessoa pode pedir
 * qualquer estilo em qualquer modelagem. A interface diz isso explicitamente.
 */

export const STYLE_GROUPS = ["FEMININO", "MASCULINO", "UNIVERSOS"] as const;
export type StyleGroup = (typeof STYLE_GROUPS)[number];

export const STYLE_GROUP_META: Record<StyleGroup, { label: string; blurb: string }> = {
  FEMININO: {
    label: "Feminino",
    blurb: "Estéticas normalmente cortadas em modelagem feminina. Qualquer uma pode ser pedida em modelagem unissex ou masculina.",
  },
  MASCULINO: {
    label: "Masculino",
    blurb: "Estéticas normalmente cortadas em modelagem masculina. Qualquer uma pode ser pedida em modelagem unissex ou feminina.",
  },
  UNIVERSOS: {
    label: "Universos",
    blurb: "Estéticas que vêm de uma cultura, não de uma modelagem. Servem para qualquer corpo e qualquer corte.",
  },
};

export interface StyleDefinition {
  /** Identificador estável em kebab-case. Vai na URL e no banco. */
  id: string;
  label: string;
  group: StyleGroup;
  /** Agrupamento de navegação dentro do grupo. */
  family: string;
  /** Uma linha, voz do cliente. Aparece no cartão e na página do estilo. */
  description: string;
  /** Sinônimos de busca. Sempre em minúscula e sem acento — normalizados na carga. */
  aliases: string[];
  /** Facetas que o recomendador pontua. */
  facets: string[];
  /** Vizinhança curada. */
  related: string[];
}

const S = (d: StyleDefinition): StyleDefinition => d;

// ============================================================== FEMININO =====

const FEMININO: StyleDefinition[] = [
  S({
    id: "elegante-sofisticado",
    label: "Elegante / Sofisticado",
    group: "FEMININO",
    family: "Refinado",
    description: "Caimento impecável, tecido nobre, nada gritando. Elegância que se nota de perto.",
    aliases: ["elegante", "sofisticado", "sofisticada", "chique", "chic", "classy", "refinado", "elegant"],
    facets: ["STYLE:elegante", "PALETTE:neutral", "FIT:tailored", "FORMALITY:formal", "FABRIC:satin"],
    related: ["quiet-luxury", "old-money", "alfaiataria-moderna", "glamouroso"],
  }),
  S({
    id: "casual-fem",
    label: "Casual",
    group: "FEMININO",
    family: "Dia a dia",
    description: "O que você veste sem pensar e ainda assim funciona. Confortável sem ser desleixado.",
    aliases: ["casual", "kaual", "dia a dia", "basico", "basica", "everyday", "confortavel"],
    facets: ["STYLE:casual", "FIT:relaxed", "FORMALITY:casual", "FABRIC:cotton"],
    related: ["clean-girl", "minimalista-fem", "normcore", "sporty-athleisure"],
  }),
  S({
    id: "clean-girl",
    label: "Clean Girl",
    group: "FEMININO",
    family: "Minimal",
    description: "Linhas limpas, tons neutros, zero excesso. A estética do 'pouco, mas certo'.",
    aliases: ["clean girl", "cleangirl", "clean", "limpa", "minimal chic", "effortless"],
    facets: ["STYLE:clean", "PALETTE:neutral", "FIT:fitted", "FORMALITY:smart_casual"],
    related: ["minimalista-fem", "quiet-luxury", "casual-fem", "coastal-grandmother"],
  }),
  S({
    id: "minimalista-fem",
    label: "Minimalista",
    group: "FEMININO",
    family: "Minimal",
    description: "Sem estampa, sem aplique, sem ruído. A peça se sustenta pelo corte.",
    aliases: ["minimalista", "minimalismo", "minimal", "minimalist", "clean", "sem estampa"],
    facets: ["STYLE:minimal", "PALETTE:monochrome", "FIT:tailored", "FORMALITY:smart_casual"],
    related: ["clean-girl", "quiet-luxury", "normcore", "alfaiataria-moderna"],
  }),
  S({
    id: "quiet-luxury",
    label: "Quiet Luxury",
    group: "FEMININO",
    family: "Refinado",
    description: "Luxo que não anuncia. Tecido caro, corte discreto, nenhuma logomarca visível.",
    aliases: ["quiet luxury", "luxo silencioso", "stealth wealth", "discreto", "sem logo", "luxo discreto"],
    facets: ["STYLE:quiet_luxury", "PALETTE:neutral", "FIT:tailored", "FORMALITY:smart_casual", "FABRIC:knit"],
    related: ["old-money", "minimalista-fem", "elegante-sofisticado", "clean-girl"],
  }),
  S({
    id: "old-money",
    label: "Old Money",
    group: "FEMININO",
    family: "Refinado",
    description: "Herdado, não comprado. Náutico, equestre, clube — o guarda-roupa que atravessa décadas.",
    aliases: ["old money", "oldmoney", "dinheiro antigo", "aristocratico", "country club", "nautico"],
    facets: ["STYLE:old_money", "PALETTE:neutral", "FIT:tailored", "FORMALITY:smart_casual", "ERA:classic"],
    related: ["quiet-luxury", "coastal-grandmother", "preppy-masc", "ivy-league"],
  }),
  S({
    id: "coastal-grandmother",
    label: "Coastal Grandmother",
    group: "FEMININO",
    family: "Refinado",
    description: "Linho amassado, tricô largo, tons de areia. Casa de praia fora de temporada.",
    aliases: ["coastal grandmother", "coastal", "vovo da praia", "linho", "praia", "beach house", "riviera"],
    facets: ["STYLE:coastal", "PALETTE:neutral", "FIT:relaxed", "FABRIC:linen", "FORMALITY:casual"],
    related: ["old-money", "quiet-luxury", "boho-fem", "clean-girl"],
  }),
  S({
    id: "alfaiataria-moderna",
    label: "Alfaiataria Moderna",
    group: "FEMININO",
    family: "Estruturado",
    description: "Ombro marcado, pinça no lugar certo, mas com liberdade que o terno clássico não tem.",
    aliases: ["alfaiataria", "alfaiataria moderna", "tailoring", "blazer", "terno feminino", "estruturado"],
    facets: ["STYLE:tailoring", "FIT:tailored", "FORMALITY:business", "PALETTE:monochrome"],
    related: ["office-executiva", "business-casual-fem", "minimalista-fem", "elegante-sofisticado"],
  }),
  S({
    id: "office-executiva",
    label: "Office / Executiva",
    group: "FEMININO",
    family: "Estruturado",
    description: "Autoridade sem rigidez. Feito para uma reunião de quatro horas e o jantar depois.",
    aliases: ["office", "executiva", "escritorio", "trabalho", "corporativo", "workwear feminino", "power dressing"],
    facets: ["STYLE:office", "FIT:tailored", "FORMALITY:business", "PALETTE:neutral"],
    related: ["alfaiataria-moderna", "business-casual-fem", "quiet-luxury"],
  }),
  S({
    id: "business-casual-fem",
    label: "Business Casual",
    group: "FEMININO",
    family: "Estruturado",
    description: "Entre o escritório e a rua. Estruturado o suficiente, relaxado o bastante.",
    aliases: ["business casual", "smart casual", "semi formal", "escritorio descontraido"],
    facets: ["STYLE:business_casual", "FIT:tailored", "FORMALITY:smart_casual", "PALETTE:neutral"],
    related: ["office-executiva", "alfaiataria-moderna", "clean-girl", "smart-casual"],
  }),
  S({
    id: "streetwear-fem",
    label: "Streetwear / Urbano",
    group: "FEMININO",
    family: "Urbano",
    description: "Silhueta larga, gráfico forte, tênis pesado. A rua ditando a regra.",
    aliases: ["streetwear", "street wear", "urbano", "street", "hype", "moda de rua"],
    facets: ["STYLE:streetwear", "FIT:oversized", "PALETTE:dark", "MOTIF:graphic", "FORMALITY:casual"],
    related: ["y2k-fem", "baddie", "skater-fem", "hip-hop"],
  }),
  S({
    id: "y2k-fem",
    label: "Y2K",
    group: "FEMININO",
    family: "Retrô",
    description: "Ano 2000 sem ironia. Cintura baixa, brilho, metálico, celular de flip.",
    aliases: ["y2k", "anos 2000", "2000s", "dosmil", "baby tee", "cintura baixa", "metalico"],
    facets: ["STYLE:y2k", "ERA:y2k", "PALETTE:bright", "FIT:cropped", "FABRIC:satin"],
    related: ["baddie", "streetwear-fem", "vintage-retro-fem", "barbiecore"],
  }),
  S({
    id: "barbiecore",
    label: "Barbiecore",
    group: "FEMININO",
    family: "Cor",
    description: "Rosa sem pedir licença. Hiperfeminino, saturado, deliberadamente exagerado.",
    aliases: ["barbiecore", "barbie", "rosa", "pink", "hot pink", "all pink"],
    facets: ["STYLE:barbiecore", "PALETTE:bright", "MOTIF:kawaii", "FIT:fitted"],
    related: ["dopamine-dressing", "y2k-fem", "coquette", "glamouroso"],
  }),
  S({
    id: "glamouroso",
    label: "Glamouroso",
    group: "FEMININO",
    family: "Cor",
    description: "Para ser vista. Brilho, drapeado, fenda, e nenhuma vontade de passar despercebida.",
    aliases: ["glamour", "glamouroso", "glamurosa", "festa", "balada", "brilho", "paete", "glam"],
    facets: ["STYLE:glam", "PALETTE:bright", "FABRIC:satin", "FORMALITY:formal", "FIT:fitted"],
    related: ["elegante-sofisticado", "barbiecore", "dopamine-dressing", "formalwear"],
  }),
  S({
    id: "dopamine-dressing",
    label: "Dopamine Dressing",
    group: "FEMININO",
    family: "Cor",
    description: "Cor como decisão de humor. Combinações que não deveriam funcionar e funcionam.",
    aliases: ["dopamine dressing", "dopamina", "colorido", "color block", "cores vibrantes", "maximalismo"],
    facets: ["STYLE:dopamine", "PALETTE:bright", "FIT:relaxed"],
    related: ["barbiecore", "glamouroso", "indie", "harajuku"],
  }),
  S({
    id: "romantico-delicado",
    label: "Romântico / Delicado",
    group: "FEMININO",
    family: "Suave",
    description: "Renda, babado, transparência leve. Suavidade construída com técnica.",
    aliases: ["romantico", "romantica", "delicado", "delicada", "renda", "babado", "feminino classico"],
    facets: ["STYLE:romantic", "PALETTE:pastel", "FABRIC:lace", "MOTIF:floral", "FIT:fitted"],
    related: ["coquette", "soft-girl", "cottagecore", "balletcore"],
  }),
  S({
    id: "coquette",
    label: "Coquette",
    group: "FEMININO",
    family: "Suave",
    description: "Laço, cetim, gola de renda. Feminilidade deliberada, quase teatral.",
    aliases: ["coquette", "coquete", "laco", "laços", "bow", "cetim", "ribbon"],
    facets: ["STYLE:coquette", "PALETTE:pastel", "FABRIC:lace", "MOTIF:bow", "FIT:fitted"],
    related: ["romantico-delicado", "balletcore", "soft-girl", "barbiecore"],
  }),
  S({
    id: "soft-girl",
    label: "Soft Girl",
    group: "FEMININO",
    family: "Suave",
    description: "Pastel, coração, blush. A internet dos anos 2010 virada roupa.",
    aliases: ["soft girl", "softgirl", "soft", "pastel", "fofo", "meiga"],
    facets: ["STYLE:soft", "PALETTE:pastel", "MOTIF:kawaii", "FIT:relaxed"],
    related: ["coquette", "kawaii-fem", "romantico-delicado", "vsco"],
  }),
  S({
    id: "cottagecore",
    label: "Cottagecore",
    group: "FEMININO",
    family: "Suave",
    description: "Floral miúdo, algodão, avental. Uma vida no campo que talvez nunca tenha existido.",
    aliases: ["cottagecore", "cottage", "campo", "floral", "rural", "vintage rural", "prairie"],
    facets: ["STYLE:cottagecore", "PALETTE:earth", "MOTIF:floral", "FABRIC:cotton", "FIT:relaxed"],
    related: ["fairycore", "romantico-delicado", "boho-fem", "light-academia"],
  }),
  S({
    id: "fairycore",
    label: "Fairycore",
    group: "FEMININO",
    family: "Suave",
    description: "Tule, camada, verde musgo. Cottagecore com um pé no folclore.",
    aliases: ["fairycore", "fairy", "fada", "tule", "etereo", "magico", "elfico"],
    facets: ["STYLE:fairycore", "PALETTE:pastel", "MOTIF:floral", "FABRIC:tulle", "FIT:relaxed"],
    related: ["cottagecore", "balletcore", "fantasy-rpg", "romantico-delicado"],
  }),
  S({
    id: "balletcore",
    label: "Balletcore",
    group: "FEMININO",
    family: "Suave",
    description: "Ombro cruzado, malha fina, fita amarrada. Sala de ensaio como guarda-roupa.",
    aliases: ["balletcore", "ballet", "bale", "bailarina", "ballerina", "sapatilha", "tule"],
    facets: ["STYLE:balletcore", "PALETTE:pastel", "FIT:fitted", "FABRIC:knit"],
    related: ["coquette", "fairycore", "romantico-delicado", "clean-girl"],
  }),
  S({
    id: "gotico-dark",
    label: "Gótico / Dark",
    group: "FEMININO",
    family: "Alternativo",
    description: "Preto como base, não como acidente. Estrutura, veludo, silhueta dramática.",
    aliases: ["gotico", "gotica", "goth", "gothic", "dark", "escuro", "preto", "sombrio"],
    facets: ["STYLE:goth", "PALETTE:dark", "MOTIF:occult", "FABRIC:velvet", "FIT:fitted"],
    related: ["e-girl", "grunge-fem", "punk-fem", "dark-academia", "anime-dark"],
  }),
  S({
    id: "e-girl",
    label: "E-girl / Alternative",
    group: "FEMININO",
    family: "Alternativo",
    description: "Xadrez, corrente, manga listrada. Nasceu online e continua morando lá.",
    aliases: ["e-girl", "egirl", "e girl", "alternative", "alternativa", "alt", "internet"],
    facets: ["STYLE:egirl", "PALETTE:dark", "MOTIF:graphic", "FIT:fitted", "FANDOM_GENRE:internet"],
    related: ["gotico-dark", "grunge-fem", "harajuku", "cyber-gamer"],
  }),
  S({
    id: "grunge-fem",
    label: "Grunge",
    group: "FEMININO",
    family: "Alternativo",
    description: "Flanela, desgaste, sobreposição descuidada de propósito. Anos 90 de Seattle.",
    aliases: ["grunge", "grunge feminino", "flanela", "anos 90", "90s", "desgastado", "vintage sujo"],
    facets: ["STYLE:grunge", "PALETTE:dark", "ERA:nineties", "FIT:oversized", "FABRIC:denim"],
    related: ["punk-fem", "e-girl", "gotico-dark", "vintage-retro-fem", "rock"],
  }),
  S({
    id: "punk-fem",
    label: "Punk",
    group: "FEMININO",
    family: "Alternativo",
    description: "Tacha, rasgo, alfinete. Construído para incomodar e durar.",
    aliases: ["punk", "punk rock", "tachas", "rebite", "rasgado", "anarquico", "diy"],
    facets: ["STYLE:punk", "PALETTE:dark", "FABRIC:leather", "MOTIF:hardware", "FIT:fitted"],
    related: ["grunge-fem", "gotico-dark", "rock", "biker"],
  }),
  S({
    id: "cyber-futurista-fem",
    label: "Cyber / Futurista",
    group: "FEMININO",
    family: "Alternativo",
    description: "Refletivo, recorte técnico, acento neon. Roupa de um futuro que já chegou.",
    aliases: ["cyber", "cyberpunk", "futurista", "futuro", "neon", "tech", "sci-fi", "refletivo"],
    facets: ["STYLE:cyber", "PALETTE:neon", "FABRIC:technical", "MOTIF:mecha", "FIT:fitted"],
    related: ["techwear", "cyber-gamer", "e-girl", "rave-festival"],
  }),
  S({
    id: "dark-academia",
    label: "Dark Academia",
    group: "FEMININO",
    family: "Acadêmico",
    description: "Tweed, xadrez, marrom e bordô. Biblioteca antiga em novembro.",
    aliases: ["dark academia", "academia sombria", "tweed", "biblioteca", "universitario classico", "outono"],
    facets: ["STYLE:dark_academia", "PALETTE:earth", "FABRIC:tweed", "FORMALITY:smart_casual", "ERA:classic"],
    related: ["light-academia", "gotico-dark", "vintage-retro-fem", "preppy-masc", "academia-masc"],
  }),
  S({
    id: "light-academia",
    label: "Light Academia",
    group: "FEMININO",
    family: "Acadêmico",
    description: "A mesma biblioteca, em maio. Creme, bege, linho, luz entrando pela janela.",
    aliases: ["light academia", "academia clara", "creme", "bege", "classico claro"],
    facets: ["STYLE:light_academia", "PALETTE:neutral", "FABRIC:linen", "FORMALITY:smart_casual"],
    related: ["dark-academia", "cottagecore", "old-money", "clean-girl"],
  }),
  S({
    id: "vintage-retro-fem",
    label: "Vintage / Retro",
    group: "FEMININO",
    family: "Retrô",
    description: "Corte de outra década, executado hoje. Sem fantasia, sem cosplay de época.",
    aliases: ["vintage", "retro", "retrô", "antigo", "anos 50", "anos 70", "anos 80", "brechó", "brecho"],
    facets: ["STYLE:retro", "ERA:retro", "PALETTE:earth", "FIT:fitted"],
    related: ["y2k-fem", "grunge-fem", "cottagecore", "dark-academia"],
  }),
  S({
    id: "vsco",
    label: "VSCO",
    group: "FEMININO",
    family: "Dia a dia",
    description: "Camiseta larga, scrunchie, tênis surrado. Verão fotografado com filtro.",
    aliases: ["vsco", "vsco girl", "verao", "praia casual", "surf casual", "scrunchie"],
    facets: ["STYLE:vsco", "PALETTE:pastel", "FIT:oversized", "FORMALITY:casual"],
    related: ["soft-girl", "casual-fem", "skate-surf", "coastal-grandmother"],
  }),
  S({
    id: "kawaii-fem",
    label: "Kawaii",
    group: "FEMININO",
    family: "Japonês",
    description: "Fofo levado a sério. Cor doce, personagem, proporção infantilizada de propósito.",
    aliases: ["kawaii", "fofo", "fofa", "cute", "japones fofo", "decora"],
    facets: ["STYLE:kawaii", "PALETTE:pastel", "MOTIF:kawaii", "FANDOM_GENRE:anime", "FIT:relaxed"],
    related: ["harajuku", "soft-girl", "anime-casual", "barbiecore", "kawaii-universo"],
  }),
  S({
    id: "harajuku",
    label: "Harajuku",
    group: "FEMININO",
    family: "Japonês",
    description: "Sobreposição sem regra, cor sem hierarquia. Tóquio como colagem.",
    aliases: ["harajuku", "japones de rua", "tokyo", "decora", "colorido japones", "fruits"],
    facets: ["STYLE:harajuku", "PALETTE:bright", "MOTIF:kawaii", "FANDOM_GENRE:japanese", "FIT:oversized"],
    related: ["kawaii-fem", "japanese-street", "dopamine-dressing", "e-girl"],
  }),
  S({
    id: "sporty-athleisure",
    label: "Sporty / Athleisure",
    group: "FEMININO",
    family: "Esportivo",
    description: "Tecido de treino em corte de rua. Feito para o dia inteiro, não só para a academia.",
    aliases: ["sporty", "athleisure", "esportivo", "esportiva", "academia", "treino", "legging", "conjunto"],
    facets: ["STYLE:athleisure", "FABRIC:technical", "FIT:fitted", "FORMALITY:athletic"],
    related: ["gymwear", "casual-fem", "skater-fem", "techwear"],
  }),
  S({
    id: "skater-fem",
    label: "Skater",
    group: "FEMININO",
    family: "Urbano",
    description: "Calça larga, camiseta grande, tênis de skate. Roupa que aguenta cair.",
    aliases: ["skater", "skate", "skatista", "calca larga", "baggy"],
    facets: ["STYLE:skate", "FIT:oversized", "PALETTE:dark", "FORMALITY:casual"],
    related: ["streetwear-fem", "grunge-fem", "skate-surf", "vsco"],
  }),
  S({
    id: "boho-fem",
    label: "Boho",
    group: "FEMININO",
    family: "Suave",
    description: "Franja, crochê, estampa terrosa. Camada sobre camada, sem pressa.",
    aliases: ["boho", "bohemio", "bohemia", "boemio", "hippie", "crochê", "croche", "franja", "gipsy"],
    facets: ["STYLE:boho", "PALETTE:earth", "FABRIC:crochet", "FIT:relaxed", "MOTIF:floral"],
    related: ["cottagecore", "coastal-grandmother", "indie", "vintage-retro-fem"],
  }),
  S({
    id: "indie",
    label: "Indie",
    group: "FEMININO",
    family: "Alternativo",
    description: "Garimpo, cor improvável, nada de coleção. Roupa que não combina de propósito.",
    aliases: ["indie", "indie sleaze", "alternativo", "brecho", "garimpo", "eclético", "ecletico"],
    facets: ["STYLE:indie", "PALETTE:bright", "ERA:retro", "FIT:relaxed"],
    related: ["vintage-retro-fem", "grunge-fem", "boho-fem", "dopamine-dressing"],
  }),
  S({
    id: "baddie",
    label: "Baddie",
    group: "FEMININO",
    family: "Urbano",
    description: "Justo, confiante, acabamento impecável. Construído para a foto e para a rua.",
    aliases: ["baddie", "bad girl", "justo", "colado", "instagram", "glow up"],
    facets: ["STYLE:baddie", "FIT:fitted", "PALETTE:dark", "FORMALITY:casual"],
    related: ["y2k-fem", "streetwear-fem", "glamouroso", "hip-hop"],
  }),
  S({
    id: "modest-fashion",
    label: "Modest Fashion",
    group: "FEMININO",
    family: "Dia a dia",
    description: "Cobertura ampla sem abrir mão de corte. Manga longa, comprimento generoso, caimento fluido.",
    aliases: ["modest", "modest fashion", "moda modesta", "recatado", "manga longa", "comprido", "coberto"],
    facets: ["STYLE:modest", "FIT:relaxed", "FORMALITY:smart_casual", "PALETTE:neutral"],
    related: ["elegante-sofisticado", "minimalista-fem", "light-academia", "quiet-luxury"],
  }),
];

// ============================================================= MASCULINO =====

const MASCULINO: StyleDefinition[] = [
  S({
    id: "elegante-social",
    label: "Elegante / Social",
    group: "MASCULINO",
    family: "Refinado",
    description: "Camisa que cai, calça que assenta. Elegância sem esforço aparente.",
    aliases: ["elegante", "social", "arrumado", "classico", "elegant", "camisa social"],
    facets: ["STYLE:elegante", "FIT:tailored", "FORMALITY:formal", "PALETTE:neutral"],
    related: ["alfaiataria-masc", "formalwear", "smart-casual", "old-money-masc"],
  }),
  S({
    id: "formalwear",
    label: "Formalwear / Festa",
    group: "MASCULINO",
    family: "Refinado",
    description: "Smoking, black tie, casamento. As ocasiões em que o corte não perdoa erro.",
    aliases: ["formalwear", "formal", "festa", "smoking", "black tie", "casamento", "terno", "gala"],
    facets: ["STYLE:formal", "FIT:tailored", "FORMALITY:formal", "FABRIC:wool"],
    related: ["elegante-social", "alfaiataria-masc", "mafioso-classico"],
  }),
  S({
    id: "casual-masc",
    label: "Casual",
    group: "MASCULINO",
    family: "Dia a dia",
    description: "Camiseta, calça reta, tênis limpo. O básico feito com tecido que dura.",
    aliases: ["casual", "kaual", "dia a dia", "basico", "everyday", "simples"],
    facets: ["STYLE:casual", "FIT:relaxed", "FORMALITY:casual", "FABRIC:cotton"],
    related: ["smart-casual", "normcore", "minimalista-masc", "streetwear-masc"],
  }),
  S({
    id: "smart-casual",
    label: "Smart Casual",
    group: "MASCULINO",
    family: "Dia a dia",
    description: "Camisa com tênis, blazer com jeans. A zona onde a maioria dos dias acontece.",
    aliases: ["smart casual", "casual arrumado", "semi formal", "business casual"],
    facets: ["STYLE:smart_casual", "FIT:tailored", "FORMALITY:smart_casual", "PALETTE:neutral"],
    related: ["casual-masc", "elegante-social", "preppy-masc", "ivy-league"],
  }),
  S({
    id: "normcore",
    label: "Normcore",
    group: "MASCULINO",
    family: "Minimal",
    description: "Deliberadamente comum. Peça sem assinatura, escolhida com precisão.",
    aliases: ["normcore", "normal", "comum", "sem marca", "anonimo", "basico extremo"],
    facets: ["STYLE:normcore", "PALETTE:neutral", "FIT:relaxed", "FORMALITY:casual"],
    related: ["minimalista-masc", "casual-masc", "quiet-luxury-masc"],
  }),
  S({
    id: "minimalista-masc",
    label: "Minimalista",
    group: "MASCULINO",
    family: "Minimal",
    description: "Paleta curta, corte limpo, nada supérfluo. O guarda-roupa que se combina sozinho.",
    aliases: ["minimalista", "minimal", "minimalismo", "sem estampa", "monocromatico"],
    facets: ["STYLE:minimal", "PALETTE:monochrome", "FIT:tailored", "FORMALITY:smart_casual"],
    related: ["normcore", "quiet-luxury-masc", "smart-casual", "japanese-street"],
  }),
  S({
    id: "quiet-luxury-masc",
    label: "Quiet Luxury",
    group: "MASCULINO",
    family: "Refinado",
    description: "Caxemira sem etiqueta à mostra. Quem entende, reconhece; quem não entende, não vê.",
    aliases: ["quiet luxury", "luxo discreto", "stealth wealth", "sem logo", "caxemira"],
    facets: ["STYLE:quiet_luxury", "PALETTE:neutral", "FIT:tailored", "FABRIC:knit", "FORMALITY:smart_casual"],
    related: ["old-money-masc", "minimalista-masc", "elegante-social", "normcore"],
  }),
  S({
    id: "old-money-masc",
    label: "Old Money",
    group: "MASCULINO",
    family: "Refinado",
    description: "Polo, malha sobre os ombros, mocassim. Guarda-roupa herdado e mantido.",
    aliases: ["old money", "oldmoney", "dinheiro antigo", "clube", "nautico", "aristocratico"],
    facets: ["STYLE:old_money", "PALETTE:neutral", "FIT:tailored", "ERA:classic", "FORMALITY:smart_casual"],
    related: ["quiet-luxury-masc", "ivy-league", "preppy-masc", "elegante-social"],
  }),
  S({
    id: "ivy-league",
    label: "Ivy League / Trad",
    group: "MASCULINO",
    family: "Acadêmico",
    description: "Oxford, tweed, gravata listrada. O uniforme não escrito do campus americano.",
    aliases: ["ivy league", "ivy", "trad", "universitario", "oxford", "campus", "americano classico"],
    facets: ["STYLE:ivy", "PALETTE:neutral", "FIT:tailored", "FABRIC:tweed", "FORMALITY:smart_casual"],
    related: ["preppy-masc", "old-money-masc", "academia-masc", "dark-academia"],
  }),
  S({
    id: "alfaiataria-masc",
    label: "Alfaiataria",
    group: "MASCULINO",
    family: "Estruturado",
    description: "Ombro construído, lapela proporcional, entretela de verdade. Onde a costura aparece.",
    aliases: ["alfaiataria", "tailoring", "terno", "blazer", "sob medida", "bespoke", "estruturado"],
    facets: ["STYLE:tailoring", "FIT:tailored", "FORMALITY:formal", "FABRIC:wool"],
    related: ["formalwear", "elegante-social", "mafioso-classico", "smart-casual"],
  }),
  S({
    id: "preppy-masc",
    label: "Preppy",
    group: "MASCULINO",
    family: "Acadêmico",
    description: "Listra, polo, cor sólida. Arrumado com um sorriso, nunca sério demais.",
    aliases: ["preppy", "prep", "polo", "listrado", "colegial", "nautico"],
    facets: ["STYLE:preppy", "PALETTE:bright", "FIT:tailored", "FORMALITY:smart_casual"],
    related: ["ivy-league", "old-money-masc", "smart-casual", "light-academia"],
  }),
  S({
    id: "academia-masc",
    label: "Academia",
    group: "MASCULINO",
    family: "Acadêmico",
    description: "Camada intelectual: cardigã, camisa, tecido texturizado. Estudo como estética.",
    aliases: ["academia", "academic", "academico", "professor", "cardiga", "cardigan", "intelectual"],
    facets: ["STYLE:academia", "PALETTE:earth", "FABRIC:tweed", "FORMALITY:smart_casual"],
    related: ["dark-academia", "ivy-league", "light-academia", "vintage-retro-masc"],
  }),
  S({
    id: "streetwear-masc",
    label: "Streetwear / Urbano",
    group: "MASCULINO",
    family: "Urbano",
    description: "Gráfico, sobreposição, tênis. A cultura da rua vestida como uniforme.",
    aliases: ["streetwear", "street", "urbano", "hype", "moda de rua", "supreme", "drop"],
    facets: ["STYLE:streetwear", "FIT:oversized", "PALETTE:dark", "MOTIF:graphic", "FORMALITY:casual"],
    related: ["oversized", "hip-hop", "techwear", "skate-surf", "streetwear-gamer"],
  }),
  S({
    id: "oversized",
    label: "Oversized",
    group: "MASCULINO",
    family: "Urbano",
    description: "Volume como escolha, não como tamanho errado. Ombro caído, corpo amplo, barra longa.",
    aliases: ["oversized", "oversize", "largo", "folgado", "baggy", "grande", "amplo"],
    facets: ["STYLE:oversized", "FIT:oversized", "PALETTE:neutral", "FORMALITY:casual"],
    related: ["streetwear-masc", "japanese-street", "skater-fem", "hip-hop"],
  }),
  S({
    id: "techwear",
    label: "Techwear",
    group: "MASCULINO",
    family: "Técnico",
    description: "Ripstop, fivela, bolso funcional. Roupa projetada como equipamento.",
    aliases: ["techwear", "tech wear", "tecnico", "tatico", "tactical", "ripstop", "utilitario", "acg"],
    facets: ["STYLE:techwear", "FABRIC:technical", "FIT:utility", "PALETTE:dark", "MOTIF:hardware"],
    related: ["cyber-futurista-masc", "militar", "workwear", "streetwear-masc"],
  }),
  S({
    id: "y2k-masc",
    label: "Y2K",
    group: "MASCULINO",
    family: "Retrô",
    description: "Jeans largo, camisa de time, brilho metálico. Virada do milênio literal.",
    aliases: ["y2k", "anos 2000", "2000s", "jeans largo", "metalico"],
    facets: ["STYLE:y2k", "ERA:y2k", "FIT:oversized", "FABRIC:denim", "PALETTE:bright"],
    related: ["hip-hop", "streetwear-masc", "vintage-retro-masc", "retro-gamer"],
  }),
  S({
    id: "grunge-masc",
    label: "Grunge",
    group: "MASCULINO",
    family: "Alternativo",
    description: "Flanela aberta, camiseta desbotada, jeans surrado. Anos 90 sem tentar.",
    aliases: ["grunge", "flanela", "anos 90", "90s", "desbotado", "surrado"],
    facets: ["STYLE:grunge", "ERA:nineties", "FIT:oversized", "FABRIC:denim", "PALETTE:earth"],
    related: ["rock", "punk-masc", "vintage-retro-masc", "skate-surf"],
  }),
  S({
    id: "rock",
    label: "Rock",
    group: "MASCULINO",
    family: "Alternativo",
    description: "Camiseta de banda, jaqueta preta, bota. Um uniforme que atravessou cinco décadas.",
    aliases: ["rock", "rock and roll", "banda", "camiseta de banda", "roqueiro", "metal"],
    facets: ["STYLE:rock", "PALETTE:dark", "FABRIC:leather", "MOTIF:graphic", "FIT:fitted"],
    related: ["punk-masc", "grunge-masc", "biker", "gotico-darkwear"],
  }),
  S({
    id: "gotico-darkwear",
    label: "Gótico / Darkwear",
    group: "MASCULINO",
    family: "Alternativo",
    description: "Preto em camadas, corte assimétrico, comprimento longo. Silhueta antes da estampa.",
    aliases: ["gotico", "goth", "darkwear", "dark", "all black", "preto total", "sombrio", "avant garde"],
    facets: ["STYLE:darkwear", "PALETTE:dark", "FIT:oversized", "FABRIC:technical", "MOTIF:occult"],
    related: ["techwear", "rock", "japanese-street", "anime-dark", "punk-masc"],
  }),
  S({
    id: "punk-masc",
    label: "Punk",
    group: "MASCULINO",
    family: "Alternativo",
    description: "Rebite, corrente, jaqueta customizada. Feito para durar e para provocar.",
    aliases: ["punk", "rebite", "tacha", "corrente", "customizado", "diy", "anarquia"],
    facets: ["STYLE:punk", "PALETTE:dark", "FABRIC:leather", "MOTIF:hardware", "FIT:fitted"],
    related: ["rock", "biker", "grunge-masc", "gotico-darkwear"],
  }),
  S({
    id: "biker",
    label: "Biker",
    group: "MASCULINO",
    family: "Alternativo",
    description: "Couro pesado, zíper diagonal, gola baixa. Construído para o vento.",
    aliases: ["biker", "motoqueiro", "moto", "couro", "perfecto", "jaqueta de couro", "cafe racer"],
    facets: ["STYLE:biker", "FABRIC:leather", "PALETTE:dark", "FIT:fitted", "MOTIF:hardware"],
    related: ["rock", "punk-masc", "workwear", "militar"],
  }),
  S({
    id: "skater-masc",
    label: "Skater",
    group: "MASCULINO",
    family: "Urbano",
    description: "Calça folgada, camiseta grande, tênis reforçado. Roupa que sofre e continua.",
    aliases: ["skater", "skate", "skatista", "baggy", "calca larga"],
    facets: ["STYLE:skate", "FIT:oversized", "PALETTE:dark", "FORMALITY:casual"],
    related: ["skate-surf", "streetwear-masc", "grunge-masc", "oversized"],
  }),
  S({
    id: "skate-surf",
    label: "Skate / Surf",
    group: "MASCULINO",
    family: "Urbano",
    description: "Bermuda, camiseta desbotada, chinelo. Litoral como estado permanente.",
    aliases: ["skate", "surf", "surfista", "praia", "bermuda", "californiano", "beach"],
    facets: ["STYLE:surf", "PALETTE:bright", "FIT:relaxed", "FORMALITY:casual"],
    related: ["skater-masc", "vsco", "casual-masc", "boho-masc"],
  }),
  S({
    id: "hip-hop",
    label: "Hip-Hop",
    group: "MASCULINO",
    family: "Urbano",
    description: "Volume, corrente, tênis de destaque. Presença construída peça por peça.",
    aliases: ["hip hop", "hip-hop", "rap", "trap", "baggy", "corrente", "bling"],
    facets: ["STYLE:hiphop", "FIT:oversized", "PALETTE:dark", "MOTIF:graphic", "FORMALITY:casual"],
    related: ["streetwear-masc", "y2k-masc", "oversized", "baddie"],
  }),
  S({
    id: "cyber-futurista-masc",
    label: "Cyber / Futurista",
    group: "MASCULINO",
    family: "Técnico",
    description: "Painel refletivo, fivela magnética, acento luminoso. Uniforme de ficção científica.",
    aliases: ["cyber", "cyberpunk", "futurista", "neon", "sci-fi", "refletivo", "led"],
    facets: ["STYLE:cyber", "PALETTE:neon", "FABRIC:technical", "MOTIF:mecha", "FIT:utility"],
    related: ["techwear", "cyber-gamer", "rave-festival", "gotico-darkwear"],
  }),
  S({
    id: "rave-festival",
    label: "Rave / Festival",
    group: "MASCULINO",
    family: "Técnico",
    description: "Malha vazada, cor fluorescente, corte curto. Feito para calor, som e madrugada.",
    aliases: ["rave", "festival", "balada", "eletronica", "fluorescente", "neon", "psy"],
    facets: ["STYLE:rave", "PALETTE:neon", "FIT:cropped", "FABRIC:mesh", "FORMALITY:casual"],
    related: ["cyber-futurista-masc", "dopamine-dressing", "gymwear", "harajuku"],
  }),
  S({
    id: "workwear",
    label: "Workwear",
    group: "MASCULINO",
    family: "Técnico",
    description: "Sarja pesada, rebite, bolso que segura ferramenta. Roupa de ofício.",
    aliases: ["workwear", "trabalho", "operario", "sarja", "brim", "carpinteiro", "chore coat", "macacao"],
    facets: ["STYLE:workwear", "FABRIC:canvas", "FIT:utility", "PALETTE:earth", "FORMALITY:casual"],
    related: ["militar", "techwear", "western", "vintage-retro-masc"],
  }),
  S({
    id: "militar",
    label: "Militar",
    group: "MASCULINO",
    family: "Técnico",
    description: "Verde oliva, bolso cargo, reforço no cotovelo. Referência de corte, não de farda.",
    aliases: ["militar", "military", "army", "camuflado", "cargo", "oliva", "m65", "surplus"],
    facets: ["STYLE:military", "PALETTE:earth", "FIT:utility", "FABRIC:canvas", "MOTIF:hardware"],
    related: ["workwear", "techwear", "biker", "streetwear-masc"],
  }),
  S({
    id: "western",
    label: "Western",
    group: "MASCULINO",
    family: "Retrô",
    description: "Canesu, botão de pressão, franja. Faroeste sem virar fantasia.",
    aliases: ["western", "country", "cowboy", "faroeste", "canesu", "franja", "sertanejo"],
    facets: ["STYLE:western", "PALETTE:earth", "FABRIC:denim", "FIT:fitted", "ERA:retro"],
    related: ["workwear", "vintage-retro-masc", "boho-masc", "rock"],
  }),
  S({
    id: "vintage-retro-masc",
    label: "Vintage / Retro",
    group: "MASCULINO",
    family: "Retrô",
    description: "Corte de época executado com tecido novo. Referência, não reprodução.",
    aliases: ["vintage", "retro", "retrô", "antigo", "brecho", "anos 70", "anos 80", "garimpo"],
    facets: ["STYLE:retro", "ERA:retro", "PALETTE:earth", "FIT:relaxed"],
    related: ["grunge-masc", "western", "academia-masc", "y2k-masc"],
  }),
  S({
    id: "esportivo-athleisure",
    label: "Esportivo / Athleisure",
    group: "MASCULINO",
    family: "Esportivo",
    description: "Tecido de performance em corte urbano. Da rua para o treino sem trocar de roupa.",
    aliases: ["esportivo", "athleisure", "sporty", "treino", "agasalho", "tracksuit", "dry fit"],
    facets: ["STYLE:athleisure", "FABRIC:technical", "FIT:relaxed", "FORMALITY:athletic"],
    related: ["gymwear", "casual-masc", "techwear", "streetwear-masc"],
  }),
  S({
    id: "gymwear",
    label: "Gymwear",
    group: "MASCULINO",
    family: "Esportivo",
    description: "Compressão, respiro, corte que não atrapalha o movimento. Feito para o treino.",
    aliases: ["gymwear", "academia", "musculacao", "treino", "regata", "compressao", "fitness"],
    facets: ["STYLE:gymwear", "FABRIC:technical", "FIT:fitted", "FORMALITY:athletic"],
    related: ["esportivo-athleisure", "sporty-athleisure", "rave-festival"],
  }),
  S({
    id: "boho-masc",
    label: "Boho",
    group: "MASCULINO",
    family: "Suave",
    description: "Linho solto, tom terroso, camada leve. Sem estrutura, sem pressa.",
    aliases: ["boho", "bohemio", "hippie", "linho", "solto", "terroso"],
    facets: ["STYLE:boho", "PALETTE:earth", "FABRIC:linen", "FIT:relaxed", "FORMALITY:casual"],
    related: ["skate-surf", "vintage-retro-masc", "western", "japanese-street"],
  }),
  S({
    id: "japanese-street",
    label: "Japanese Street",
    group: "MASCULINO",
    family: "Japonês",
    description: "Volume amplo, sobreposição em preto, referência de modelagem tradicional.",
    aliases: ["japanese street", "japones", "japao", "tokyo", "yohji", "wafuku", "kimono moderno", "haori"],
    facets: ["STYLE:japanese_street", "MOTIF:wafuku", "FIT:oversized", "PALETTE:dark", "FANDOM_GENRE:japanese"],
    related: ["gotico-darkwear", "oversized", "harajuku", "minimalista-masc", "japanese-fashion"],
  }),
  S({
    id: "mafioso-classico",
    label: "Mafioso / Clássico",
    group: "MASCULINO",
    family: "Refinado",
    description: "Risca de giz, ombro largo, gola ampla. Alfaiataria com peso cinematográfico.",
    aliases: ["mafioso", "mafia", "classico", "risca de giz", "gangster", "anos 30", "peaky"],
    facets: ["STYLE:mafioso", "FIT:tailored", "FORMALITY:formal", "FABRIC:wool", "ERA:classic"],
    related: ["alfaiataria-masc", "formalwear", "elegante-social", "vintage-retro-masc"],
  }),
];

// ============================================================= UNIVERSOS =====

const UNIVERSOS: StyleDefinition[] = [
  S({
    id: "gamer",
    label: "Gamer",
    group: "UNIVERSOS",
    family: "Games",
    description: "Referência de jogo sem virar merchandising. Gráfico, paleta e recorte que quem joga reconhece.",
    aliases: ["gamer", "games", "gaming", "videogame", "jogos", "player"],
    facets: ["STYLE:gamer", "FANDOM_GENRE:gaming", "MOTIF:graphic", "PALETTE:dark", "FIT:relaxed"],
    related: ["esports", "retro-gamer", "cyber-gamer", "streetwear-gamer"],
  }),
  S({
    id: "esports",
    label: "Competitive Gaming / Esports",
    group: "UNIVERSOS",
    family: "Games",
    description: "Jersey de time, tecido que respira, número nas costas. Uniforme de competição.",
    aliases: ["esports", "e-sports", "competitivo", "jersey", "time", "pro player", "uniforme gamer"],
    facets: ["STYLE:esports", "FANDOM_GENRE:esports", "FABRIC:technical", "FIT:relaxed", "FORMALITY:athletic"],
    related: ["gamer", "esportivo-athleisure", "streetwear-gamer", "cyber-gamer"],
  }),
  S({
    id: "retro-gamer",
    label: "Retro Gamer",
    group: "UNIVERSOS",
    family: "Games",
    description: "Pixel, cartucho, paleta de 8 bits. Nostalgia de console em corte atual.",
    aliases: ["retro gamer", "retro game", "pixel", "8 bits", "16 bits", "arcade", "fliperama", "nostalgia"],
    facets: ["STYLE:retro_gamer", "FANDOM_GENRE:retro_gaming", "MOTIF:pixel", "ERA:retro", "PALETTE:bright"],
    related: ["gamer", "y2k-masc", "vintage-retro-masc", "streetwear-gamer"],
  }),
  S({
    id: "cyber-gamer",
    label: "Cyber Gamer",
    group: "UNIVERSOS",
    family: "Games",
    description: "RGB traduzido em tecido. Neon sobre preto, recorte técnico, brilho no escuro.",
    aliases: ["cyber gamer", "rgb", "neon gamer", "setup", "cyberpunk gamer", "futurista gamer"],
    facets: ["STYLE:cyber", "FANDOM_GENRE:gaming", "PALETTE:neon", "FABRIC:technical", "MOTIF:mecha"],
    related: ["cyber-futurista-masc", "cyber-futurista-fem", "gamer", "rave-festival"],
  }),
  S({
    id: "streetwear-gamer",
    label: "Streetwear Gamer / Hype",
    group: "UNIVERSOS",
    family: "Games",
    description: "Cultura de jogo no vocabulário do streetwear. Drop, gráfico grande, silhueta larga.",
    aliases: ["streetwear gamer", "hype", "gamer hype", "drop", "colab", "gamer street"],
    facets: ["STYLE:streetwear", "FANDOM_GENRE:gaming", "FIT:oversized", "MOTIF:graphic", "PALETTE:dark"],
    related: ["streetwear-masc", "gamer", "hip-hop", "esports"],
  }),
  S({
    id: "otaku-anime",
    label: "Otaku / Anime",
    group: "UNIVERSOS",
    family: "Anime",
    description: "Referência de anime construída em recorte e paleta — não em estampa licenciada.",
    aliases: ["otaku", "anime", "manga", "japones", "weeb", "animeiro", "nerd"],
    facets: ["STYLE:anime", "FANDOM_GENRE:anime", "MOTIF:graphic", "PALETTE:dark", "FIT:oversized"],
    related: ["anime-casual", "anime-dark", "cosplay-fashion", "kawaii-universo", "japanese-fashion"],
  }),
  S({
    id: "anime-casual",
    label: "Anime Casual",
    group: "UNIVERSOS",
    family: "Anime",
    description: "A referência aparece no detalhe: bordado pequeno, cor de personagem, gola característica.",
    aliases: ["anime casual", "anime discreto", "sutil", "anime dia a dia", "subtle anime"],
    facets: ["STYLE:anime", "FANDOM_GENRE:anime", "FIT:relaxed", "FORMALITY:casual", "PALETTE:neutral"],
    related: ["otaku-anime", "casual-masc", "casual-fem", "kawaii-universo"],
  }),
  S({
    id: "anime-dark",
    label: "Anime Dark",
    group: "UNIVERSOS",
    family: "Anime",
    description: "O lado sombrio do gênero: preto, comprimento longo, silhueta de vilão.",
    aliases: ["anime dark", "dark anime", "anime sombrio", "vilao", "seinen", "horror anime", "villain"],
    facets: ["STYLE:anime_dark", "FANDOM_GENRE:anime", "PALETTE:dark", "FIT:oversized", "MOTIF:occult"],
    related: ["gotico-darkwear", "gotico-dark", "otaku-anime", "japanese-street"],
  }),
  S({
    id: "japanese-fashion",
    label: "Japanese Fashion",
    group: "UNIVERSOS",
    family: "Anime",
    description: "Modelagem japonesa como disciplina: amarração, sobreposição, volume assimétrico.",
    aliases: ["japanese fashion", "moda japonesa", "japao", "wafuku", "kimono", "haori", "yukata", "jinbei"],
    facets: ["STYLE:japanese_fashion", "MOTIF:wafuku", "FANDOM_GENRE:japanese", "FIT:oversized", "PALETTE:dark"],
    related: ["japanese-street", "harajuku", "otaku-anime", "kawaii-universo"],
  }),
  S({
    id: "kpop-fashion",
    label: "K-pop Fashion",
    group: "UNIVERSOS",
    family: "Anime",
    description: "Palco traduzido para a rua: recorte inesperado, camada, acabamento impecável.",
    aliases: ["kpop", "k-pop", "coreano", "coreana", "korean", "idol", "seoul", "korea"],
    facets: ["STYLE:kpop", "FANDOM_GENRE:kpop", "FIT:oversized", "PALETTE:bright", "MOTIF:graphic"],
    related: ["harajuku", "streetwear-fem", "e-girl", "japanese-fashion"],
  }),
  S({
    id: "kawaii-universo",
    label: "Kawaii",
    group: "UNIVERSOS",
    family: "Anime",
    description: "Fofura como linguagem completa: cor, proporção, personagem e acabamento.",
    aliases: ["kawaii", "fofo", "cute", "japones fofo", "personagem", "mascote"],
    facets: ["STYLE:kawaii", "MOTIF:kawaii", "FANDOM_GENRE:anime", "PALETTE:pastel", "FIT:relaxed"],
    related: ["kawaii-fem", "soft-girl", "harajuku", "anime-casual"],
  }),
  S({
    id: "cosplay-fashion",
    label: "Cosplay Fashion",
    group: "UNIVERSOS",
    family: "Anime",
    description: "Construção de fantasia com técnica de alfaiataria. Peça vestível, não figurino de uso único.",
    aliases: ["cosplay", "fantasia", "personagem", "convencao", "anime con", "costume", "caracterizacao"],
    facets: ["STYLE:cosplay", "FANDOM_GENRE:cosplay", "FIT:tailored", "MOTIF:graphic"],
    related: ["fantasy-rpg", "otaku-anime", "japanese-fashion", "anime-dark"],
  }),
  S({
    id: "fantasy-rpg",
    label: "Fantasy / RPG",
    group: "UNIVERSOS",
    family: "Anime",
    description: "Capa, amarração, couro trabalhado. Estética de aventura em peça que se usa na rua.",
    aliases: ["fantasy", "fantasia medieval", "rpg", "medieval", "elfo", "capa", "aventureiro", "larp", "dnd"],
    facets: ["STYLE:fantasy", "FANDOM_GENRE:fantasy", "FABRIC:leather", "PALETTE:earth", "FIT:relaxed"],
    related: ["cosplay-fashion", "fairycore", "gotico-dark", "western"],
  }),
];

// ============================================================== catálogo =====

export const STYLES: readonly StyleDefinition[] = [...FEMININO, ...MASCULINO, ...UNIVERSOS];

const BY_ID = new Map(STYLES.map((s) => [s.id, s]));

export const getStyle = (id: string): StyleDefinition | undefined => BY_ID.get(id);
export const isStyleId = (id: string): boolean => BY_ID.has(id);

const LABEL_COUNT = new Map<string, number>();
for (const style of STYLES) LABEL_COUNT.set(style.label, (LABEL_COUNT.get(style.label) ?? 0) + 1);

const GROUP_SUFFIX: Record<StyleGroup, string> = {
  FEMININO: "fem.",
  MASCULINO: "masc.",
  UNIVERSOS: "universo",
};

/**
 * Rótulo desambiguado.
 *
 * Treze rótulos existem em mais de um grupo — "Kawaii", "Streetwear", "Y2K".
 * Dentro de uma lista com cabeçalho de grupo isso é claro; solto num chip de
 * sugestão vira "Kawaii, Kawaii" e a pessoa não sabe em qual clicar. Use este
 * rótulo sempre que o estilo aparecer fora do seu grupo.
 */
export function styleDisplayLabel(style: StyleDefinition): string {
  if ((LABEL_COUNT.get(style.label) ?? 0) <= 1) return style.label;
  return `${style.label} (${GROUP_SUFFIX[style.group]})`;
}

export const stylesByGroup = (group: StyleGroup): StyleDefinition[] =>
  STYLES.filter((s) => s.group === group);

export function stylesByFamily(group: StyleGroup): Map<string, StyleDefinition[]> {
  const out = new Map<string, StyleDefinition[]>();
  for (const style of stylesByGroup(group)) {
    const list = out.get(style.family) ?? [];
    list.push(style);
    out.set(style.family, list);
  }
  return out;
}

/** Todas as facetas que qualquer estilo pode produzir. Usado em teste e no admin. */
export const ALL_STYLE_FACETS: readonly string[] = Array.from(
  new Set(STYLES.flatMap((s) => s.facets)),
).sort();

/**
 * Normalização de texto — a mesma função para consulta, alias e índice.
 *
 * Se busca e índice normalizarem de formas diferentes, "camisetão" nunca acha
 * "camisetao" e o bug é invisível até alguém reclamar.
 */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Índice alias→estilo, construído uma vez. Alias mais longo primeiro. */
const ALIAS_INDEX: { alias: string; styleId: string; weight: number }[] = (() => {
  const entries: { alias: string; styleId: string; weight: number }[] = [];
  for (const style of STYLES) {
    // O rótulo vale mais que um sinônimo: quem digita o nome exato quer aquilo.
    entries.push({ alias: normalizeText(style.label), styleId: style.id, weight: 100 });
    entries.push({ alias: normalizeText(style.id.replace(/-/g, " ")), styleId: style.id, weight: 90 });
    for (const alias of style.aliases) {
      entries.push({ alias: normalizeText(alias), styleId: style.id, weight: 70 });
    }
  }
  return entries.filter((e) => e.alias.length >= 3).sort((a, b) => b.alias.length - a.alias.length);
})();

export interface StyleMatch {
  styleId: string;
  style: StyleDefinition;
  /** 0..100. Quanto a consulta realmente aponta para este estilo. */
  score: number;
  matchedOn: string;
}

/**
 * Encontra estilos numa consulta livre.
 *
 * Casamento por frase, não por palavra solta: "old money" precisa ganhar de
 * "money", e "dark academia" não pode ser confundido com "dark" sozinho. Por
 * isso o índice está ordenado do alias mais longo para o mais curto, e um trecho
 * já consumido não é reutilizado.
 */
export interface MatchOptions {
  /**
   * Liga o casamento por prefixo: a CONSULTA como início do alias.
   * É o que faz "tech" chegar em "techwear" enquanto a pessoa digita. Fica
   * desligado na busca completa, onde traria ruído — "cas" não deveria trazer
   * casual, cashmere e coastal de uma vez num resultado de catálogo.
   */
  prefix?: boolean;
}

export function matchStyles(query: string, limit = 6, options: MatchOptions = {}): StyleMatch[] {
  const normalized = normalizeText(query);
  if (normalized.length < 2) return [];

  const found = new Map<string, StyleMatch>();
  let remaining = ` ${normalized} `;

  for (const entry of ALIAS_INDEX) {
    const needle = ` ${entry.alias} `;
    const asPhrase = remaining.includes(needle);
    // Flexão: "goticas" casa com "gotica", "minimalistas" com "minimalista".
    const asInflection =
      !asPhrase && new RegExp(`\\s${escapeRegex(entry.alias)}[a-z]{0,3}\\s`).test(remaining);
    // Typeahead: "tech" casa com "techwear". Vale bem menos que um casamento
    // real, senão um prefixo curto sequestraria o resultado.
    const asTypeahead =
      options.prefix === true &&
      !asPhrase &&
      !asInflection &&
      normalized.length >= 3 &&
      entry.alias.startsWith(normalized);
    if (!asPhrase && !asInflection && !asTypeahead) continue;

    const score = asTypeahead
      ? Math.max(10, Math.round(entry.weight / 3) - (entry.alias.length - normalized.length))
      : Math.min(100, entry.weight + entry.alias.length * (asPhrase ? 2 : 1));
    const existing = found.get(entry.styleId);
    if (!existing || existing.score < score) {
      const style = BY_ID.get(entry.styleId);
      if (style) found.set(entry.styleId, { styleId: entry.styleId, style, score, matchedOn: entry.alias });
    }
    // Consome apenas frases de várias palavras: elas são específicas, e deixar
    // "old money" ser recasado como "money" degradaria o resultado.
    //
    // Uma palavra só NÃO é consumida. "fofo" pertence de verdade tanto a Kawaii
    // quanto a Soft Girl, e devolver apenas um dos dois esconde metade do
    // catálogo de quem digitou exatamente o termo certo.
    if (asPhrase && entry.alias.includes(" ")) remaining = remaining.replace(needle, " ");
  }

  return [...found.values()].sort((a, b) => b.score - a.score || a.styleId.localeCompare(b.styleId)).slice(0, limit);
}

const escapeRegex = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Facetas implicadas por uma consulta livre, via os estilos que ela aponta. */
export function facetsForQuery(query: string): string[] {
  const out = new Set<string>();
  for (const match of matchStyles(query, 4)) {
    for (const facet of match.style.facets) out.add(facet);
  }
  return [...out];
}

/** Facetas de um conjunto de estilos — usado ao etiquetar um produto. */
export function facetsForStyles(styleIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of styleIds) {
    const style = BY_ID.get(id);
    if (!style) continue;
    out.add(`STYLE_ID:${style.id}`);
    for (const facet of style.facets) out.add(facet);
  }
  return [...out];
}

/**
 * Texto de busca de um estilo. Vai para o índice do produto, o que faz um termo
 * como "stealth wealth" encontrar uma peça etiquetada como Quiet Luxury mesmo
 * que essas palavras não estejam em lugar nenhum da descrição.
 */
export function styleSearchText(styleIds: readonly string[]): string {
  const parts: string[] = [];
  for (const id of styleIds) {
    const style = BY_ID.get(id);
    if (!style) continue;
    parts.push(style.label, style.description, ...style.aliases, style.family);
  }
  return normalizeText(parts.join(" "));
}

/** Rótulo legível de uma faceta. Usado para explicar uma recomendação. */
export function facetLabel(facet: string): string {
  const [kind, value] = facet.split(":");
  if (kind === "STYLE_ID") return BY_ID.get(value ?? "")?.label ?? (value ?? facet);
  const named = STYLES.find((s) => s.facets.includes(facet));
  if (named && kind === "STYLE") return named.label.toLowerCase();
  const dictionary: Record<string, string> = {
    "PALETTE:dark": "paleta escura",
    "PALETTE:pastel": "tons pastel",
    "PALETTE:neon": "acentos neon",
    "PALETTE:neutral": "tons neutros",
    "PALETTE:earth": "tons terrosos",
    "PALETTE:bright": "cores vibrantes",
    "PALETTE:monochrome": "monocromático",
    "FIT:oversized": "modelagem oversized",
    "FIT:fitted": "caimento justo",
    "FIT:relaxed": "caimento solto",
    "FIT:tailored": "alfaiataria",
    "FIT:utility": "pegada utilitária",
    "FIT:cropped": "comprimento cropped",
    "FABRIC:leather": "couro",
    "FABRIC:denim": "denim",
    "FABRIC:knit": "malha",
    "FABRIC:technical": "tecido técnico",
    "FABRIC:satin": "cetim",
    "FABRIC:lace": "renda",
    "FABRIC:linen": "linho",
    "FABRIC:tweed": "tweed",
    "FABRIC:velvet": "veludo",
    "FABRIC:canvas": "lona",
    "FABRIC:crochet": "crochê",
    "FABRIC:tulle": "tule",
    "FABRIC:mesh": "malha vazada",
    "FABRIC:wool": "lã",
    "FABRIC:cotton": "algodão",
    "MOTIF:mecha": "motivos mecha",
    "MOTIF:kawaii": "estética kawaii",
    "MOTIF:wafuku": "referência japonesa",
    "MOTIF:graphic": "gráfico aplicado",
    "MOTIF:occult": "simbologia sombria",
    "MOTIF:floral": "floral",
    "MOTIF:hardware": "ferragens",
    "MOTIF:pixel": "arte em pixel",
    "MOTIF:bow": "laços",
    "FORMALITY:formal": "ocasião formal",
    "FORMALITY:business": "ambiente corporativo",
    "FORMALITY:smart_casual": "smart casual",
    "FORMALITY:casual": "uso casual",
    "FORMALITY:athletic": "uso esportivo",
    "ERA:y2k": "virada dos anos 2000",
    "ERA:nineties": "anos 90",
    "ERA:retro": "corte retrô",
    "ERA:classic": "corte clássico",
    "FANDOM_GENRE:anime": "universo anime",
    "FANDOM_GENRE:gaming": "universo gamer",
    "FANDOM_GENRE:esports": "esports",
    "FANDOM_GENRE:retro_gaming": "games retrô",
    "FANDOM_GENRE:kpop": "K-pop",
    "FANDOM_GENRE:cosplay": "cosplay",
    "FANDOM_GENRE:fantasy": "fantasia e RPG",
    "FANDOM_GENRE:japanese": "cultura japonesa",
    "FANDOM_GENRE:internet": "cultura de internet",
  };
  return dictionary[facet] ?? (value ?? facet).replace(/_/g, " ");
}
