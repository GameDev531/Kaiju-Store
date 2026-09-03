import type { DesignSpecification } from "../domain/spec";
import type { ReferenceRole } from "../domain/enums";

/**
 * The AI provider boundary.
 *
 * Everything above this interface (the design flow, pricing, production) is
 * provider-agnostic and works with `heuristic` — the deterministic local
 * analyser — with no credentials at all. That is deliberate: the product must
 * degrade to something honest and usable when the model is down, over budget,
 * or not yet contracted.
 */

export interface AnalysisReference {
  id: string;
  role: ReferenceRole;
  caption?: string | undefined;
  weight: number;
  /** Objective facts about the file. Never the file's own claims about itself. */
  meta: {
    widthPx: number | null;
    heightPx: number | null;
    byteSize: number;
    contentType: string;
    /** Coarse palette sampled server-side from the decoded pixels. */
    dominantColors?: { hex: string; share: number }[];
  };
  /** Base64 image payload — only populated for providers that accept vision input. */
  imageBase64?: string;
}

export interface AnalysisRequest {
  designId: string;
  title: string;
  /** Already sanitised by guardrails before it reaches a provider. */
  briefText: string;
  references: AnalysisReference[];
  measurements?: {
    provided: boolean;
    fields: Record<string, number>;
    source: string;
  };
  preferences?: {
    cutProfile: "UNISEX" | "MASC_CUT" | "FEM_CUT";
    sizingHint?: string;
  };
  correlationId: string;
  signal?: AbortSignal;
}

export interface AnalysisResult {
  spec: DesignSpecification;
  provider: string;
  model: string | null;
  latencyMs: number;
  costCents: number;
  /** Free-form provider diagnostics kept for the audit trail. Never shown raw. */
  diagnostics?: Record<string, unknown>;
}

export interface AIProvider {
  readonly name: string;
  analyse(request: AnalysisRequest): Promise<AnalysisResult>;
}
