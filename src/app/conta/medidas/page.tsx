import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { MeasurementForm } from "@/components/account/forms";
import { saveMeasurementsAction } from "../actions";
import { Label, SectionHead, Notice, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Minhas medidas", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MeasurementsPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta/medidas");

  const [profiles, csrf] = await Promise.all([
    db.measurementProfile.findMany({
      where: { userId: auth.user.id, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    csrfToken("account.measurements"),
  ]);

  const primary = profiles[0];

  return (
    <div>
      <Label>Sob medida</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Minhas medidas</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Estas medidas são o que o ateliê usa para cortar. Elas viajam sem seu nome, endereço ou contato —
        a costureira recebe números e uma ficha técnica, não a sua identidade.
      </p>

      <div style={{ marginTop: "1.75rem" }}>
        <Notice tone="info" title="Tolerância de produção">
          Toda peça é feita com uma tolerância acordada de <strong>±15 mm</strong> por padrão. No controle
          de qualidade, o ateliê mede a peça pronta e registra os números — é isso que torna possível
          responder objetivamente se algo saiu fora do combinado.
        </Notice>
      </div>

      {profiles.length > 1 ? (
        <section style={{ marginTop: "2rem" }}>
          <SectionHead label="Seus perfis" title="Perfis salvos" />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {profiles.map((p) => (
              <Badge key={p.id} tone={p.isDefault ? "ink" : "default"}>
                {p.name}{p.isDefault ? " · padrão" : ""}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label={primary ? "Editar" : "Criar"} title={primary ? primary.name : "Novo perfil de medidas"} />
        <MeasurementForm
          action={saveMeasurementsAction}
          csrf={csrf}
          {...(primary
            ? {
                profile: {
                  id: primary.id,
                  name: primary.name,
                  source: primary.source,
                  notes: primary.notes,
                  values: {
                    heightMm: primary.heightMm, chestMm: primary.chestMm, waistMm: primary.waistMm,
                    hipMm: primary.hipMm, shoulderMm: primary.shoulderMm, sleeveMm: primary.sleeveMm,
                    inseamMm: primary.inseamMm, outseamMm: primary.outseamMm, neckMm: primary.neckMm,
                    thighMm: primary.thighMm, wristMm: primary.wristMm, torsoMm: primary.torsoMm,
                  },
                },
              }
            : {})}
        />
      </section>
    </div>
  );
}
