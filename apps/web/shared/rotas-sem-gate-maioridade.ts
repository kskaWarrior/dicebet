/**
 * Rotas que aparecem SEM a atestação de maioridade. Todo o resto mostra o gate no lugar
 * do conteúdo (`app.vue`). Mesmo desenho do roletafly (`shared/rotas-sem-gate-maioridade.ts`).
 *
 * `/login` está aqui porque a atestação é gravada na CONTA (servidor,
 * `profiles.age_attested_at`) e o gate vem depois de entrar — trancar a porta de entrada
 * não faria sentido.
 *
 * `/responsible-gaming` está aqui por decisão de compliance: é a página de ajuda e de
 * autoexclusão. Exigir declaração de idade de quem procura ajuda seria regressão — o gate
 * barra o JOGO, não a saída dele.
 *
 * `/fairness` NÃO está: diferente do `/justica` do roletafly (verificador local, que não
 * chama a API), a página do DiceBet também rotaciona a seed pela API.
 *
 * Mora aqui, e não dentro do `app.vue`, para um teste conseguir importar.
 */
export const ROTAS_SEM_GATE_MAIORIDADE: ReadonlySet<string> = new Set(["/login", "/responsible-gaming"]);

/** A regra que a casca aplica, separada dela para ser testada sem montar componente. */
export function exigeGateMaioridade(atestado: boolean, rota: string): boolean {
  return !atestado && !ROTAS_SEM_GATE_MAIORIDADE.has(rota);
}
