# KAIJU — Arquitetura

> Documento vivo. Descreve o que **está implementado**, e marca explicitamente o
> que ainda não está. Onde algo é uma decisão, o motivo está junto.

---

## 1. Visão do produto

Uma plataforma de moda sob demanda com quatro lados:

| Lado | Quem | O que faz aqui |
|---|---|---|
| Cliente | Fãs de anime, cosplayers, consumidores de streetwear | Compra do catálogo, ou descreve uma peça e a manda fabricar |
| Ateliê | Costureiros, modelistas, bordadeiras | Recebe ficha técnica pronta e executa |
| Criador | Influenciadores com público próprio | Vende peça própria sem operar fabricação |
| Contratante | Empresas do setor | Publica vagas, depois de comprovar que existe |

O princípio central:

```
O CLIENTE IMAGINA → A IA TRADUZ → O CLIENTE APROVA
→ O ARTESÃO CONSTRÓI → A PLATAFORMA ORQUESTRA → O CLIENTE RECEBE
```

A IA ocupa exatamente um lugar nessa cadeia: tradução. Ela não decide, não
aprova, não paga, não atribui produção.

---

## 2. Stack e por quê

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components mantêm dados sensíveis no servidor por padrão; Server Actions dão mutações sem construir uma API REST paralela |
| Linguagem | TypeScript estrito + `noUncheckedIndexedAccess` | O acesso indexado é a fonte silenciosa de `undefined` em runtime |
| Dados | Prisma + SQLite (dev) / PostgreSQL (produção) | Schema portável entre os dois; enums como String + união TS mantém a portabilidade |
| Validação | Zod em toda fronteira | Entrada de request, saída de modelo, payload de webhook, JSON do banco |
| Estilo | CSS-first com Tailwind v4 `@theme` | Tokens em CSS puro; nenhum runtime de estilo |
| Fila | Tabela no banco | Um único armazenamento durável em dev; trocar por SQS/BullMQ é reimplementar `claim`/`complete` |
| Auth | Sessões opacas próprias | JWT continua válido depois do logout; aqui é preciso matar sessão na hora |

**Sem webfont externa.** A CSP não abre para CDN de terceiro, e a marca não
entrega o IP de cada visitante a um CDN por causa de uma fonte. A distinção
tipográfica vem de tratamento — escala, tracking, versalete —, não de arquivo.

---

## 3. Domínios

```
src/server/
├── lib/          money · crypto · errors · env · logger · ratelimit
├── auth/         session · rbac · service (senha, TOTP, recuperação)
├── domain/       enums · order-state · spec · pricing · matching
│                 recommender · orders · designs · checkout
│                 production · rewards · audit
├── ai/           provider · heuristic-provider · anthropic-provider · guardrails
├── payments/     provider · mock-provider · webhook ingestion
├── shipping/     abstração de transportadora + eventos
├── storage/      validate (magic bytes) · storage privado + URL assinada
└── jobs/         queue · handlers
```

Regra de dependência: `app/` chama `domain/`; `domain/` chama `lib/`; nunca o
inverso. Nenhuma página consulta o banco para uma decisão de autorização — isso
mora na camada de domínio, junto da consulta.

---

## 4. Modelo de dados

40+ entidades. As invariantes que sustentam o resto:

**Dinheiro é inteiro de unidade menor.** Não existe tipo neste código capaz de
guardar `19.99` — só `1999` e `"BRL"`. Taxas são pontos-base. Nenhuma operação
perde ou inventa um centavo (`allocateByWeights` distribui o resto).

**Estado de pedido é projeção de log.** `Order.status` é derivado de
`OrderEvent`, que é append-only. Não existe caminho de código que escreva
`status` diretamente — tudo passa por `transitionOrder`.

**Versão de design aprovada é imutável.** Editar cria a versão n+1. A aprovação
congela e assina (`specHash`). A produção é fixada a uma versão específica, e o
controle de qualidade compara contra ela.

**Todo registro endereçável por id carrega dono explícito.** As consultas
filtram por dono na cláusula, não depois de buscar.

**Registros financeiros e de moderação são append-only.** Correção é linha nova.

---

## 5. Máquina de estados do pedido

22 estados. A tabela em `order-state.ts` é a autoridade única — quem pode fazer
o quê, a partir de onde.

```
DRAFT → QUOTED → CUSTOMER_APPROVED → PAYMENT_PENDING → PAID
      → PRODUCER_PENDING → PRODUCER_ACCEPTED
      → MATERIALS_PREPARATION → CUTTING → SEWING → FINISHING
      → QUALITY_CONTROL → READY_TO_SHIP → SHIPPED → DELIVERED → COMPLETED

Interrupções: REQUIRES_CUSTOMER_ACTION · REQUIRES_PRODUCER_ACTION
              ON_HOLD · DISPUTED
Terminais:    CANCELLED · REFUNDED · COMPLETED
```

O ator faz parte da regra: um cliente não declara o próprio pedido pago, um
ateliê não emite reembolso, só o webhook assinado (ou um admin) confirma
pagamento.

Concessões são **união**, não curto-circuito: uma regra específica de estado que
omite um ator nunca revoga um direito que a escape dá. (Um bug real: sem isso,
um cliente não conseguia contestar um pedido `COMPLETED` — exatamente quando um
defeito latente aparece.)

---

## 6. Arquitetura de IA

### A fronteira

```
Texto/imagem do cliente → guardrails → provider → validação Zod → DesignVersion (autor: AI)
                                                                          ↓
                                                          revisão e aprovação do cliente
                                                                          ↓
                                                                     produção
```

O modelo **não tem ferramentas**. Sua superfície inteira de saída é um documento
JSON que precisa satisfazer `DesignSpecificationSchema`. Saída inválida é
rejeitada, nunca coagida.

### Os quatro baldes epistêmicos

Todo campo substantivo carrega um de:

| Etiqueta | Significado |
|---|---|
| `OBSERVED` | Visível na referência, ou afirmado pelo cliente |
| `INFERRED` | Leitura provável, pode estar errada |
| `UNCERTAIN` | Não determinável — precisa de decisão humana |
| `RECOMMENDED` | Proposta do ateliê, declaradamente nossa |

O prompt de sistema instrui explicitamente que composição de tecido, gramatura,
cor calibrada, medidas e construção interna **não são determináveis por imagem**.
Afirmá-las como `OBSERVED` é erro do modelo, e o analisador determinístico —
que é o piso do produto — nunca faz isso.

### Degradação

`runAnalysis` cai para o `HeuristicProvider` quando o provedor primário falha, e
marca o resultado como `degraded`. A interface diz isso ao cliente e oferece nova
tentativa, em vez de passar uma leitura mais fraca como se fosse a completa.

**O produto funciona inteiro sem nenhuma credencial de IA.** É deliberado: uma
queda de modelo não pode virar um beco sem saída para quem já investiu esforço.

### Guardrails

`inspectUserText` faz duas coisas e recusa uma terceira. Detecta injeção,
sondagem de prompt, tentativa de acionar ferramenta, exfiltração, item proibido e
sinal de IP de terceiro. Isola estruturalmente o texto entre marcadores (que são
removidos da entrada, para não serem forjados). **Não decide nada** — bloqueio,
moderação e direitos são decisão determinística do servidor ou de uma pessoa.

Uma tentativa de injeção é registrada e neutralizada, mas **não bloqueia** a peça
do cliente: um falso positivo que bane alguém é pior que o ataque.

---

## 7. Modelo de segurança

### Fronteiras de confiança

```
Navegador ──┬─→ Server Component / Server Action ──→ domínio ──→ banco
            └─→ /api/files (assinatura + sessão + autorização por arquivo)

Provedor de pagamento ──→ /api/webhooks/payments (HMAC + janela + idempotência)
Transportadora        ──→ /api/webhooks/shipping (HMAC + janela + idempotência)
Provedor de IA        ←── só saída validada por schema
```

### Autenticação
scrypt (N=2^16) com parâmetros dentro do hash. Sessões opacas, SHA-256 no banco,
timeout por inatividade, revogação global. TOTP com step-up de 15 min para
reembolso, repasse, concessão de papel e personificação. Conta de staff sem MFA
não obtém sessão privilegiada.

### Autorização
Código pede **permissão**, nunca papel. Propriedade não está no RBAC — é checada
contra a linha, na consulta. Toda função de produção recebe o `producerId`
derivado da sessão.

### Uploads
Tipo decidido por magic bytes. Limite de pixels contra bomba de descompressão.
Chaves de armazenamento são UUID — nome de arquivo nunca vira caminho. Servido
com `default-src 'none'; sandbox` + `nosniff`, então byte enviado não executa
nesta origem, independentemente do que contenha.

### Webhooks
Assinatura sobre o corpo cru, janela de 5 minutos, `(provider, externalId)` único
— a constraint **é** a garantia de idempotência. Persiste antes de processar.

Detalhe completo: [`MODELO-DE-AMEACAS.md`](./MODELO-DE-AMEACAS.md).

---

## 8. Marketplace e matching

Filtros duros (não negociáveis por score): ativo, verificado por humano,
complexidade comportada, capacidade livre.

Score explicável, 8 componentes com peso: especialização de peça, técnicas
exigidas, folga de complexidade, qualidade histórica, pontualidade, capacidade,
nível de verificação, distribuição justa. Ateliê sem histórico fica no ponto
neutro — senão ninguém novo recebe o primeiro trabalho.

A explicação do score é gravada na oferta, visível só para admin. Publicar a
fórmula transformaria matching em exercício de gaming.

Uma peça pode virar vários trabalhos: costura + bordado + estampa + 3D.

---

## 9. Recomendação

Baseado em conteúdo sobre um vocabulário fechado de facetas, não em embeddings.
Com catálogo pequeno e poucos clientes, filtragem colaborativa produz ruído ou
loop de retroalimentação; afinidade por faceta funciona desde a primeira sessão.

Sinais pesados por tipo (compra vale 12, visualização vale 1), com meia-vida de
45 dias. Recomputado do histórico, não incrementado — senão "apagar meus dados"
seria mentira.

O perfil é legível pelo cliente e apagável em um clique. Toda recomendação
carrega o motivo.

---

## 10. Assíncrono

Fila durável no banco. Handlers seguros para rodar duas vezes — a fila garante
ao-menos-uma-vez, não exatamente-uma-vez.

| Fila | Trabalho |
|---|---|
| `malware_scan` | Reverifica bytes em disco; nada é servido antes do veredito |
| `notification` | Notificações em app |
| `webhook_effect` | Despacho para ateliês, rematch quando ofertas se esgotam |
| `reward_evaluation` | Elegibilidade de campanha; revoga se o pedido for reembolsado |
| `taste_profile` | Reconstrói afinidade |
| `retention_sweep` | Apaga arquivos vencidos, poda buckets, expira ofertas |

Worker separado: `npm run worker`.

---

## 11. O que NÃO está implementado

Honestidade sobre escopo:

| Área | Estado |
|---|---|
| Provedor de e-mail | Handler existe e registra a intenção; nenhum provedor conectado |
| Gateway de pagamento real | Só o provider `mock`; adaptadores Stripe/MercadoPago são interface a preencher |
| API de transportadora | Só o provider `manual` (tabela de zona + código inserido pela operação) |
| Derivadas de imagem | Handler é no-op explícito; sem thumbnail nem remoção de EXIF |
| Antivírus real | O scan revalida os bytes; não há motor de assinatura |
| Gerador de conceito | Interface e plano existem; geração não implementada |
| Mensageria cliente↔ateliê | Modelo de dados completo; interface não construída |
| Assinaturas | Planos e entitlements existem; cobrança recorrente não |
| Painel de disputa | Modelo e estados existem; fluxo de resolução não construído |

Cada no-op é **explícito no código**, não uma simulação que fingiria funcionar.
