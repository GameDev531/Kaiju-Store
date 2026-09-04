# KAIJU

**Ateliê digital de moda sob medida** — ecossistema de moda, fabricação sob
demanda e economia de criadores para o público de anime, geek e streetwear.

> Achou a peça perfeita na sua cabeça? Agora faça ela existir.

```
O CLIENTE IMAGINA → A IA TRADUZ → O CLIENTE APROVA
→ O ARTESÃO CONSTRÓI → A PLATAFORMA ORQUESTRA → O CLIENTE RECEBE
```

---

## O que é

Quatro produtos que se sustentam mutuamente:

1. **Loja** — peças originais do estúdio, pronta-entrega e sob encomenda.
2. **Ateliê sob medida** — você envia referências, recebe uma ficha técnica com a
   incerteza declarada, edita, aprova, e um ateliê verificado produz.
3. **Marketplace de produção** — costureiros e modelistas recebem trabalho com
   ficha pronta, medidas conferidas e valor acordado antes do aceite.
4. **Ecossistema** — lojas de criador, programa de revenda, quadro de vagas com
   empresa verificada, e ferramentas por assinatura.

O diferencial não é "usar IA". É **como** ela é usada: cada campo da ficha vem
etiquetado como Observado, Deduzido, Incerto ou Sugerido, e nada chega à mesa de
corte sem o cliente aprovar linha por linha.

---

## Rodando localmente

```bash
npm install
cp .env.example .env

# Gere um AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# e cole no .env

npm run db:push      # cria o schema
npm run db:seed      # catálogo, campanha, planos e contas de desenvolvimento
npm run dev          # http://localhost:3000
npm run worker       # em outro terminal: processa a fila
```

**Nenhuma credencial de IA é necessária.** Com `AI_PROVIDER=heuristic` (o padrão)
o analisador determinístico local roda o fluxo inteiro. Para usar visão real,
defina `AI_PROVIDER=anthropic` e `ANTHROPIC_API_KEY`.

### Contas de desenvolvimento

Criadas pelo seed, marcadas como demo, sem nenhum dado fictício de cliente real:

| E-mail | Papel |
|---|---|
| `admin@kaiju.local` | ADMIN + SUPER_ADMIN |
| `cliente@kaiju.local` | CUSTOMER, com medidas e endereço |
| `atelie.norte@kaiju.local` | PRODUCER (verificado) |

Senha para todas: `kaiju-desenvolvimento-2026`

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run worker` | Processa a fila (scan, notificações, matching, retenção) |
| `npm run build` | Build de produção |
| `npm test` | Suíte completa (194 testes) |
| `npm run typecheck` | TypeScript estrito, sem emitir |
| `npm run db:push` / `db:seed` | Schema e dados iniciais |

---

## Testes

```bash
npm test
```

194 testes, com foco no que **quebra dinheiro, privacidade ou confiança**:

| Arquivo | Cobre |
|---|---|
| `money` | Alocação sem perder centavo, taxas em pontos-base, recusa de entrada ambígua |
| `order-state` | Cada ator que **não** pode fazer uma transição, provado incapaz |
| `auth` | scrypt, normalização unicode, deriva do TOTP, separação de papéis no RBAC |
| `upload-security` | Magic bytes sobre extensão mentirosa, bomba de descompressão, traversal |
| `ai-guardrails` | Injeção neutralizada sem bloquear o cliente, IP sinalizado sem recusa automática |
| `webhook-security` | Corpo adulterado com assinatura válida, janela de replay, reuso entre integrações |
| `pricing-recommender` | Determinismo do orçamento, mapeamento de busca para facetas |
| `integration` | Isolamento entre clientes e ateliês, corridas, idempotência, farm de recompensa |

Três defeitos reais foram encontrados por esses testes e corrigidos, não
contornados — estão no histórico de commits.

---

## Documentação

- [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md) — domínios, modelo de dados,
  máquina de estados, fronteira de IA, matching, recomendação, **e o que ainda
  não está implementado**
- [`docs/MODELO-DE-AMEACAS.md`](./docs/MODELO-DE-AMEACAS.md) — ativos, ameaças
  por severidade, mitigações, **risco residual e lacunas conhecidas**

---

## Decisões que valem explicação

**Dinheiro nunca é ponto flutuante.** Não existe tipo neste código capaz de
guardar `19.99` — só `1999` e `"BRL"`. Taxas são pontos-base.

**Estado de pedido é projeção de um log append-only.** Nenhum caminho de código
escreve `status` diretamente.

**Versão de ficha aprovada é imutável e assinada.** Editar cria a versão n+1.
A produção é fixada a uma versão específica; o controle de qualidade compara
contra ela. "A peça veio diferente do que aprovei" tem resposta objetiva.

**A IA não tem ferramentas.** Sua superfície inteira de saída é um JSON validado
por schema. Não há caminho da resposta do modelo a uma ação real.

**O produto funciona sem IA.** O analisador determinístico é o piso honesto,
não um stub — quando o modelo cai, o cliente ainda recebe uma ficha estruturada,
claramente marcada como leitura reduzida.

**Nenhum dado social fictício.** Sem avaliação falsa, sem contador de clientes,
sem selo inventado. Onde não há avaliação, a interface diz que não há e explica
por quê. `aggregateRating` no schema.org só é emitido com avaliação real.

**Sem webfont de terceiro.** A CSP não abre para CDN externo, e a marca não
entrega o IP de cada visitante por causa de uma fonte.

**`APP_ENV` separa implantação de build.** `next build` sempre define
`NODE_ENV=production`; guardas duras (sem segredo placeholder, sem gateway
simulado, sem rate limit desligado) disparam por `APP_ENV`, não por build.

---

## Antes de produção

Ver a seção "Lacunas conhecidas" no modelo de ameaças. Em resumo: conectar
gateway de pagamento real, provedor de e-mail, API de transportadora e motor
de antivírus; migrar para PostgreSQL; mover rate limiting para Redis.

E registrar a marca — nada neste repositório afirma que "KAIJU" foi liberado
nas classes e jurisdições relevantes.

---

## Licença

**Proprietário.** Todos os direitos reservados. Ver [`LICENSE`](./LICENSE).

O front-end, as APIs, o motor de design, os prompts internos, o algoritmo de
matching, o marketplace, as lojas de criador, o sistema de produção, o design
system e os personagens e esculturas originais são proprietários e confidenciais.

Um SDK público, se e quando existir, será licenciado sob Apache-2.0 em
repositório separado.
