import type { AIProvider, AnalysisRequest, AnalysisResult } from "./provider";
import { HeuristicProvider } from "./heuristic-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { isAppError } from "../lib/errors";

export type { AIProvider, AnalysisRequest, AnalysisResult, AnalysisReference } from "./provider";

const heuristic = new HeuristicProvider();

function primaryProvider(): AIProvider {
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  return heuristic;
}

export interface AnalysisOutcome extends AnalysisResult {
  /** True when the primary provider failed and the deterministic analyser ran instead. */
  degraded: boolean;
  degradedReason?: string;
}

/**
 * Runs the analysis with an explicit degradation path.
 *
 * A model outage must not become a dead end for a customer who is mid-flow. When
 * the primary provider fails we fall back to the deterministic analyser and mark
 * the result `degraded` — the UI says so plainly and offers a retry, rather than
 * passing off a weaker reading as the full one.
 */
export async function runAnalysis(request: AnalysisRequest): Promise<AnalysisOutcome> {
  const provider = primaryProvider();
  if (provider.name === heuristic.name) {
    const result = await heuristic.analyse(request);
    return { ...result, degraded: false };
  }

  try {
    const result = await provider.analyse(request);
    return { ...result, degraded: false };
  } catch (error) {
    const reason = isAppError(error) ? error.code : "PROVIDER_ERROR";
    log.warn("ai.fallback_to_heuristic", {
      correlationId: request.correlationId,
      designId: request.designId,
      reason,
    });
    const result = await heuristic.analyse(request);
    return {
      ...result,
      degraded: true,
      degradedReason:
        "A leitura das imagens não está disponível no momento. Esta ficha foi montada a partir do seu texto e das propriedades das imagens — revise com atenção extra e tente a análise completa mais tarde.",
    };
  }
}

export const activeProviderName = (): string => primaryProvider().name;
