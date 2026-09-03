"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireAuth, assertCsrf, rateLimitSubject, getAuth } from "@/server/auth/session";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/ratelimit";
import { AppError, toAppError, validationFailed } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { storeImage } from "@/server/storage";
import { ReferenceRoleSchema, type ReferenceRole } from "@/server/domain/enums";
import {
  createDesign,
  attachReference,
  analyseDesign,
  reviseSpec,
  approveVersion,
  createQuotation,
  getDesignForUser,
} from "@/server/domain/designs";
import { DesignSpecificationSchema, parseSpecJson, type DesignSpecification } from "@/server/domain/spec";
import { recordInteraction } from "@/server/domain/recommender";

/**
 * Server Actions for the design studio.
 *
 * Every action in this file follows the same discipline:
 *   1. Authenticate.       2. Verify CSRF for this specific action.
 *   3. Rate limit.         4. Validate input with Zod.
 *   5. Do the work in the domain layer, never inline here.
 *   6. Return a serialisable result the form can render — including failures.
 *
 * Actions never throw to the client. They return a typed `ActionState` so the UI
 * can show what happened and what to do next, which is impossible with an
 * unhandled exception boundary.
 */

export interface ActionState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  /** Where to go on success, when the action navigates. */
  redirectTo?: string;
  data?: Record<string, unknown>;
}

const failure = (error: unknown): ActionState => {
  const appError = toAppError(error);
  if (appError.code === "INTERNAL_ERROR") {
    log.error("action.unhandled", { error: appError.internal ?? appError });
  }
  return {
    ok: false,
    code: appError.code,
    message: appError.message,
    ...(appError.action ? { action: appError.action } : {}),
    ...(appError.fields ? { fields: appError.fields } : {}),
  };
};

// ---------------------------------------------------------------- create ----

const CreateDesignSchema = z.object({
  title: z.string().trim().min(1, "Dê um nome para reconhecer depois.").max(120),
  brief: z.string().trim().max(4000, "Máximo de 4000 caracteres.").default(""),
});

export async function createDesignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.create", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.write, await rateLimitSubject(auth), { userId: auth.user.id });

    const parsed = CreateDesignSchema.safeParse({
      title: formData.get("title"),
      brief: formData.get("brief") ?? "",
    });
    if (!parsed.success) {
      throw validationFailed(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      );
    }

    const designId = await createDesign({
      userId: auth.user.id,
      title: parsed.data.title,
      briefText: parsed.data.brief,
    });

    await recordInteraction({ kind: "CUSTOMIZE", userId: auth.user.id });
    return { ok: true, redirectTo: `/criar/${designId}` };
  } catch (error) {
    return failure(error);
  }
}

// ------------------------------------------------------------- references ---

export async function uploadReferenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.reference", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.upload, await rateLimitSubject(auth), { userId: auth.user.id });

    const designId = String(formData.get("designId") ?? "");
    const roleRaw = String(formData.get("role") ?? "OVERALL");
    const caption = String(formData.get("caption") ?? "").trim().slice(0, 200);

    const roleParsed = ReferenceRoleSchema.safeParse(roleRaw);
    if (!roleParsed.success) throw validationFailed({ role: "Escolha para que serve esta referência." });

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw validationFailed({ file: "Escolha uma imagem para enviar." });
    }

    // Ownership check before doing any work with the bytes.
    const design = await db.design.findFirst({
      where: { id: designId, userId: auth.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!design) throw new AppError("NOT_FOUND", "Design não encontrado.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeImage({
      buffer,
      declaredName: file.name,
      purpose: "REFERENCE",
      ownerUserId: auth.user.id,
    });

    const reference = await db.referenceImage.create({
      data: {
        userId: auth.user.id,
        fileId: stored.fileId,
        role: roleParsed.data,
        caption: caption || null,
      },
    });

    await attachReference({
      designId,
      userId: auth.user.id,
      referenceImageId: reference.id,
      role: roleParsed.data,
    });

    revalidatePath(`/criar/${designId}`);
    return { ok: true, message: "Referência adicionada." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeReferenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.reference.remove", formData.get("csrf"));

    const designId = String(formData.get("designId") ?? "");
    const linkId = String(formData.get("linkId") ?? "");

    // Delete scoped by owner: an id from another account matches nothing.
    const { count } = await db.designReference.deleteMany({
      where: { id: linkId, design: { id: designId, userId: auth.user.id } },
    });
    if (count === 0) throw new AppError("NOT_FOUND", "Referência não encontrada.");

    revalidatePath(`/criar/${designId}`);
    return { ok: true, message: "Referência removida." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateReferenceRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.reference.role", formData.get("csrf"));

    const designId = String(formData.get("designId") ?? "");
    const linkId = String(formData.get("linkId") ?? "");
    const role = ReferenceRoleSchema.parse(formData.get("role"));

    const { count } = await db.designReference.updateMany({
      where: { id: linkId, design: { id: designId, userId: auth.user.id } },
      data: { role },
    });
    if (count === 0) throw new AppError("NOT_FOUND", "Referência não encontrada.");

    revalidatePath(`/criar/${designId}`);
    return { ok: true, message: "Papel da referência atualizado." };
  } catch (error) {
    return failure(error);
  }
}

// --------------------------------------------------------------- analysis ---

export async function analyseDesignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.analyse", formData.get("csrf"));
    const designId = String(formData.get("designId") ?? "");

    const result = await analyseDesign({
      designId,
      userId: auth.user.id,
      rateLimitSubject: await rateLimitSubject(auth),
    });

    revalidatePath(`/criar/${designId}`);
    return {
      ok: true,
      message: result.degraded
        ? "Ficha montada em modo reduzido."
        : "Ficha técnica pronta para sua revisão.",
      ...(result.degradedReason ? { action: result.degradedReason } : {}),
      data: { versionId: result.versionId, version: result.version, degraded: result.degraded },
    };
  } catch (error) {
    return failure(error);
  }
}

// ------------------------------------------------------------------ edits ---

/**
 * Applies a customer's field edits to the current spec and saves a new version.
 *
 * Edited fields are re-tagged as OBSERVED and marked `editedByCustomer`, which is
 * the correct epistemics: the customer stating a fact about their own garment is
 * a stronger source than the model's reading of a photograph.
 */
export async function reviseSpecAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.revise", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.write, await rateLimitSubject(auth), { userId: auth.user.id });

    const designId = String(formData.get("designId") ?? "");
    const versionId = String(formData.get("versionId") ?? "");

    const version = await db.designVersion.findFirst({
      where: { id: versionId, designId, design: { userId: auth.user.id } },
    });
    if (!version) throw new AppError("NOT_FOUND", "Versão não encontrada.");

    const base = parseSpecJson(version.specJson);
    const next: DesignSpecification = structuredClone(base);
    const changed: string[] = [];

    const SINGLE_FIELDS = [
      "garmentType", "silhouette", "fit", "length", "sleeveType", "collar", "neckline",
      "waistband", "closures", "seams", "materialEstimate", "materialWeight", "pattern",
      "finishing", "embroidery", "printing", "sizing",
    ] as const;

    for (const key of SINGLE_FIELDS) {
      const raw = formData.get(`field.${key}`);
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      const current = next[key] as DesignSpecification["garmentType"] | undefined;

      if (value === "") {
        if (current && key !== "garmentType") {
          (next as Record<string, unknown>)[key] = undefined;
          changed.push(key);
        }
        continue;
      }
      if (current?.value === value) continue;

      (next as Record<string, unknown>)[key] = {
        value: value.slice(0, 400),
        // The customer said it, so it is observed — and flagged as their edit so
        // the atelier knows this line is not the model's guess.
        confidence: "OBSERVED",
        editedByCustomer: true,
        ...(current?.sourceRole ? { sourceRole: current.sourceRole } : {}),
        rationale: "Definido pelo cliente na revisão da ficha.",
      };
      changed.push(key);
    }

    const summary = String(formData.get("summary") ?? "").trim();
    if (summary && summary !== next.summary) {
      next.summary = summary.slice(0, 1200);
      changed.push("summary");
    }

    // Editing away an uncertainty clears the warning it raised.
    if (changed.includes("materialEstimate")) {
      next.warnings = next.warnings.filter((w) => w.code !== "FABRIC_UNDETERMINED");
    }

    if (changed.length === 0) {
      return { ok: true, message: "Nada mudou — nenhuma versão nova foi criada." };
    }

    const validated = DesignSpecificationSchema.safeParse(next);
    if (!validated.success) {
      throw validationFailed(
        Object.fromEntries(validated.error.issues.slice(0, 6).map((i) => [i.path.join("."), i.message])),
        "Alguns valores da ficha não passaram na validação técnica.",
      );
    }

    const saved = await reviseSpec({
      designId,
      userId: auth.user.id,
      spec: validated.data,
      changeSummary: `Cliente ajustou: ${changed.join(", ")}`,
    });

    revalidatePath(`/criar/${designId}`);
    return {
      ok: true,
      message: `Versão ${saved.version} salva com ${changed.length} ajuste(s).`,
      action: "A versão anterior continua no histórico — nada foi sobrescrito.",
      data: { versionId: saved.versionId, version: saved.version },
    };
  } catch (error) {
    return failure(error);
  }
}

// -------------------------------------------------------------- approval ----

export async function approveAndQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("design.approve", formData.get("csrf"));

    const designId = String(formData.get("designId") ?? "");
    const versionId = String(formData.get("versionId") ?? "");
    const quantity = Math.max(1, Math.min(20, Number(formData.get("quantity") ?? 1) || 1));
    const rush = formData.get("rush") === "on";
    const measurementProfileId = String(formData.get("measurementProfileId") ?? "");

    if (measurementProfileId) {
      // Ownership-checked before it is bound to the design.
      const profile = await db.measurementProfile.findFirst({
        where: { id: measurementProfileId, userId: auth.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!profile) throw validationFailed({ measurementProfileId: "Perfil de medidas não encontrado." });
      await db.design.update({ where: { id: designId }, data: { measurementProfileId } });
    }

    await approveVersion({ designId, versionId, userId: auth.user.id });
    const quotationId = await createQuotation({ designId, versionId, userId: auth.user.id, quantity, rush });

    revalidatePath(`/criar/${designId}`);
    return { ok: true, redirectTo: `/criar/${designId}/orcamento/${quotationId}` };
  } catch (error) {
    return failure(error);
  }
}

/** Loads a design for the studio UI, ownership-scoped. */
export async function loadDesign(designId: string) {
  const auth = await getAuth();
  if (!auth) redirect(`/entrar?next=${encodeURIComponent(`/criar/${designId}`)}`);
  return getDesignForUser(designId, auth.user.id);
}
