import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/policy";
import { Notice } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Que dados a KAIJU coleta, para quê, por quanto tempo, quem vê, e como você exporta ou apaga tudo.",
  alternates: { canonical: "/politicas/privacidade" },
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage
      label="Política"
      title="Privacidade"
      updated="1 de setembro de 2026"
      summary="Coletamos o mínimo para produzir e entregar a sua peça. Não vendemos dados, não usamos suas imagens para treinar modelos, e você pode exportar ou apagar tudo pela sua conta."
    >
      <Notice tone="good" title="O resumo, se você só ler uma coisa">
        Suas fotos servem para fazer a sua roupa e nada mais. O ateliê recebe medidas e ficha técnica,
        nunca o seu nome ou endereço. Nenhum dado seu é vendido ou usado para publicidade de terceiros.
        Tudo isso é exportável e apagável em{" "}
        <Link href="/conta/privacidade" className="link">Conta → Privacidade</Link>.
      </Notice>

      <PolicySection title="1. Quem é o controlador">
        <p>
          {SITE.legalName} trata os dados descritos aqui. Contato do encarregado:{" "}
          <a href={`mailto:${SITE.contact.privacy}`} className="link">{SITE.contact.privacy}</a>.
        </p>
        <p>
          Operamos a partir do Brasil e tratamos dados sob a Lei Geral de Proteção de Dados
          (Lei 13.709/2018). Se você estiver na União Europeia ou no Reino Unido, aplicamos as mesmas
          garantias operacionais de acesso, portabilidade e eliminação descritas abaixo.
        </p>
      </PolicySection>

      <PolicySection title="2. O que coletamos, e a base legal de cada coisa">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Dado</th>
                <th scope="col">Finalidade</th>
                <th scope="col">Base legal</th>
                <th scope="col">Retenção</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Nome e e-mail", "Identificar a conta e comunicar sobre pedidos.", "Execução de contrato", "Enquanto a conta existir"],
                ["Senha (hash)", "Autenticar. Nunca guardamos a senha em si.", "Execução de contrato", "Enquanto a conta existir"],
                ["Medidas corporais", "Produzir a peça no seu corpo.", "Execução de contrato", "Enquanto a conta existir, ou até você apagar"],
                ["Imagens de referência", "Gerar a ficha técnica e orientar o ateliê.", "Execução de contrato", "2 anos, ou até você apagar"],
                ["Endereço e telefone", "Entregar o pedido.", "Execução de contrato", "Enquanto a conta existir"],
                ["Histórico de navegação", "Recomendar peças.", "Legítimo interesse", "Decai em 45 dias; apagável a qualquer momento"],
                ["Pedidos e pagamentos", "Registro fiscal e atendimento.", "Obrigação legal", "Prazo legal do documento fiscal"],
                ["Registros de acesso", "Segurança e investigação de fraude.", "Obrigação legal / legítimo interesse", "6 meses"],
                ["Documentos de verificação", "Aprovar ateliê, revendedor ou contratante.", "Execução de contrato / prevenção à fraude", "90 dias após a decisão"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td style={{ fontWeight: 600 }}>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                  <td>{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Não coletamos:</strong> dados de cartão (ficam com o provedor de pagamento, tokenizados),
          localização precisa, dados de saúde, biometria, ou qualquer categoria sensível. Medidas
          corporais são tratadas com o mesmo cuidado que dados sensíveis, ainda que não sejam
          classificadas como tal.
        </p>
      </PolicySection>

      <PolicySection title="3. Inteligência artificial e as suas imagens">
        <p>
          Esta é a seção que a maioria das políticas escreve de forma vaga. A nossa é específica:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            <strong>Suas imagens não treinam modelos.</strong> Nem os nossos, nem os de terceiros.
            O consentimento para melhoria de modelo existe na sua conta, vem desativado por padrão, e
            não pedimos que você o ative.
          </li>
          <li>
            <strong>Quando uma imagem sai daqui.</strong> Se você usa a análise assistida, a imagem é
            enviada ao provedor de IA apenas para gerar aquela ficha, sob contrato que proíbe uso para
            treinamento. Você pode optar pela ficha manual, e aí nenhuma imagem sai.
          </li>
          <li>
            <strong>Quem vê.</strong> Você, e o ateliê designado ao seu pedido — que recebe as
            referências e as medidas, e nunca o seu nome, endereço, e-mail ou telefone.
          </li>
          <li>
            <strong>Por quanto tempo.</strong> 2 anos, para você poder refazer uma peça a partir do
            mesmo design. Ou até você apagar, o que vier primeiro.
          </li>
          <li>
            <strong>Onde ficam.</strong> Armazenamento privado, sem acesso público. Cada visualização
            passa por um link assinado e temporário, válido por minutos e vinculado a quem tem
            permissão para ver.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="4. Com quem compartilhamos">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li><strong>Ateliê designado:</strong> ficha técnica, referências e medidas. Sem identificação pessoal.</li>
          <li><strong>Transportadora:</strong> nome, endereço e telefone — o necessário para entregar.</li>
          <li><strong>Provedor de pagamento:</strong> valor, referência do pedido e e-mail. Nós nunca vemos seu cartão.</li>
          <li><strong>Provedor de IA:</strong> a imagem e o texto da análise, quando você usa esse recurso.</li>
          <li><strong>Autoridades:</strong> apenas mediante ordem legal válida, e informamos você quando a lei permitir.</li>
        </ul>
        <p><strong>Nunca:</strong> corretores de dados, redes de publicidade, ou qualquer venda de base.</p>
      </PolicySection>

      <PolicySection title="5. Seus direitos, e onde exercer">
        <p>
          Confirmação, acesso, correção, portabilidade, eliminação, informação sobre compartilhamento,
          e revogação de consentimento. Três deles funcionam com um clique, sem falar com ninguém:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li><Link href="/conta/privacidade" className="link">Exportar todos os meus dados</Link> — arquivo JSON completo, na hora.</li>
          <li><Link href="/conta/privacidade" className="link">Apagar meu histórico e perfil de gosto</Link> — imediato.</li>
          <li><Link href="/conta/privacidade" className="link">Excluir minha conta</Link> — acesso encerrado na hora, dados apagados em até 30 dias.</li>
        </ul>
        <p>
          Para o restante, escreva para{" "}
          <a href={`mailto:${SITE.contact.privacy}`} className="link">{SITE.contact.privacy}</a>.
          Respondemos em até 15 dias.
        </p>
        <Notice tone="info" title="Por que a exclusão não é instantânea">
          Se você tem uma peça em produção, o ateliê precisa das medidas para terminá-la, e a nota
          fiscal tem prazo legal de guarda. O acesso é cortado imediatamente; o apagamento acontece
          quando essas obrigações se encerram, e nunca depois de 30 dias da última delas.
        </Notice>
      </PolicySection>

      <PolicySection title="6. Segurança">
        <p>
          Senhas com hash scrypt, sessões opacas e revogáveis no servidor, verificação em duas etapas
          para contas administrativas, criptografia em trânsito, armazenamento de arquivos privado com
          links assinados, e registro de auditoria de toda ação sensível.
        </p>
        <p>
          Nenhum sistema é invulnerável, e não vamos escrever que o nosso é. Em caso de incidente com
          risco relevante, comunicamos você e a ANPD nos prazos da lei, com o que aconteceu e o que
          fazer.
        </p>
      </PolicySection>

      <PolicySection title="7. Cookies">
        <p>
          Usamos o mínimo: sessão, proteção contra CSRF, e um identificador aleatório para o carrinho e
          as recomendações de quem não tem conta. Nenhum cookie de publicidade ou de rastreamento entre
          sites. Detalhes na <Link href="/politicas/cookies" className="link">política de cookies</Link>.
        </p>
      </PolicySection>

      <PolicySection title="8. Crianças">
        <p>
          A plataforma não é destinada a menores de 16 anos. Se soubermos de uma conta nessa situação,
          ela é encerrada e os dados apagados.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
