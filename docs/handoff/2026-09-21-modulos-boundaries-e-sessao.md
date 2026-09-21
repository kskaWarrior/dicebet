# Handoff — módulos/boundaries e `POST /sessions` (E13)

Branch: `e13-sessao-dicebet`. Sem merge, sem push.

## O que mudou

1. **Migração completa para `modules/` + `eslint-plugin-boundaries`**, no molde de
   plinkofly/roletafly (`eslint.config.mjs`): domain/model → domain/usecase → repository
   → di → route, imposta por lint, não só por convenção.
   - `modules/aposta-dice/` — o que era `src/routes/bets.ts` + `src/routes/seeds.ts` +
     `src/dice.ts` + parte de `src/seeds.ts`. `dice.ts` virou
     `domain/usecase/calcular-resultado.usecase.ts` (regra do jogo: `multiplierFor`/
     `payoutFor`); as consultas de `src/seeds.ts` viraram `repository/seed.repository.ts`;
     a saga inteira de `settleBetSaga` (débito → `settle_bet` → crédito, rodada grátis)
     virou `repository/aposta.repository.ts`, **sem mudar uma linha da lógica** — só o
     lugar. `domain/usecase/apostar.usecase.ts` orquestra (seed → nonce → roll → payout →
     delega a liquidação ao repositório).
   - `modules/carteira/` — o que era `src/routes/wallet.ts`.
   - `modules/sessao/` — novo (ver abaixo).
   - `src/shared/` — `db.ts`, `auth.ts`, `env.ts`, `fair.ts` (a parte provably-fair de
     `src/fair.ts`; a parte de payout do jogo foi para o usecase acima).
   - `src/app.ts` (`criarApp()`, sem `.listen()`) + `src/index.ts` reduzido a
     `criarApp().listen(...)` — permite testar a API numa porta efêmera.

2. **`POST /sessions`** (`modules/sessao/`, exceção de forma: só `di.ts` + `route/`, sem
   domain/repository — a lógica real é do `@kskawarrior/rgs-core`
   `criarAbrirSessao`/`carregarCarteiras`). Aditivo: nada além desta rota nova depende
   dela.

3. **`@kskawarrior/rgs-core` `^0.9.0` → `^0.10.0`.** Diff do pacote (`git diff v0.9.0
   v0.10.0 -- packages/rgs-core/src`) é só aditivo para o que o dicebet usa: um novo
   `export * from "./sessao/protocolo.js"` em `index.ts` (de onde vem `AbrirSessaoRequest`)
   e mudanças internas em `carteira/operador-falso.ts` (não usado aqui). Nenhuma quebra
   nas importações existentes (`criarExecutarRodadaNoJogo`, `OPERADOR_DEMO_ID`,
   `criarDbTransacional`, `rateLimit`, `securityHeaders`, etc.).

4. Testes movidos para acompanhar os arquivos (imports atualizados, nenhuma asserção
   mudou): `tests/auth.integration.test.ts`, `tests/replay-dados.integration.test.ts`,
   `tests/rodada-gratis.integration.test.ts`, `tests/helpers/db-teste.ts`. `fair.test.ts`
   foi dividido: a parte provably-fair foi para `shared/fair.test.ts`, a parte de payout
   para `modules/aposta-dice/domain/usecase/calcular-resultado.usecase.test.ts` — mesmos
   casos, sem mudança de asserção. Novo `tests/sessao.integration.test.ts` cobre
   `POST /sessions` (corpo inválido, operador demo recusado, `abrirSessao` contra um
   operador sem `rgs.operator_configs`).

## Decisões e desvios do molde de plinkofly/roletafly

- **Nenhuma migração de auth.** As rotas existentes (`/bets`, `/seeds`, `/wallet`)
  continuam em `requireAuth`/GoTrue (`shared/auth.ts`, inalterado). `requireSessao` (token
  de sessão do RGS) **não existe** neste repo — decisão explícita desta rodada, não
  esquecimento. `POST /sessions` é puramente aditivo.
- **`POST /sessions/demo` não foi implementado.** O molde de plinkofly/roletafly tem essa
  rota (login GoTrue trocado direto por sessão, via `requireLoginDemo`). O dicebet não
  tem, hoje, um conceito de "login demo" separado de `requireAuth` — a demo sempre bateu o
  Bearer token do GoTrue direto nas rotas de jogo, sem um passo intermediário de "abrir
  sessão". Inventar esse fluxo agora seria migração de auth, fora do escopo combinado. Ver
  comentário em `modules/sessao/route/sessao.route.ts`.
- **Repositório de `aposta-dice` recebe `db`/`DbTransacional` por parâmetro em cada
  chamada** (`settleBetSaga(db, userId, ...)`, `freeRoundsAtivas(db, userId)`), em vez do
  molde `createXRepository(db: Db)` de plinkofly (fábrica pré-ligada a um `db` já dentro de
  `comOperador`). Motivo: `tests/helpers/db-teste.ts` e `tests/grants.integration.test.ts`
  precisam chamar a MESMA saga com um `db` alternativo (o role restrito `dicebet_api`, para
  provar que os GRANTs bastam) — uma fábrica pré-ligada ao `db` singleton do módulo não
  permitiria isso sem duplicar a saga no teste. Continua respeitando a regra de boundaries
  ("repositório nunca importa o pool/`db` diretamente, só recebe por parâmetro") — só que o
  parâmetro é passado em cada chamada, não uma vez na fábrica. Para o usecase (`apostar.usecase.ts`,
  que roda só pelo caminho da API), o repositório expõe também `createApostaRepository(db)`
  no molde de fábrica, usado pelo `di.ts`.
- **Sem abstração `Jogador { operatorId, playerRef }`.** dicebet ainda está na "etapa 1" do
  rollout RGS (comentário original de `src/db.ts`: "a etapa 1 não tem sessão do RGS
  ainda") — só o operador demo existe para as rotas de jogo, hardcoded como
  `OPERADOR_DEMO_ID` no repositório, como já era antes da migração. `userId: string`
  continua sendo a identidade em todo o resto do código (não é a mesma coisa que a
  identidade multi-operador de `POST /sessions`, que é nova e paralela).
- **`RGS_SESSION_SECRET` não é obrigatório** (`shared/env.ts`, default `""`) — diferente de
  plinkofly/roletafly, onde é `required(...)`. Torná-lo obrigatório quebraria qualquer
  ambiente que só use as rotas antigas (dev local sem a env var, ambientes de teste
  unitário). Produção que for expor `/sessions` de verdade precisa configurá-lo — está
  documentado em `.env.example`.

## Verificação

- `npm run typecheck` — passa.
- `npm run lint` (novo script, `eslint .`) — passa, incluindo `boundaries/dependencies`.
- `npm test` (suíte unitária, sem banco) — 9/9 passam.
- `npm run test:integration` — **não executado nesta sessão**: não há Postgres do
  `docker-compose` do repo `rgs` acessível no sandbox (porta 57332 não respondia). As
  suítes de integração foram atualizadas para os novos caminhos de import e devem ser
  rodadas contra um Postgres real antes do merge (`scripts/local-up.sh` + `npm run
  db:migrate` do README).

## Pendências para quem retomar

1. Rodar `npm run test:integration` contra um Postgres real e confirmar que nada quebrou
   na migração de caminhos (o código das rotas/sagas não mudou, só o arquivo).
2. Se/quando `/sessions` for exposto de verdade, cadastrar um operador em
   `rgs.operator_configs` para `game = 'dicebet'` (ver `rgs-api`) e definir
   `RGS_SESSION_SECRET` no ambiente.
3. `POST /sessions/demo` fica para quando (se) a demo migrar para o token de sessão do RGS
   — hoje é decisão consciente de não fazer, não uma lacuna.

## Adendo (2026-09-21): fábrica de `aposta-dice` estava pela metade

Um code review encontrou a fábrica de repositório de `aposta-dice` inconsistente: a
migração para `db por parâmetro` (ponto acima) tinha ficado documentada só no nível
"por que a saga toda recebe `db`", mas dentro disso o `di.ts` acabou com dois caminhos de
acesso diferentes para a mesma dependência — `placeBet` passava por
`createApostaRepository(db).placeBet(...)`, enquanto `freeRoundsAtivas`/`listarApostas`
eram chamadas soltas (`freeRoundsAtivasRepo(db, userId)`), e em `seed.repository.ts` o
`di.ts` recriava `createSeedRepository(db)` a cada chamada de `seedAtual` e chamava
`rotateSeed`/`seedsRevelados` direto, sem sequer passar pela fábrica.

Comparei com `plinkofly`'s `modules/aposta-plinko/` (repositório irmão mais próximo com o
mesmo problema — `db`/transação por chamada em vez de fábrica única no módulo): lá
`createApostaRepository`/`createSeedRepository` sempre devolvem **todos** os métodos do
contrato (`placeBet`, `history`, `freeRoundsAtivas`; `getOrCreateActiveSeed`, `rotateSeed`,
`claimNonce`), e o `di.ts` só chama através desse objeto — nunca mistura com função solta.

Apliquei a mesma forma em `aposta-dice`, mantendo a restrição real (GRANTs): as funções
`settleBetSaga`, `freeRoundsAtivas`, `listarApostas` (`aposta.repository.ts`) e
`getOrCreateActiveSeed`, `claimNonce`, `rotateSeed`, `seedsRevelados`
(`seed.repository.ts`) continuam exportadas soltas, recebendo `db`/`DbTransacional` por
parâmetro — é o que `tests/helpers/db-teste.ts` usa para chamar `settleBetSaga` com o role
restrito `dicebet_api` em `tests/grants.integration.test.ts`. O que mudou:

- `ApostaRepository` ganhou `freeRoundsAtivas`/`listarApostas`; `createApostaRepository(db)`
  agora devolve os três métodos ligados ao mesmo `db`.
- `SeedRepository` ganhou `rotateSeed`/`seedsRevelados`; `createSeedRepository(db)` agora
  devolve os quatro métodos ligados ao mesmo `db`.
- `di.ts` constrói `seedRepository`/`apostaRepository` uma vez (no carregamento do módulo,
  como já era para o usecase) e todo membro de `apostaDiceDi` chama através desses dois
  objetos — nenhum acesso solto restante.

Resultado: um único formato de acesso ao repositório dentro do módulo (fábrica ligada ao
`db`, todos os métodos do contrato por ela), com a exceção documentada permanecendo só nas
funções soltas que os testes de GRANTs precisam — não mais uma mistura silenciosa dentro do
próprio `di.ts`. `npm run typecheck`, `npm run lint` e `npm test` passam; `npm run
test:integration -w apps/api` também passa (7 arquivos, 34 testes), incluindo
`tests/grants.integration.test.ts`.
