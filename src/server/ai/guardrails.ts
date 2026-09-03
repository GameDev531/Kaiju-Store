import { securityEvent } from "../lib/logger";

/**
 * Everything a user types or uploads is untrusted input to the model.
 *
 * This module does two jobs and refuses to do a third:
 *  1. It neutralises attempts to steer the model (prompt injection) by wrapping
 *     user text in a delimited, escaped block and flagging known patterns.
 *  2. It triages content that must not silently become a garment — third-party
 *     IP, prohibited items.
 *
 * The job it refuses: deciding anything. Guardrail output is *signal*. Blocking,
 * moderation and rights decisions are taken by deterministic server rules and by
 * humans, never by the model's own opinion of itself.
 */

export interface GuardrailFinding {
  code:
    | "INJECTION_PATTERN"
    | "SYSTEM_PROMPT_PROBE"
    | "TOOL_ABUSE_ATTEMPT"
    | "EXFILTRATION_ATTEMPT"
    | "PROHIBITED_ITEM"
    | "THIRD_PARTY_IP_SIGNAL"
    | "EXCESSIVE_LENGTH";
  severity: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
  /** The matched fragment, truncated — for the moderation queue, not the customer. */
  evidence?: string;
}

export interface GuardrailReport {
  findings: GuardrailFinding[];
  /** True when the request must not reach the model at all. */
  blocked: boolean;
  /** True when a human should look at this before production. */
  needsReview: boolean;
  sanitizedText: string;
}

/**
 * Patterns that indicate someone is talking to the model rather than describing
 * a garment. Detection is advisory: we still isolate the text structurally, so a
 * miss here is not a breach on its own.
 */
const INJECTION_PATTERNS: { re: RegExp; code: GuardrailFinding["code"]; severity: GuardrailFinding["severity"]; detail: string }[] = [
  {
    re: /\b(ignore|disregard|forget|esque[cç]a|desconsidere|ignorar)\b[^.\n]{0,40}\b(previous|above|prior|anterior|acima|todas as|all)\b[^.\n]{0,30}\b(instruction|prompt|rule|regra|instru[cç])/i,
    code: "INJECTION_PATTERN",
    severity: "HIGH",
    detail: "Tentativa de sobrescrever instruções do sistema.",
  },
  {
    re: /\b(system prompt|prompt do sistema|initial instructions|instru[cç][õo]es iniciais|your instructions|suas instru[cç][õo]es)\b/i,
    code: "SYSTEM_PROMPT_PROBE",
    severity: "HIGH",
    detail: "Tentativa de extrair o prompt interno.",
  },
  {
    re: /\b(reveal|repeat|print|show|mostre|revele|repita|imprima)\b[^.\n]{0,30}\b(prompt|instructions|system|configuration|api[_ ]?key|token)\b/i,
    code: "SYSTEM_PROMPT_PROBE",
    severity: "HIGH",
    detail: "Pedido para revelar configuração interna.",
  },
  {
    re: /\b(you are now|act as|pretend to be|voc[êe] agora [ée]|aja como|finja ser)\b[^.\n]{0,40}\b(admin|developer|root|unrestricted|sem restri)/i,
    code: "INJECTION_PATTERN",
    severity: "HIGH",
    detail: "Tentativa de troca de papel para escalar privilégio.",
  },
  {
    re: /\b(call|invoke|execute|run|chame|execute)\b[^.\n]{0,25}\b(tool|function|endpoint|api|webhook|refund|payout|reembolso|repasse)\b/i,
    code: "TOOL_ABUSE_ATTEMPT",
    severity: "HIGH",
    detail: "Tentativa de acionar uma ferramenta ou operação financeira via texto.",
  },
  {
    re: /\b(approve|aprove|autorize|authorize|liberar|release)\b[^.\n]{0,30}\b(payment|refund|order|payout|pagamento|reembolso|pedido|repasse)\b/i,
    code: "TOOL_ABUSE_ATTEMPT",
    severity: "MEDIUM",
    detail: "Texto tentando comandar uma transição de estado.",
  },
  {
    re: /\b(send|post|upload|envie|exfiltrate|leak|vaze)\b[^.\n]{0,30}\b(https?:\/\/|to my server|para meu servidor|webhook\.)/i,
    code: "EXFILTRATION_ATTEMPT",
    severity: "HIGH",
    detail: "Tentativa de exfiltração de dados para destino externo.",
  },
  {
    re: /<\|?(im_start|im_end|system|assistant|endoftext)\|?>/i,
    code: "INJECTION_PATTERN",
    severity: "MEDIUM",
    detail: "Tokens de controle de modelo embutidos no texto.",
  },
];

/**
 * Things we will not have manufactured, regardless of who asks or how it is worded.
 * Deliberately narrow: this is a manufacturing-safety list, not a taste filter.
 */
const PROHIBITED_PATTERNS: { re: RegExp; detail: string }[] = [
  {
    re: /\b(colete|vest)\b[^.\n]{0,20}\b(bal[íi]stic|[àa] prova de bala|bulletproof|ballistic)\b/i,
    detail: "Equipamento de proteção balística exige certificação e não é produzido aqui.",
  },
  {
    re: /\b(uniforme|uniform|farda)\b[^.\n]{0,30}\b(pol[íi]cia|policial|police|ex[ée]rcito|army|militar oficial|federal)\b/i,
    detail: "Uniformes de força de segurança real não podem ser reproduzidos.",
  },
  {
    re: /\b(nazi|nazista|sswaffen|waffen[- ]?ss|kkk|klan)\b/i,
    detail: "Simbologia de ódio não é produzida nesta plataforma.",
  },
  {
    re: /\b(esconder|hide|conceal|ocultar)\b[^.\n]{0,25}\b(arma|weapon|faca|knife|pistola|gun)\b/i,
    detail: "Peças projetadas para ocultar armas não são produzidas.",
  },
];

/**
 * Signals that a reference may carry someone else's protected character or mark.
 * This raises a rights conversation with the customer. It never auto-rejects and
 * it never guesses at "this is franchise X" — that call belongs to a human.
 */
const IP_SIGNAL_PATTERNS: { re: RegExp; detail: string }[] = [
  {
    re: /\b(personagem|character|cosplay|r[ée]plica exata|exact replica|screen accurate|fantasia oficial|official costume)\b/i,
    detail: "A descrição sugere a reprodução de um personagem específico.",
  },
  {
    re: /\b(logo|logotipo|marca|brand|emblema|bras[ãa]o)\b[^.\n]{0,30}\b(da|do|de|of the)\b/i,
    detail: "A descrição menciona uma marca ou emblema de terceiro.",
  },
  {
    re: /\b(igual ao|exatamente como|identical to|copy of|c[óo]pia d[eo])\b/i,
    detail: "O pedido descreve uma cópia de uma peça existente.",
  },
];

const MAX_BRIEF_LENGTH = 4_000;

/**
 * Structurally isolates untrusted text. The model is told, in the system prompt,
 * that everything between these markers is *data describing a garment* and never
 * an instruction — and the markers themselves are stripped from user input so
 * they cannot be forged.
 */
export const USER_TEXT_OPEN = "<<<CUSTOMER_BRIEF>>>";
export const USER_TEXT_CLOSE = "<<<END_CUSTOMER_BRIEF>>>";

function stripDelimiters(text: string): string {
  return text
    .replaceAll(USER_TEXT_OPEN, "[marcador removido]")
    .replaceAll(USER_TEXT_CLOSE, "[marcador removido]")
    .replace(/<\|?(im_start|im_end|system|assistant|endoftext)\|?>/gi, "[token removido]");
}

export function inspectUserText(
  text: string,
  context: { userId?: string; correlationId?: string } = {},
): GuardrailReport {
  const findings: GuardrailFinding[] = [];
  const trimmed = text.slice(0, MAX_BRIEF_LENGTH);

  if (text.length > MAX_BRIEF_LENGTH) {
    findings.push({
      code: "EXCESSIVE_LENGTH",
      severity: "LOW",
      detail: `Texto truncado em ${MAX_BRIEF_LENGTH} caracteres.`,
    });
  }

  for (const p of INJECTION_PATTERNS) {
    const m = p.re.exec(trimmed);
    if (m) {
      findings.push({ code: p.code, severity: p.severity, detail: p.detail, evidence: m[0].slice(0, 120) });
    }
  }
  for (const p of PROHIBITED_PATTERNS) {
    const m = p.re.exec(trimmed);
    if (m) {
      findings.push({ code: "PROHIBITED_ITEM", severity: "HIGH", detail: p.detail, evidence: m[0].slice(0, 120) });
    }
  }
  for (const p of IP_SIGNAL_PATTERNS) {
    const m = p.re.exec(trimmed);
    if (m) {
      findings.push({ code: "THIRD_PARTY_IP_SIGNAL", severity: "MEDIUM", detail: p.detail, evidence: m[0].slice(0, 120) });
    }
  }

  // Only a prohibited item stops the request outright. Injection attempts are
  // logged and neutralised, but the customer still gets their garment analysed —
  // treating a false positive as a ban would be worse than the attack.
  const blocked = findings.some((f) => f.code === "PROHIBITED_ITEM");
  const needsReview = findings.some(
    (f) => f.severity === "HIGH" || f.code === "THIRD_PARTY_IP_SIGNAL",
  );

  if (findings.length > 0) {
    securityEvent("ai.guardrail.triggered", {
      ...context,
      codes: findings.map((f) => f.code),
      blocked,
    });
  }

  return { findings, blocked, needsReview, sanitizedText: stripDelimiters(trimmed) };
}

/**
 * Model output is untrusted too. This checks the *shape* of what came back
 * before it is parsed as a spec: an oversized or non-JSON body is a provider
 * failure, not something to hand to Zod and hope.
 */
export function inspectModelOutput(raw: string): { ok: true; json: unknown } | { ok: false; reason: string } {
  if (raw.length > 200_000) return { ok: false, reason: "Resposta do modelo excedeu o tamanho aceito." };
  // Models sometimes wrap JSON in a fenced block; unwrap exactly that, nothing else.
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(raw);
  const body = fenced?.[1] ?? raw;
  try {
    return { ok: true, json: JSON.parse(body) };
  } catch {
    return { ok: false, reason: "Resposta do modelo não é JSON válido." };
  }
}
