---
status: accepted
---

# DiceBet adota a plataforma RGS — carteira transacional (ADR-0002)

## Contexto

O ADR-0001 já apontava o próximo passo: "a plataforma RGS... substitui `ensure_player`,
`wallets`/`transactions` e o GoTrue por jogo". O plano da plataforma já rodou no
roletafly (piloto), plinkofly, luckytiger e minefly — o DiceBet é o quinto da fila
(roletafly → plinkofly → luckytiger → minefly → dicebet → crashfly).

DiceBet é uma liquidação **atômica de requisição única**: `place_bet` debitava e pagava
no mesmo RPC, como roletafly/plinkofly/luckytiger — não precisa do split
débito/crédito em duas fases que o MineFly precisou (`minefly/docs/adr/0002-carteira-de-duas-fases-na-plataforma-rgs.md`).
O molde mais próximo é o do LuckyTiger (`luckytiger/docs/adr/0009-adota-plataforma-rgs.md`
+ `luckytiger/db/migrations/20260914000001_carteira_no_rgs.sql`), a etapa 1 mais recente
com liquidação atômica.

## Decisão

1. **Banco único, schema `dicebet`**: `wallets`, `transactions` e a RPC `place_bet` saem;
   a carteira do jogador da demo é `rgs.demo_wallets` + `rgs.ledger`, movida pela saga
   (débito → liquidação → crédito) do `@kskawarrior/rgs-core` (`criarExecutarRodadaNoJogo`,
   0.7.0 — desde o início, não a saga montada à mão que o roletafly/plinkofly/luckytiger
   usaram na própria etapa 1 e trocaram depois por um defeito real de rastro de
   `rgs.wallet_ops` perdido em rollback). `place_bet` vira `validate_bet` (sem efeitos,
   chamada ANTES do débito) + `settle_bet` (guarda de replay + registro da aposta — sem
   lock de carteira, sem ledger). Na MESMA migração: schema `public` → `dicebet`
   (namespacing, como os irmãos).
2. **Sem responsabilidade de jogo (RG) nova**: o DiceBet nunca teve `player_limits`,
   autoexclusão ou limites diários — o handoff de 2026-09-14 (Fases M-A/M-B) já cortou
   esse escopo deliberadamente ("só o que o RGS não vai refazer"). O LuckyTiger manteve
   `player_limits` porque já os tinha desde antes do rollout; inventar RG agora seria
   escopo novo, não um delta desta migração. Se a plataforma exigir RG por jogo mais
   adiante, é outra sessão — registrado aqui para não se perder.
3. **`bets` ganha `seed_id` e `unique (seed_id, nonce)`**: o desenho anterior não tinha
   guarda de replay no banco, só o incremento em série de `use_next_nonce`. Agora
   `NONCE_ALREADY_USED` dispara um passo antes de a saga esbarrar no `unique` de
   `rgs.wallet_ops`, no molde de `luckytiger.spins`/`plinko.plinko_bets`/`roleta.roleta_giros`.
4. **Nonce reivindicado fora da transação de liquidação** (emenda de 2026-09-14 do rgs
   ADR-0003): `claimNonce` roda numa consulta própria antes da saga — um rollback da
   saga não pode devolver o nonce, senão a próxima tentativa repetiria o `roundId`
   (`seed:nonce`) que `rgs.wallet_ops` já usou.
5. **Stripe sai, `apply_refill` entra**: nenhum jogo irmão manteve um processador de
   pagamento real depois de adotar a carteira da plataforma — o saldo é sempre fictício,
   do operador `demo` (`rgs.demo_wallets`), e a regra de recarga (só perto de zero) é do
   próprio operador (`rgs.demo_refill`), não do jogo. O DiceBet era o único irmão com
   Stripe Checkout (`/deposits`, `/stripe/webhook`, test mode apenas, sem dinheiro real
   mesmo antes) — mantê-lo criaria um caminho de dinheiro fora da carteira da plataforma,
   contra o próprio ADR-0003 do rgs (toda movimentação passa pela saga ou pelas funções
   `demo_*`). As duas rotas saem; `POST /wallet/refill` chama `dicebet.apply_refill`
   (embrulha `rgs.demo_refill`), no molde exato de `luckytiger.apply_refill` +
   `POST /wallet/refill`. `stripe` sai de `apps/api/package.json`;
   `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`CHECKOUT_RETURN_URL` saem de `env.ts`,
   `.env.example` e `docker-compose.yml`. O web troca os três botões de valor fixo
   (+$5/+$20/+$100, que chamavam o Stripe Checkout) por um único botão de recarga.
6. **Moeda `USD`**: os irmãos (BRL) usam `char(3) = 'BRL'`; o DiceBet sempre mostrou
   dólares ("$10,00 de boas-vindas") — a carteira demo usa `'USD'` em vez de copiar o
   valor dos irmãos, para não trocar a moeda que o jogador já via.
7. **Arquitetura continua flat** (ADR-0001 deste repo, roletafly ADR-0010): este rollout
   não adota `domain/usecase/repository/di`. `db.ts` ganha `criarDbTransacional`/`comOperador`
   do PACOTE `@kskawarrior/rgs-core`, não uma cópia local — a plataforma precisa da mesma
   semântica de `app.operator_id` (RLS falha fechada sem ele), e duas cópias divergiriam
   justo no detalhe que importa. `settleBetSaga` (`routes/bets.ts`) é uma função
   exportada, não uma classe de repositório, para os testes de integração chamarem a
   mesma orquestração que a API usa em vez de reimplementá-la
   (`tests/helpers/db-teste.ts#placeBet`).
8. **Compose e CI**: Postgres/GoTrue próprios saem; o jogo sobe sobre o compose do repo
   `rgs` (`scripts/local-up.sh`, portas 57332/57331), como os irmãos. CI autentica no
   GitHub Packages (`GH_PACKAGES_TOKEN`, já configurado no repo, mesma prática do
   roletafly/plinkofly/luckytiger) para instalar `@kskawarrior/rgs-core` (privado).
9. **Dockerfiles com o segredo `npmrc` desde o início**: o rollout do MineFly
   (`minefly/docs/adr/0002-carteira-de-duas-fases-na-plataforma-rgs.md`) achou um bug
   real — os `Dockerfile`s de `apps/api`/`apps/web` faziam `npm install`/`npm ci` sem
   `--mount=type=secret,id=npmrc`, mesmo com o `docker-compose.yml` declarando o
   segredo — e só builds locais (sem cache) expunham a falta. Os `Dockerfile`s do
   DiceBet já nascem com o `--mount` (molde do LuckyTiger, que já estava correto),
   aplicado proativamente antes de o bug se repetir aqui.

## Consequências

- `demo_mover`/`demo_rollback` no grant do role `dicebet_api` são um alargamento aceito:
  quem move a carteira do demo por chamada direta agora é o adaptador do pacote, do lado
  do Node, não mais uma RPC do jogo só. O que trava um movimento forjado é a idempotência
  por `txId` + o `unique` em `rgs.wallet_ops`, não mais o grant — mesmo trade-off que o
  luckytiger/plinkofly documentaram e aceitaram.
- `balance` de `POST /bets` pode vir `null` (crédito pendente de um operador futuro sem
  carteira local) — a API já aceita; o web ainda tipa como número. Mesma lacuna aceita
  nos irmãos, não é escopo desta etapa.
- Sem processador de pagamento: o "Aviso" do README muda de "pagamentos só em Stripe
  test mode" para "moeda virtual, sem qualquer processador" — mais correto, já que o
  Stripe nunca movia dinheiro real mesmo antes.
- As portas 52321/52322 (GoTrue/Postgres próprios do DiceBet) ficam livres; o jogo passa
  a compartilhar 57331/57332 com os irmãos.
- Sem `player_limits`/autoexclusão: se um regulador ou a plataforma exigirem RG por jogo
  no DiceBet, é trabalho novo — não um retrofit escondido nesta migração.
