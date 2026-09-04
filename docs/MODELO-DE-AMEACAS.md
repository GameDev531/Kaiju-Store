# KAIJU — Modelo de ameaças

> "Seguro" não é uma propriedade absoluta e este documento não afirma que o
> sistema é seguro. Ele lista o que foi considerado, o que foi mitigado, e o
> **risco que permanece**.

---

## Ativos

| Ativo | Por que importa | Impacto se comprometido |
|---|---|---|
| Contas de cliente | Medidas, endereço, histórico | Alto — dado corporal e residencial |
| Medidas corporais | Íntimo, ainda que não "sensível" na LGPD | Alto |
| Imagens de referência | Podem conter pessoas, casa, contexto pessoal | Alto |
| Fluxo de pagamento | Dinheiro real | Crítico |
| Repasse a ateliês | Dinheiro saindo | Crítico |
| Contas de ateliê | Acesso a dados de clientes | Alto |
| Contas administrativas | Acesso a tudo | Crítico |
| Prompt e lógica de matching | Vantagem competitiva; gaming | Médio |
| Estoque de campanha | Fraude econômica | Médio |
| Quadro de vagas | Vetor de golpe contra quem procura trabalho | Alto |

## Atores

Anônimo · Cliente autenticado · Ateliê · Criador · Contratante · Moderador ·
Suporte · Financeiro · Admin · Super-admin · Provedor de pagamento ·
Transportadora · Provedor de IA · Serviço interno.

---

## Ameaças e mitigações

### CRÍTICO

**C1 — Falsificação de webhook de pagamento**
Entrada: `/api/webhooks/payments`, público por necessidade.
Impacto: pedido marcado pago sem dinheiro; produção e envio gratuitos.
Mitigação: HMAC-SHA256 sobre o corpo cru, comparação em tempo constante; janela
de 5 min; `(provider, externalId)` único; valor divergente do registrado gera
sinal de fraude e retém o pedido em vez de conciliar em silêncio.
Testes: corpo adulterado com assinatura válida do original; réplica na borda da
janela; reuso de assinatura entre integrações.
**Risco residual:** comprometimento do segredo do provedor. Mitigado por rotação
e por segregação de segredo por integração. Não detectável só pelo código.

**C2 — Manipulação de preço no cliente**
Entrada: qualquer formulário de checkout.
Impacto: peça a preço arbitrário.
Mitigação: o cliente envia **apenas ids e quantidade**. Preço, desconto, frete e
total são recomputados no servidor a partir do banco. Orçamento fixado a um hash
de ficha; ficha alterada invalida o orçamento.
**Risco residual:** desvio da tabela de preços durante um orçamento vivo. O
sistema honra o preço armazenado e registra a divergência.

**C3 — Escalonamento de privilégio**
Impacto: comprometimento total.
Mitigação: papéis nunca lidos da entrada; cadastro sempre produz `CUSTOMER`;
concessão de papel é exclusiva de `SUPER_ADMIN`, exige MFA recente e é auditada;
staff sem MFA não obtém sessão privilegiada.
**Risco residual:** super-admin malicioso. Contido apenas por auditoria e
separação de funções — não por controle técnico. Aceito conscientemente.

**C4 — Injeção de prompt que aciona ação real**
Entrada: texto e imagem do cliente.
Impacto: se a IA controlasse ações — reembolso, atribuição, papéis.
Mitigação estrutural: **o modelo não tem ferramenta nenhuma.** Sua saída é um
JSON validado contra schema. Não existe caminho da resposta do modelo a uma ação.
Guardrails detectam e registram; isolamento de delimitadores impede forjar
marcadores.
**Risco residual:** conteúdo malicioso influenciar o *texto* da ficha. Contido
porque o cliente lê e aprova cada linha antes da produção.

### ALTO

**A1 — IDOR / BOLA entre clientes ou entre ateliês**
Mitigação: propriedade filtrada na consulta, não verificada depois. Toda função
de produção recebe `producerId` derivado da sessão.
Testes de integração cobrem leitura cruzada em pedido e em trabalho.
**Risco residual:** uma consulta futura escrita sem o filtro. Mitigado por
convenção documentada e pelos testes que falhariam.

**A2 — Upload malicioso**
Mitigação: magic bytes, limite de pixels, varredura de conteúdo ativo,
chave UUID, armazenamento privado, URL assinada curta, `sandbox` + `nosniff`.
**Risco residual documentado:** um payload além dos 2 KB iniciais não é detectado
na validação. A contenção real é no serviço — bytes enviados não executam nesta
origem. Há teste que fixa esse limite explicitamente.

**A3 — Golpe de recrutamento no quadro de vagas**
Impacto sobre a parte mais vulnerável: quem procura trabalho.
Mitigação: publicar exige CNPJ e documento analisado por pessoa; vaga só fica
visível após aprovação; a página avisa explicitamente para nunca pagar nada.
**Risco residual:** empresa legítima aprovada agindo de má-fé depois. Mitigado
por denúncia na vaga e por contagem de strikes.

**A4 — Vazamento de dado de cliente para ateliê**
Mitigação: a consulta de trabalho seleciona ficha, referências e medidas.
Nome, e-mail, telefone e endereço não são projetados. Teste de integração
verifica ausência de identificadores no payload.

**A5 — Tomada de conta**
Mitigação: scrypt, bloqueio após 8 falhas, rate limit por IP, mensagem de falha
uniforme (não enumera contas), TOTP, revogação global na troca de senha,
sessão morta quando o secret não bate.
**Risco residual:** phishing. Mitigado por comunicação ("nunca pedimos senha") e
por MFA, não eliminado.

**A6 — Farm de recompensa**
Vetor: comprar 3, receber a miniatura, devolver tudo.
Mitigação: só pedido **entregue** conta, e só após a janela de arrependimento;
pedido reembolsado ou em disputa não conta; grant revoga com devolução de
inventário e sinal de fraude; unicidade `(campanha, pedido)` sobrevive a corrida.

### MÉDIO

**M1 — Abuso de cupom** — limite por conta e global, mínimo de valor, janela de
validade, tudo verificado no servidor. *Residual:* múltiplas contas — mitigado
por rate limit de cadastro e sinal de fraude, não eliminado.

**M2 — Corrida no checkout do último item** — reserva por `updateMany`
condicional dentro da transação. Exatamente um vencedor.

**M3 — Corrida na aceitação de trabalho** — mesmo padrão. Testado.

**M4 — Replay de evento de transportadora** — `(shipmentId, externalId)` único.
Testado com reenvio de histórico completo.

**M5 — Gaming do matching** — pesos server-side, nunca expostos ao ateliê;
explicação do score só para admin.

**M6 — CSRF** — token HMAC ligado à ação específica mais checagem de origem.
Token emitido para uma ação não vale em outra.

**M7 — XSS** — React escapa por padrão; `dangerouslySetInnerHTML` só com JSON-LD
serializado a partir de estrutura própria; CSP sem `unsafe-inline` para script em
produção.

**M8 — SSRF** — a aplicação não busca URL fornecida por usuário. O único destino
externo é o provedor de IA, com host fixo.

**M9 — Enumeração** — referência de pedido não sequencial e sem `0/O/1/I`;
rastreio público não expõe dado pessoal; 404 único para arquivo inexistente,
não autorizado e link expirado.

### BAIXO

**B1 — Exaustão por hash** — parâmetros absurdos de scrypt em hash armazenado são
rejeitados antes de derivar.

**B2 — Vazamento por log** — denylist por nome de chave, aplicada recursivamente
antes de serializar; stack só fora de produção.

**B3 — Fila entupida** — backoff exponencial, teto de tentativas, itens mortos
visíveis no painel de saúde, reclaim de trabalho órfão.

---

## Lacunas conhecidas

Explicitamente **não** implementado, e por quê:

1. **Antivírus real.** O scan revalida bytes; não há motor de assinatura.
   *Antes de produção:* integrar ClamAV ou serviço equivalente.
2. **Rate limit distribuído em Redis.** A implementação em banco é correta mas
   custa uma escrita por requisição protegida.
3. **CSP com nonce.** Produção usa `script-src 'self'`. Nonce por requisição
   exigiria middleware reescrevendo o documento.
4. **Detecção de anomalia de login.** `FraudSignal` existe; não há scoring por
   geografia ou dispositivo.
5. **Criptografia em repouso no nível de campo.** Medidas e endereços dependem da
   criptografia de disco do provedor, não de envelope por campo.
6. **Verificação de identidade automatizada.** Ateliê e contratante passam por
   análise humana. Correto para o volume atual; não escala.
7. **Testes E2E de navegador.** A suíte cobre domínio e integração; não há
   Playwright cobrindo o fluxo completo pela interface.

---

## Postura de resposta

Log de segurança em canal próprio (`securityEvent`) para: falha e bloqueio de
login, negação de autorização, rejeição de CSRF, bloqueio por rate limit,
rejeição de upload, disparo de guardrail, assinatura de webhook inválida, réplica
bloqueada, sinal de fraude, ação administrativa sensível, decisão de moderação.

Trilha de auditoria imutável para toda mudança de estado sensível, com quem, o
quê, quando, alvo, estado anterior, novo estado e motivo.

Em incidente com risco relevante: comunicação ao titular e à ANPD nos prazos
legais, com o que aconteceu e o que fazer.
