---
status: accepted
supersedes: ADR-0002, item 7
---

# Módulos feature-first com camadas impostas por lint (ADR-0004)

> Registrado em 2026-10-05, retroativo: a decisão foi tomada e implementada no E13 em
> 2026-09-21 ([handoff](../handoff/2026-09-21-modulos-boundaries-e-sessao.md), merge
> `a19fd2b`), mas o ADR que o código cita (`modules/sessao/di.ts`, "ADR de boundaries desta
> migração") nunca tinha sido escrito.

## Contexto

O [ADR-0002](0002-carteira-de-rgs.md), item 7, manteve a API plana (`src/routes/*.ts`,
`src/dice.ts`, `src/seeds.ts`): regra do jogo, consultas e saga da carteira misturadas nas
rotas. O E13 da plataforma (sessão de jogo do RGS, `POST /sessions`) pedia um módulo novo, e
plinkofly/roletafly já usavam o molde feature-first com `eslint-plugin-boundaries`. Manter o
dicebet plano deixaria o único irmão sem as mesmas fronteiras verificáveis.

## Decisão

1. A API é organizada por **feature**, uma pasta por feature em `apps/api/src/modules/`
   (`aposta-dice`, `carteira`, `jogo-responsavel`, `sessao`), mais `apps/api/src/shared/`
   (`db.ts`, `auth.ts`, `env.ts`, `fair.ts`).
2. Dentro de cada feature, as camadas são distinguidas por sufixo de arquivo:
   `domain/model/*.model.ts` → `domain/usecase/*.usecase.ts` → `repository/*.repository.ts`
   → `di.ts` → `route/*.route.ts`.
3. As dependências permitidas são **impostas pelo lint** (`eslint.config.mjs`,
   `boundaries`), não só por convenção:
   - `route` só importa o `di` da própria feature e `shared`;
   - `di` é o único que vê usecase e repositório juntos;
   - usecase → model e repositório da própria feature; repositório → model; model → model;
   - nenhum import entre features (a policy captura a pasta da feature de quem importa);
   - `shared` é folha: não importa camada de feature nenhuma.
4. **Exceção de forma (mesma de plinkofly/roletafly):** `sessao` tem só `di.ts` e
   `route/`, sem domain/repository próprios — a lógica real (`criarAbrirSessao`,
   `carregarCarteiras`) vive no `@kskawarrior/rgs-core`.

## Consequências

- A mudança foi só de lugar: a saga `settleBetSaga` passou a
  `modules/aposta-dice/repository/aposta.repository.ts` sem mudar a lógica, e a regra do
  jogo (`multiplierFor`/`payoutFor`) virou `domain/usecase/calcular-resultado.usecase.ts`.
- Um import fora das camadas falha no `npm run lint`, que é gate local enquanto o CI está
  desligado.
- Feature nova = pasta nova em `modules/` com as mesmas camadas; desvio de forma exige
  registrar a exceção aqui, como a de `sessao`.
