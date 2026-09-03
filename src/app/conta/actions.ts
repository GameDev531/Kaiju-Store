"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireAuth, assertCsrf, revokeAllSessions } from "@/server/auth/session";
import { toAppError } from "@/server/lib/errors";
import { recordAudit } from "@/server/domain/audit";
import { forgetTasteData } from "@/server/domain/recommender";
import { log } from "@/server/lib/logger";

export interface AccountState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  /** For the data-export action: a JSON blob the browser turns into a download. */
  exportJson?: string;
}

const failure = (error: unknown): AccountState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("account.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false, code: e.code, message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

/** Millimetres, integers. The UI collects centimetres and converts here. */
const mm = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional().or(z.literal("").transform(() => undefined));

const MeasurementSchema = z.object({
  name: z.string().trim().min(1).max(60).default("Meu corpo"),
  source: z.enum(["SELF_REPORTED", "TAILOR_MEASURED", "FROM_GARMENT"]).default("SELF_REPORTED"),
  heightMm: mm(500, 2500), chestMm: mm(400, 2000), waistMm: mm(300, 2000), hipMm: mm(400, 2200),
  shoulderMm: mm(200, 900), sleeveMm: mm(100, 1100), inseamMm: mm(200, 1300), outseamMm: mm(300, 1500),
  neckMm: mm(200, 700), thighMm: mm(250, 1200), wristMm: mm(100, 400), torsoMm: mm(300, 1200),
  notes: z.string().trim().max(500).optional(),
});

export async function saveMeasurementsAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("account.measurements", formData.get("csrf"));

    // Centimetres in the form, millimetres in the database — converted once, here.
    const toMm = (key: string): string => {
      const raw = formData.get(key);
      if (typeof raw !== "string" || raw.trim() === "") return "";
      const cm = Number(raw.replace(",", "."));
      return Number.isFinite(cm) ? String(Math.round(cm * 10)) : "";
    };

    const parsed = MeasurementSchema.safeParse({
      name: formData.get("name") || "Meu corpo",
      source: formData.get("source") || "SELF_REPORTED",
      heightMm: toMm("height"), chestMm: toMm("chest"), waistMm: toMm("waist"), hipMm: toMm("hip"),
      shoulderMm: toMm("shoulder"), sleeveMm: toMm("sleeve"), inseamMm: toMm("inseam"),
      outseamMm: toMm("outseam"), neckMm: toMm("neck"), thighMm: toMm("thigh"),
      wristMm: toMm("wrist"), torsoMm: toMm("torso"),
      notes: formData.get("notes") || undefined,
    });

    if (!parsed.success) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Algumas medidas estão fora do intervalo esperado.",
        action: "Confira se usou centímetros e se não trocou dois campos de lugar.",
        fields: Object.fromEntries(
          parsed.error.issues.map((i) => [
            i.path.join("."),
            "Valor fora do intervalo plausível para uma medida de corpo.",
          ]),
        ),
      };
    }

    const profileId = String(formData.get("profileId") ?? "");
    const { name, source, notes, ...measurements } = parsed.data;

    if (profileId) {
      // Ownership-scoped update: an id from another account matches no rows.
      const { count } = await db.measurementProfile.updateMany({
        where: { id: profileId, userId: auth.user.id, deletedAt: null },
        data: { name, source, notes: notes ?? null, ...measurements },
      });
      if (count === 0) {
        return { ok: false, code: "NOT_FOUND", message: "Perfil não encontrado.", action: "Recarregue a página." };
      }
    } else {
      const existing = await db.measurementProfile.count({ where: { userId: auth.user.id, deletedAt: null } });
      await db.measurementProfile.create({
        data: {
          userId: auth.user.id, name, source, notes: notes ?? null,
          isDefault: existing === 0, ...measurements,
        },
      });
    }

    revalidatePath("/conta/medidas");
    return {
      ok: true,
      message: "Medidas salvas.",
      action: "Elas serão usadas nos próximos pedidos sob medida. Pedidos já em produção mantêm as medidas com que foram aprovados.",
    };
  } catch (error) {
    return failure(error);
  }
}

const AddressSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Casa"),
  recipient: z.string().trim().min(2, "Informe quem recebe.").max(120),
  line1: z.string().trim().min(4, "Informe rua e número.").max(200),
  line2: z.string().trim().max(120).optional(),
  district: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2, "Informe a cidade.").max(100),
  state: z.string().trim().length(2, "Use a sigla do estado, com 2 letras."),
  postalCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP no formato 00000-000."),
  phone: z.string().trim().max(30).optional(),
});

export async function saveAddressAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("account.address", formData.get("csrf"));

    const parsed = AddressSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Confira o endereço.",
        action: "Corrija os campos destacados.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    const existing = await db.address.count({ where: { userId: auth.user.id, deletedAt: null } });
    await db.address.create({
      data: {
        userId: auth.user.id,
        ...parsed.data,
        postalCode: parsed.data.postalCode.replace("-", ""),
        state: parsed.data.state.toUpperCase(),
        line2: parsed.data.line2 ?? null,
        district: parsed.data.district ?? null,
        phone: parsed.data.phone ?? null,
        isDefault: existing === 0,
      },
    });

    revalidatePath("/conta/enderecos");
    return { ok: true, message: "Endereço salvo." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Data export. Assembles everything the platform holds about this account,
 * from the account's own rows, and hands it back as JSON.
 */
export async function exportDataAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("account.export", formData.get("csrf"));

    const [user, addresses, measurements, designs, orders, references, affinity, consents] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: auth.user.id },
        select: { email: true, displayName: true, createdAt: true, locale: true, currency: true, roles: true },
      }),
      db.address.findMany({ where: { userId: auth.user.id, deletedAt: null } }),
      db.measurementProfile.findMany({ where: { userId: auth.user.id, deletedAt: null } }),
      db.design.findMany({
        where: { userId: auth.user.id, deletedAt: null },
        include: { versions: { select: { version: true, specJson: true, createdAt: true, approvedAt: true } } },
      }),
      db.order.findMany({
        where: { userId: auth.user.id },
        include: { items: { select: { titleSnapshot: true, quantity: true, totalPriceCents: true } } },
      }),
      db.referenceImage.findMany({
        where: { userId: auth.user.id, deletedAt: null },
        select: { id: true, role: true, caption: true, createdAt: true, file: { select: { originalName: true, byteSize: true, contentType: true } } },
      }),
      db.tasteProfile.findUnique({ where: { userId: auth.user.id } }),
      db.consentRecord.findMany({ where: { userId: auth.user.id } }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      note: "Exportação completa dos dados que a KAIJU mantém sobre esta conta. As imagens em si podem ser baixadas individualmente pelos links assinados na sua área de referências.",
      account: user,
      addresses,
      measurements,
      designs,
      orders,
      referenceImages: references,
      tasteProfile: affinity ? JSON.parse(affinity.affinityJson) : null,
      consents,
    };

    await recordAudit({
      actorUserId: auth.user.id,
      action: "privacy.data_exported",
      targetType: "User",
      targetId: auth.user.id,
    });

    return { ok: true, message: "Exportação pronta.", exportJson: JSON.stringify(payload, null, 2) };
  } catch (error) {
    return failure(error);
  }
}

/** Deletes behavioural data without touching orders, designs, or the account. */
export async function forgetBehaviourAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("account.forget", formData.get("csrf"));
    await forgetTasteData({ userId: auth.user.id });
    await recordAudit({
      actorUserId: auth.user.id,
      action: "privacy.behaviour_deleted",
      targetType: "User",
      targetId: auth.user.id,
    });
    revalidatePath("/conta/privacidade");
    return {
      ok: true,
      message: "Seu histórico de navegação e o perfil de gosto foram apagados.",
      action: "As recomendações voltam ao estado inicial. Seus pedidos e designs não foram afetados.",
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Account deletion.
 *
 * Deliberately a *request*, not an instant purge. Orders in production and
 * financial records have retention obligations, and a producer mid-job needs the
 * measurements to finish the garment. The request revokes access immediately,
 * anonymises what can be anonymised, and schedules the rest.
 */
export async function requestDeletionAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("account.delete", formData.get("csrf"));

    const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();
    if (confirmation !== "APAGAR") {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Confirmação incorreta.",
        action: "Digite APAGAR exatamente como está escrito para confirmar.",
        fields: { confirmation: "Digite APAGAR para confirmar." },
      };
    }

    const activeOrders = await db.order.count({
      where: {
        userId: auth.user.id,
        status: { notIn: ["COMPLETED", "CANCELLED", "REFUNDED", "DELIVERED"] },
      },
    });

    await db.user.update({
      where: { id: auth.user.id },
      data: { status: "DELETION_REQUESTED" },
    });
    await revokeAllSessions(auth.user.id, "deletion_requested");
    await recordAudit({
      actorUserId: auth.user.id,
      action: "privacy.deletion_requested",
      targetType: "User",
      targetId: auth.user.id,
      newState: { activeOrders },
    });

    return {
      ok: true,
      message: "Pedido de exclusão registrado.",
      action:
        activeOrders > 0
          ? `Você tem ${activeOrders} pedido(s) em andamento. Vamos concluí-los, e a exclusão acontece em até 30 dias após a última entrega. Seu acesso foi encerrado agora.`
          : "Seu acesso foi encerrado agora. Os dados são apagados em até 30 dias; registros fiscais são mantidos pelo prazo legal, sem uso comercial.",
    };
  } catch (error) {
    return failure(error);
  }
}
