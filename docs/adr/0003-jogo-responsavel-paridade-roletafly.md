---
status: accepted
supersedes: ADR-0002, item 2
---

# Jogo responsável e gate 18+ no DiceBet, em paridade com o roletafly (ADR-0003)

## Contexto

O [ADR-0002](0002-carteira-de-rgs.md), item 2, registrou como deliberado que o DiceBet
**não** teria limites do apostador, autoexclusão nem limites diários: o rollout da
carteira RGS era uma migração, não o lugar de inventar escopo novo, e o item deixava
explícito que "se a plataforma exigir RG por jogo mais adiante, é outra sessão".

Essa sessão chegou. O dossiê de certificação E14
([`docs/certificacao/04-mapeamento-normativo.md`](../certificacao/04-mapeamento-normativo.md))
marcou como **ausente**, para a Portaria SPA/MF 1.231/2024 e a Lei 14.790/2023: limites do
apostador, autoexclusão, relógio de sessão e proibição a menores. O mesmo dossiê
([`02-memorial-rtp.md`](../certificacao/02-memorial-rtp.md)) achou RTP abaixo do piso de
85 % (Portaria 1.207/2024, Art. 28) em stakes de 1 a 6 centavos. O laboratório vai ler os
dossiês da família lado a lado, e o roletafly (piloto) já cobre tudo isso desde o E1 — um
jogo da mesma plataforma sem as mesmas travas é a primeira pergunta que o dossiê não
responde.

## Decisão

Substitui o item 2 do ADR-0002. O DiceBet passa a ter o mesmo jogo responsável do
roletafly, adaptado ao código daqui e sem ir além da paridade:

1. **Aposta mínima R$ 0,50** (50 centavos) e máxima 100 000 centavos, na API (zod, com as
   constantes `MIN_STAKE_CENTS`/`MAX_STAKE_CENTS`) **e** no banco (`dicebet.validate_bet`,
   migration `20260925000001`). Com o mínimo novo, o pior RTP de qualquer alvo é 97,06 %.
2. **`dicebet.player_limits`** (migration `20260925000002`): aposta máxima, apostas
   diárias, perda diária (janela móvel de 24h sobre `dicebet.bets`) e limite de sessão
   contínua (gap de 30 min), aplicados **dentro de `settle_bet`** — o mesmo ponto em que o
   roletafly aplica os seus em `settle_roulette_spin`. A recusa (`LIMIT_EXCEEDED`,
   `SESSION_LIMIT`, `SELF_EXCLUDED`) acontece dentro da saga, que estorna o débito. A linha
   do jogador é travada (`for update`) para duas apostas simultâneas não somarem os
   diários sem se ver.
3. **Carência de 24h para afrouxar** (roletafly `20260909000008`): apertar vale na hora;
   qualquer afrouxamento — inclusive remover um limite (`null`) — é recusado com
   `LOOSENING_TOO_SOON` até 24h depois do último afrouxamento, de forma **global** entre os
   quatro limites. `limits_loosened_at` é o relógio e `dicebet.limits_loosenable_at(l)`
   entrega o prazo à API/web, que avisa antes da tentativa. Zero não é "sem limite" (a
   errata `20260909000009` do roletafly entra aqui já como `check` do schema).
4. **Autoexclusão** de 30/90/180/365 dias, com a palavra digitada na UI, **não encurtável**
   enquanto vigora (`SHORTENING_SELF_EXCLUSION`, roletafly `20260909000006`); estender é
   livre.
5. **Gate 18+ na casca do web** (`app.vue`), com a lista de rotas isentas em
   `apps/web/shared/rotas-sem-gate-maioridade.ts` (só `/login` e `/responsible-gaming`) e
   um teste que cruza as páginas reais com a regra. A atestação é gravada **no servidor**
   (`profiles.age_attested_at`, `dicebet.attest_age`, que guarda a primeira declaração).
6. **Trilha de auditoria** interna `dicebet.audit_events` (mudança de limite, dizendo se
   afrouxou; autoexclusão; atestação), no papel de `roleta.audit_events`.
7. Módulo novo `apps/api/src/modules/jogo-responsavel/` no molde feature-first já imposto
   pelo lint (`eslint-plugin-boundaries`), com as rotas em `/responsible-gaming`.

Diferenças em relação ao roletafly, todas por adaptação e não por escolha de escopo: o
jogador é `user_id` (o DiceBet ainda não tem o par `operator_id`/`player_ref` do E7), não
há limites por segmento de operador, e a página `/fairness` continua **atrás** do gate —
diferente do `/justica` do roletafly, ela também rotaciona a seed pela API.

## Consequências

- `settle_bet` ganha um `insert … on conflict do nothing` + `select … for update` por
  aposta. Custo pequeno, e é o que torna os diários corretos sob concorrência.
- Rodadas grátis passam pelos mesmos limites (como no roletafly) e pelo mesmo
  `validate_bet`: uma campanha com stake travada abaixo de 50 centavos passa a ser
  recusada.
- A atestação 18+ é registrada no servidor mas **não** é exigida por `settle_bet` —
  paridade com o roletafly, onde o gate também é da casca. Quem chamar a API direto sem
  passar pelo web não é barrado por idade; fechar isso é trabalho da plataforma (KYC).
- Continuam fora (lacunas conhecidas também no roletafly): cadastro nacional de
  autoexcluídos, autoexclusão permanente ou acima de 365 dias, KYC/CPF.
- O relógio da carência ("24 horas") está escrito por extenso em
  `apps/web/composables/useI18n.ts`; mudar o intervalo na SQL exige mudar as strings.
