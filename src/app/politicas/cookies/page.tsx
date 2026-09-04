import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/policy";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Política de cookies",
  description: "Os cookies que a KAIJU usa, para quê, e por quanto tempo. Nenhum é de publicidade.",
  alternates: { canonical: "/politicas/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <PolicyPage
      label="Política"
      title="Cookies"
      updated="1 de setembro de 2026"
      summary="Usamos quatro cookies. Todos são necessários para o site funcionar. Nenhum é de publicidade, e nenhum rastreia você em outros sites."
    >
      <Notice tone="good" title="Por isso não há banner de cookies aqui">
        Um aviso de consentimento existe quando há algo a consentir. Como não usamos cookies de
        publicidade nem de análise de terceiros, não há escolha a fazer — e um banner que pede
        permissão para o que é estritamente necessário é teatro, não transparência.
      </Notice>

      <PolicySection title="Os cookies que usamos">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Cookie</th>
                <th scope="col">Para quê</th>
                <th scope="col">Duração</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["kaiju_session", "Mantém você conectado. Guarda apenas um identificador opaco — nenhum dado seu.", "14 dias"],
                ["kaiju_csrf", "Impede que outro site envie formulários em seu nome.", "14 dias"],
                ["kaiju_anon", "Identificador aleatório para carrinho e recomendações de quem não tem conta. Não é uma impressão digital do seu dispositivo.", "180 dias"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="t-mono" style={{ fontSize: "0.8rem" }}>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.875rem" }}>
          Todos são <code className="t-mono">httpOnly</code> (o JavaScript da página não consegue lê-los),{" "}
          <code className="t-mono">SameSite=Lax</code>, e marcados como <code className="t-mono">Secure</code>{" "}
          em conexões HTTPS.
        </p>
      </PolicySection>

      <PolicySection title="O que não usamos">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Pixels de rede social ou de publicidade.</li>
          <li>Google Analytics ou equivalente de terceiro.</li>
          <li>Cookies de retargeting.</li>
          <li>Impressão digital de dispositivo (fingerprinting).</li>
          <li>Fontes ou scripts carregados de CDN de terceiro — inclusive por isso não há webfont externa aqui.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Como recusar">
        <p>
          Você pode bloquear cookies no seu navegador. O site continua navegável, mas entrar na conta,
          montar um carrinho e finalizar um pedido deixam de funcionar — essas operações dependem de
          uma sessão.
        </p>
        <p>
          O cookie de recomendação você apaga a qualquer momento em{" "}
          <Link href="/conta/privacidade" className="link">Conta → Privacidade</Link>, junto com todo o
          histórico associado a ele.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
