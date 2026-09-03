import type { AIProvider, AnalysisRequest, AnalysisResult } from "./provider";
import type { DesignSpecification, SpecField, SpecWarning } from "../domain/spec";
import { DesignSpecificationSchema } from "../domain/spec";
import type { ConfidenceKind, ReferenceRole } from "../domain/enums";

/**
 * The deterministic analyser.
 *
 * It reads the customer's own words and the objective properties of their
 * uploads, and produces a *conservative* specification: it marks almost nothing
 * as OBSERVED unless the customer stated it, and it is generous with UNCERTAIN.
 *
 * This is not a toy fallback. It is the honest floor of the product — when the
 * model is unavailable the customer still gets a structured, editable sheet, and
 * it is clearly labelled as a reading of their brief rather than of the image.
 */

const field = (
  value: string,
  confidence: ConfidenceKind,
  extra: Partial<SpecField> = {},
): SpecField => ({
  value,
  confidence,
  editedByCustomer: false,
  ...extra,
});

interface Lexeme {
  patterns: RegExp;
  value: string;
}

const match = (text: string, table: readonly Lexeme[]): string | null => {
  for (const entry of table) if (entry.patterns.test(text)) return entry.value;
  return null;
};

const GARMENTS: readonly Lexeme[] = [
  { patterns: /\b(jaqueta|jacket|blous[ãa]o|bomber|varsity|college)\b/i, value: "Jaqueta" },
  { patterns: /\b(casaco|coat|sobretudo|trench)\b/i, value: "Casaco" },
  { patterns: /\b(moletom|hoodie|blusa de frio|canguru)\b/i, value: "Moletom" },
  { patterns: /\b(camiseta|t-?shirt|camisa de malha|tee)\b/i, value: "Camiseta" },
  { patterns: /\b(camisa|shirt|social)\b/i, value: "Camisa" },
  { patterns: /\b(cal[çc]a|pants|trouser|cargo|jeans)\b/i, value: "Calça" },
  { patterns: /\b(short|bermuda)\b/i, value: "Short" },
  { patterns: /\b(saia|skirt)\b/i, value: "Saia" },
  { patterns: /\b(vestido|dress)\b/i, value: "Vestido" },
  { patterns: /\b(kimono|haori|yukata|happi)\b/i, value: "Peça de inspiração japonesa (kimono/haori)" },
  { patterns: /\b(colete|vest|gilet)\b/i, value: "Colete" },
  { patterns: /\b(macac[ãa]o|jumpsuit|overall)\b/i, value: "Macacão" },
  { patterns: /\b(tricot|tric[ôo]|su[ée]ter|sweater|cardigan)\b/i, value: "Tricô" },
];

const CATEGORY_BY_GARMENT: Record<string, DesignSpecification["category"]> = {
  Jaqueta: "OUTERWEAR",
  Casaco: "OUTERWEAR",
  Colete: "OUTERWEAR",
  "Peça de inspiração japonesa (kimono/haori)": "OUTERWEAR",
  Moletom: "KNITWEAR",
  Tricô: "KNITWEAR",
  Camiseta: "TOPS",
  Camisa: "TOPS",
  Calça: "BOTTOMS",
  Short: "BOTTOMS",
  Saia: "BOTTOMS",
  Vestido: "DRESSES",
  Macacão: "DRESSES",
};

const FITS: readonly Lexeme[] = [
  { patterns: /\b(oversized|oversize|larg[ao]|solt[ao]|baggy|folgad)/i, value: "Oversized / folgado" },
  { patterns: /\b(slim|justo|ajustad|colad|skinny)/i, value: "Justo ao corpo" },
  { patterns: /\b(regular|reto|straight|cl[áa]ssic)/i, value: "Reto / regular" },
  { patterns: /\b(cropped|curt[ao] na cintura)/i, value: "Cropped" },
];

const SLEEVES: readonly Lexeme[] = [
  { patterns: /\b(sem manga|regata|sleeveless|cavada)/i, value: "Sem manga" },
  { patterns: /\b(manga curta|short sleeve)/i, value: "Manga curta" },
  { patterns: /\b(manga 3\/4|tr[êe]s quartos)/i, value: "Manga 3/4" },
  { patterns: /\b(manga longa|long sleeve|manga comprida)/i, value: "Manga longa" },
  { patterns: /\b(raglan)/i, value: "Manga raglan" },
  { patterns: /\b(bufante|balon[êe]|puff)/i, value: "Manga bufante" },
  { patterns: /\b(morcego|batwing|kimono sleeve)/i, value: "Manga morcego" },
];

const COLLARS: readonly Lexeme[] = [
  { patterns: /\b(gola alta|turtleneck|cacharrel)/i, value: "Gola alta" },
  { patterns: /\b(capuz|hood|capucha)/i, value: "Capuz" },
  { patterns: /\b(gola polo|polo)/i, value: "Gola polo" },
  { patterns: /\b(gola careca|crew ?neck|redonda)/i, value: "Gola careca" },
  { patterns: /\b(gola v|v-?neck)/i, value: "Decote V" },
  { patterns: /\b(gola padre|mandarim|mao collar)/i, value: "Gola padre / mandarim" },
  { patterns: /\b(gola bebê|peter pan)/i, value: "Gola bebê" },
];

const CLOSURES: readonly Lexeme[] = [
  { patterns: /\b(z[íi]per|zipper|zip)\b/i, value: "Zíper" },
  { patterns: /\b(bot[õo]es|button)/i, value: "Botões" },
  { patterns: /\b(cord[ãa]o|drawstring|amarra[çc][ãa]o|obi|faixa)/i, value: "Amarração / cordão" },
  { patterns: /\b(velcro)/i, value: "Velcro" },
  { patterns: /\b(colchete|snap|press[ãa]o)/i, value: "Botão de pressão" },
];

const MATERIALS: readonly Lexeme[] = [
  { patterns: /\b(algod[ãa]o|cotton)\b/i, value: "Algodão" },
  { patterns: /\b(moletom|fleece|felpad)/i, value: "Moletom flanelado" },
  { patterns: /\b(sarja|twill|brim)\b/i, value: "Sarja" },
  { patterns: /\b(jeans|denim)\b/i, value: "Denim" },
  { patterns: /\b(couro|leather)\b/i, value: "Couro" },
  { patterns: /\b(couro sint[ée]tico|pu leather|napa)\b/i, value: "Couro sintético (PU)" },
  { patterns: /\b(nylon|ripstop|t[ée]cnic|technical|softshell)\b/i, value: "Tecido técnico (nylon/ripstop)" },
  { patterns: /\b(linho|linen)\b/i, value: "Linho" },
  { patterns: /\b(seda|silk|cetim|satin)\b/i, value: "Seda / cetim" },
  { patterns: /\b(malha|jersey|viscose)\b/i, value: "Malha" },
  { patterns: /\b(l[ãa]|wool|tweed)\b/i, value: "Lã" },
];

const COLOR_WORDS: { re: RegExp; name: string; hex: string }[] = [
  { re: /\b(preto|black|negro)\b/i, name: "Preto", hex: "#111113" },
  { re: /\b(branco|white|off-?white)\b/i, name: "Branco", hex: "#F4F2ED" },
  { re: /\b(vermelho|red|carmim|escarlate)\b/i, name: "Vermelho", hex: "#B4232B" },
  { re: /\b(azul|blue|navy|marinho)\b/i, name: "Azul", hex: "#25406B" },
  { re: /\b(verde|green|militar|olive)\b/i, name: "Verde", hex: "#3E5540" },
  { re: /\b(cinza|gray|grey|grafite|chumbo)\b/i, name: "Cinza", hex: "#6A6A6E" },
  { re: /\b(bege|beige|areia|creme|cru)\b/i, name: "Bege", hex: "#CBBFA8" },
  { re: /\b(rosa|pink|magenta)\b/i, name: "Rosa", hex: "#C96A8E" },
  { re: /\b(roxo|purple|lil[áa]s|violeta)\b/i, name: "Roxo", hex: "#5A4076" },
  { re: /\b(amarelo|yellow|mostarda)\b/i, name: "Amarelo", hex: "#D7A32C" },
  { re: /\b(laranja|orange|terracota)\b/i, name: "Laranja", hex: "#C8642A" },
  { re: /\b(marrom|brown|caramelo|chocolate)\b/i, name: "Marrom", hex: "#5B4132" },
];

const DECOR_PATTERNS: { re: RegExp; value: string }[] = [
  { re: /\b(bordad|embroider)/i, value: "Bordado" },
  { re: /\b(estamp|print|serigrafia|silk ?screen|dtf)/i, value: "Estampa" },
  { re: /\b(patch|aplique|emblema)/i, value: "Patch aplicado" },
  { re: /\b(tacha|rebite|stud|spike)/i, value: "Tachas / rebites" },
  { re: /\b(franja|fringe)/i, value: "Franjas" },
  { re: /\b(vi[ée]s|piping|debru)/i, value: "Vivo / debrum" },
  { re: /\b(refletiv|reflective|3m)/i, value: "Elemento refletivo" },
  { re: /\b(corrente|chain|fivela|buckle)/i, value: "Ferragens (correntes/fivelas)" },
];

const POCKET_PATTERNS: { re: RegExp; value: string }[] = [
  { re: /\b(bolso cargo|cargo pocket)/i, value: "Bolso cargo lateral" },
  { re: /\b(bolso can?guru|kangaroo)/i, value: "Bolso canguru frontal" },
  { re: /\b(bolso embutido|welt|faca)/i, value: "Bolso embutido" },
  { re: /\b(bolso chapado|patch pocket)/i, value: "Bolso chapado" },
  { re: /\b(bolso interno|inner pocket)/i, value: "Bolso interno" },
  { re: /\b(bolso)/i, value: "Bolso (posição a definir)" },
];

const COMPLEXITY_DRIVERS: { re: RegExp; weight: number; reason: string }[] = [
  { re: /\b(bordad|embroider)/i, weight: 1, reason: "bordado" },
  { re: /\b(couro|leather)\b/i, weight: 1, reason: "couro" },
  { re: /\b(forro|lining|forrad)/i, weight: 1, reason: "forro" },
  { re: /\b(plissad|pleat|prega)/i, weight: 1, reason: "pregas" },
  { re: /\b(assim[ée]tric|asymmetric)/i, weight: 1, reason: "assimetria" },
  { re: /\b(corset|espartilho|barbatana)/i, weight: 2, reason: "estrutura de corset" },
  { re: /\b(cauda|train|drapead|drape)/i, weight: 1, reason: "drapeado" },
  { re: /\b(painel|panel|recorte)/i, weight: 1, reason: "recortes" },
];

export class HeuristicProvider implements AIProvider {
  readonly name = "heuristic";

  async analyse(request: AnalysisRequest): Promise<AnalysisResult> {
    const started = Date.now();
    const text = `${request.title}\n${request.briefText}\n${request.references
      .map((r) => r.caption ?? "")
      .join("\n")}`;

    const warnings: SpecWarning[] = [];
    const roleOf = (role: ReferenceRole) => request.references.find((r) => r.role === role);

    // ---- garment identity -------------------------------------------------
    const garmentValue = match(text, GARMENTS);
    const garmentType = garmentValue
      ? field(garmentValue, "OBSERVED", { rationale: "Você nomeou esta peça no seu pedido." })
      : field("Peça a definir", "UNCERTAIN", {
          rationale: "Não identificamos o tipo de peça no texto enviado.",
        });
    const category = garmentValue ? (CATEGORY_BY_GARMENT[garmentValue] ?? "TOPS") : "TOPS";

    // ---- shape ------------------------------------------------------------
    const fitValue = match(text, FITS);
    const fit = fitValue
      ? field(fitValue, "OBSERVED", { sourceRole: roleOf("FIT")?.role, rationale: "Descrito por você." })
      : field("Modelagem regular", "RECOMMENDED", {
          rationale: "Padrão do ateliê quando o caimento não é especificado.",
        });

    const silhouetteRef = roleOf("SILHOUETTE") ?? roleOf("OVERALL");
    const silhouette = silhouetteRef
      ? field(
          fitValue ? `Silhueta ${fitValue.toLowerCase()}` : "Silhueta a confirmar a partir da referência",
          "INFERRED",
          {
            sourceRole: silhouetteRef.role,
            rationale:
              "Lida a partir da referência que você marcou como silhueta. Uma foto mostra a peça em uma pose e uma luz específicas — confirme antes de aprovar.",
          },
        )
      : undefined;

    const sleeveValue = match(text, SLEEVES);
    const sleeveRef = roleOf("SLEEVES");
    const sleeveType = sleeveValue
      ? field(sleeveValue, "OBSERVED", { sourceRole: sleeveRef?.role })
      : sleeveRef
        ? field("Manga conforme referência marcada", "UNCERTAIN", {
            sourceRole: "SLEEVES",
            rationale: "Você enviou uma referência de manga, mas não descreveu o tipo. Precisamos da sua confirmação.",
          })
        : category === "BOTTOMS"
          ? undefined
          : field("Manga longa", "RECOMMENDED", { rationale: "Escolha mais comum para esta peça." });

    const collarValue = match(text, COLLARS);
    const collar = collarValue ? field(collarValue, "OBSERVED") : undefined;
    const closureValue = match(text, CLOSURES);
    const closures = closureValue
      ? field(closureValue, "OBSERVED")
      : field("Fechamento a definir", "UNCERTAIN", {
          rationale: "Nenhum tipo de fechamento foi descrito.",
        });

    // ---- material ---------------------------------------------------------
    const materialValue = match(text, MATERIALS);
    const materialEstimate = materialValue
      ? field(materialValue, "OBSERVED", {
          rationale: "Material citado por você — o ateliê confirma disponibilidade e gramatura.",
        })
      : field("Algodão de gramatura média (sugestão)", "RECOMMENDED", {
          rationale:
            "Não é possível determinar tecido a partir de uma imagem. Esta é uma sugestão do ateliê para aproximar o resultado visual.",
        });

    if (!materialValue) {
      warnings.push({
        code: "FABRIC_UNDETERMINED",
        severity: "ATTENTION",
        message:
          "Não dá para saber o tecido por foto. Uma imagem mostra brilho e caimento, não composição, gramatura ou toque.",
        resolution: "Escolha um tecido na ficha, ou aceite a sugestão do ateliê e peça uma foto do material antes do corte.",
      });
    }

    // ---- colour -----------------------------------------------------------
    const namedColors = COLOR_WORDS.filter((c) => c.re.test(text)).map((c) => ({
      name: c.name,
      approximateHex: c.hex,
      placement: undefined,
      confidence: "OBSERVED" as ConfidenceKind,
    }));

    const colorRef = roleOf("COLOR");
    const sampled = (colorRef?.meta.dominantColors ?? [])
      .slice(0, 3)
      .filter((c) => !namedColors.some((n) => n.approximateHex.toLowerCase() === c.hex.toLowerCase()))
      .map((c) => ({
        name: `Tom amostrado da referência (${Math.round(c.share * 100)}% da imagem)`,
        approximateHex: c.hex,
        placement: undefined,
        confidence: "INFERRED" as ConfidenceKind,
      }));

    const colorEstimate = [...namedColors, ...sampled].slice(0, 8);
    if (colorEstimate.length > 0) {
      warnings.push({
        code: "COLOR_UNRELIABLE_FROM_IMAGE",
        severity: "INFO",
        message:
          "Cor lida de uma foto não é cor calibrada: a luz do ambiente, a câmera e a sua tela mudam o resultado.",
        resolution:
          "Se a cor exata importa, peça ao ateliê uma foto do tecido físico antes do corte — isso está incluído no seu pedido.",
      });
    }

    // ---- details ----------------------------------------------------------
    const pockets = POCKET_PATTERNS.filter((p) => p.re.test(text)).map((p) =>
      field(p.value, "OBSERVED", { sourceRole: roleOf("DETAILS")?.role }),
    );
    const decorativeElements = DECOR_PATTERNS.filter((p) => p.re.test(text)).map((p) =>
      field(p.value, "OBSERVED", { sourceRole: roleOf("DETAILS")?.role }),
    );
    const embroidery = /\b(bordad|embroider)/i.test(text)
      ? field("Bordado — arte e posicionamento a definir na ficha", "UNCERTAIN", {
          rationale: "Bordado exige arte vetorizada e definição de posição, cor de linha e tamanho.",
        })
      : undefined;
    const printing = /\b(estamp|print|serigrafia|dtf)/i.test(text)
      ? field("Estampa — arte e técnica a definir", "UNCERTAIN", {
          rationale: "A técnica (serigrafia, DTF, sublimação) depende do tecido e do tamanho da arte.",
        })
      : undefined;

    // ---- complexity -------------------------------------------------------
    let complexity = 2;
    const drivers: string[] = [];
    for (const d of COMPLEXITY_DRIVERS) {
      if (d.re.test(text)) {
        complexity += d.weight;
        drivers.push(d.reason);
      }
    }
    if (category === "OUTERWEAR") complexity += 1;
    if (category === "DRESSES") complexity += 1;
    if (request.references.length >= 3) complexity += 1;
    complexity = Math.min(5, Math.max(1, complexity));

    if (complexity >= 4) {
      warnings.push({
        code: "COMPLEX_CONSTRUCTION",
        severity: "ATTENTION",
        message: `Esta peça tem construção elaborada${drivers.length ? ` (${drivers.join(", ")})` : ""}. Poucos ateliês da rede executam este nível.`,
        resolution: "O prazo e o preço já refletem isso. Se quiser simplificar, edite a ficha antes de aprovar.",
      });
    }

    // ---- references -------------------------------------------------------
    if (request.references.length === 0) {
      warnings.push({
        code: "REFERENCE_LOW_QUALITY",
        severity: "ATTENTION",
        message: "Nenhuma referência visual foi enviada. Esta ficha vem apenas do seu texto.",
        resolution: "Envie ao menos uma imagem — a precisão do resultado sobe muito com uma referência.",
      });
    }
    for (const r of request.references) {
      const w = r.meta.widthPx ?? 0;
      const h = r.meta.heightPx ?? 0;
      if (w > 0 && h > 0 && Math.min(w, h) < 500) {
        warnings.push({
          code: "REFERENCE_LOW_QUALITY",
          severity: "INFO",
          message: `Uma das referências tem resolução baixa (${w}×${h}px). Detalhes finos podem não estar legíveis.`,
          resolution: "Se tiver uma versão maior da mesma imagem, substitua — ajuda no acabamento.",
        });
        break;
      }
    }

    // Conflicting references: two images both claiming to define the same axis.
    const roleCounts = new Map<ReferenceRole, number>();
    for (const r of request.references) roleCounts.set(r.role, (roleCounts.get(r.role) ?? 0) + 1);
    for (const [role, count] of roleCounts) {
      if (count > 1 && role !== "OVERALL" && role !== "DETAILS") {
        warnings.push({
          code: "CONFLICTING_REFERENCES",
          severity: "ATTENTION",
          message: `Você marcou ${count} referências para o mesmo papel (${role}). O ateliê não tem como saber qual vale.`,
          resolution: "Ajuste o papel de uma delas, ou escreva no resumo qual tem prioridade.",
        });
        break;
      }
    }

    // ---- measurements -----------------------------------------------------
    const measurementFields = request.measurements?.fields ?? {};
    const hasMeasurements = request.measurements?.provided === true && Object.keys(measurementFields).length >= 3;
    if (!hasMeasurements) {
      warnings.push({
        code: "MEASUREMENTS_MISSING",
        severity: "BLOCKING",
        message: "Sem suas medidas, esta peça não pode entrar em produção.",
        resolution: "Preencha o perfil de medidas — o guia leva cerca de 5 minutos com uma fita métrica.",
      });
    }

    const spec: DesignSpecification = DesignSpecificationSchema.parse({
      schemaVersion: 1,
      garmentType,
      category,
      cutProfile: request.preferences?.cutProfile ?? "UNISEX",
      silhouette,
      fit,
      length: undefined,
      sleeveType,
      collar,
      neckline: undefined,
      waistband: category === "BOTTOMS" ? field("Cós a definir", "UNCERTAIN") : undefined,
      closures,
      pockets,
      seams: undefined,
      panels: [],
      trims: [],
      decorativeElements,
      embroidery,
      printing,
      materialEstimate,
      materialWeight: undefined,
      colorEstimate,
      pattern: undefined,
      finishing: undefined,
      constructionNotes: [
        {
          topic: "Origem desta ficha",
          note:
            "Esta leitura foi feita pelo analisador determinístico da plataforma a partir do texto e das propriedades objetivas das imagens. Ela não afirma ter reconhecido detalhes visuais finos.",
          confidence: "RECOMMENDED",
          blocksProduction: false,
        },
        ...(hasMeasurements
          ? []
          : [
              {
                topic: "Medidas",
                note: "Não cortar antes das medidas confirmadas pelo cliente.",
                confidence: "UNCERTAIN" as ConfidenceKind,
                blocksProduction: true,
              },
            ]),
      ],
      measurements: hasMeasurements
        ? {
            ...measurementFields,
            source: request.measurements?.source ?? "SELF_REPORTED",
            toleranceMm: 15,
          }
        : undefined,
      sizing: request.preferences?.sizingHint
        ? field(request.preferences.sizingHint, "OBSERVED")
        : undefined,
      productionComplexity: complexity,
      estimatedLabourHours: Math.max(3, complexity * 4),
      warnings,
      summary: buildSummary({
        garment: garmentType.value,
        fit: fit.value,
        material: materialEstimate.value,
        colors: colorEstimate.map((c) => c.name),
        references: request.references.length,
      }),
      referenceUsage: request.references.map((r) => ({
        referenceId: r.id,
        role: r.role,
        usedFor: describeRoleUsage(r.role),
      })),
    });

    return {
      spec,
      provider: this.name,
      model: null,
      latencyMs: Date.now() - started,
      costCents: 0,
      diagnostics: { matchedGarment: garmentValue, complexityDrivers: drivers },
    };
  }
}

function describeRoleUsage(role: ReferenceRole): string {
  switch (role) {
    case "SILHOUETTE": return "Formato geral e proporção do corpo da peça.";
    case "SLEEVES": return "Tipo, comprimento e acabamento da manga.";
    case "COLOR": return "Paleta aproximada — amostrada dos pixels, não calibrada.";
    case "DETAILS": return "Bolsos, aviamentos e elementos aplicados.";
    case "FABRIC": return "Aparência de superfície e textura do material.";
    case "PRINT": return "Arte gráfica aplicada — sujeita à checagem de direitos.";
    case "FIT": return "Como a peça deve vestir no corpo.";
    case "OVERALL": return "Leitura geral da peça.";
  }
}

function buildSummary(input: {
  garment: string;
  fit: string;
  material: string;
  colors: string[];
  references: number;
}): string {
  const parts: string[] = [];
  parts.push(`Sua peça é ${article(input.garment)} ${input.garment.toLowerCase()} de caimento ${input.fit.toLowerCase()}`);
  if (input.colors.length > 0) parts.push(`na paleta ${input.colors.slice(0, 3).join(", ").toLowerCase()}`);
  parts.push(`em ${input.material.toLowerCase()}`);
  const base = `${parts.join(", ")}.`;
  const refNote =
    input.references === 0
      ? " Nenhuma referência visual foi usada: esta ficha vem só do seu texto."
      : ` Combinamos ${input.references} referência${input.references > 1 ? "s" : ""} conforme os papéis que você definiu.`;
  return `${base}${refNote} Revise cada linha antes de aprovar — o que você aprovar aqui é exatamente o que o ateliê vai executar.`;
}

const article = (word: string): string => (/^[aeiou]/i.test(word) ? "uma" : "um");
