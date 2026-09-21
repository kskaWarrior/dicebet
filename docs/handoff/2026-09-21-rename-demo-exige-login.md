# Rename `DEMO_EXIGE_LOGIN` → `DEMO_REQUIRES_AUTH` (rgs-core 0.11.0)

O `rgs-core` foi publicado em `0.11.0` com uma única mudança: o valor
`SessaoErrorCode.DEMO_EXIGE_LOGIN` foi renomeado para `DEMO_REQUIRES_AUTH`
(motivo: evitar a palavra "login" nesse contrato — ver
`docs/handoff/2026-09-21-rename-demo-exige-login.md` no repo `rgs` para o
detalhe). Aqui bastou o bump de `@kskawarrior/rgs-core` para `^0.11.0` em
`apps/api/package.json` e reinstalar para atualizar o lockfile.

Diferente de roletafly/plinkofly, `apps/api/src/modules/sessao/route/sessao.route.ts`
não importa `SessaoErrorCode` do pacote — usa a string literal
`"DEMO_EXIGE_LOGIN"` diretamente na resposta. Renomeado manualmente para
`"DEMO_REQUIRES_AUTH"` ali e no teste de integração correspondente
(`apps/api/tests/sessao.integration.test.ts`). Typecheck, lint, testes
unitários e de integração passam. Não migrei essa rota para importar o enum
compartilhado — ficaria fora do escopo desta troca pontual.
