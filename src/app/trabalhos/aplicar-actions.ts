"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireAuth, assertCsrf, rateLimitSubject } from "@/server/auth/session";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/ratelimit";
import { AppError, toAppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { recordAudit } from "@/server/domain/audit";

export interface ApplyState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
}

const failure = (error: unknown): ApplyState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("jobs.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false, code: e.code, message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

const ApplicationSchema = z.object({
  postingId: z.string().min(1),
  coverNote: z.string().trim().max(2000).optional(),
  // Only http(s), and never an internal host — this URL is rendered to a recruiter.
  portfolioUrl: z
    .string()
    .trim()
    .url("Informe uma URL completa, começando com https://")
    .refine((u) => /^https?:\/\//i.test(u), "Apenas endereços http ou https.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function applyToJobAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("jobs.apply", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.jobApplication, await rateLimitSubject(auth), { userId: auth.user.id });

    const parsed = ApplicationSchema.safeParse({
      postingId: formData.get("postingId"),
      coverNote: formData.get("coverNote") || undefined,
      portfolioUrl: formData.get("portfolioUrl") || "",
    });
    if (!parsed.success) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Confira os campos.",
        action: "Corrija o que está destacado e envie de novo.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    // Only an approved recruiter's OPEN posting accepts applications.
    const posting = await db.jobPosting.findFirst({
      where: {
        id: parsed.data.postingId,
        status: "OPEN",
        recruiterAccount: { status: "APPROVED" },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, title: true },
    });
    if (!posting) {
      throw new AppError("NOT_FOUND", "Esta vaga não está mais aberta.", {
        action: "Veja as vagas abertas agora — a lista muda.",
      });
    }

    try {
      await db.jobApplication.create({
        data: {
          postingId: posting.id,
          applicantUserId: auth.user.id,
          coverNote: parsed.data.coverNote ?? null,
          portfolioUrl: parsed.data.portfolioUrl ?? null,
          status: "SUBMITTED",
        },
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        return {
          ok: false, code: "CONFLICT",
          message: "Você já se candidatou a esta vaga.",
          action: "Uma candidatura por pessoa por vaga. Acompanhe o retorno pelo e-mail da conta.",
        };
      }
      throw error;
    }

    await recordAudit({
      actorUserId: auth.user.id,
      action: "jobs.application_submitted",
      targetType: "JobPosting",
      targetId: posting.id,
    });

    revalidatePath(`/trabalhos/${posting.id}`);
    return {
      ok: true,
      message: "Candidatura enviada.",
      action: "A empresa recebe seu contato e seu portfólio. Lembre: nenhuma vaga legítima cobra nada de você.",
    };
  } catch (error) {
    return failure(error);
  }
}
