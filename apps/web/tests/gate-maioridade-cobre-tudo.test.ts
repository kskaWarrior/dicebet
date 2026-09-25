import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROTAS_SEM_GATE_MAIORIDADE, exigeGateMaioridade } from "../shared/rotas-sem-gate-maioridade.js";

// O gate 18+ mora na casca (`app.vue`), o único ponto por onde toda rota passa — mesmo
// desenho do roletafly (apps/web/tests/gate-maioridade-cobre-tudo.test.ts). O teste roda
// sobre a REGRA, não sobre o texto-fonte da casca, e cruza as páginas REAIS com ela: uma
// página nova nasce coberta, e isentá-la exige dizer isso na lista.
const dirPages = join(import.meta.dirname, "..", "pages");
const rotas = readdirSync(dirPages)
  .filter((f) => f.endsWith(".vue"))
  .map((f) => (f === "index.vue" ? "/" : `/${f.replace(/\.vue$/, "")}`));

describe("gate de maioridade", () => {
  it("cobre toda página que não esteja explicitamente isenta", () => {
    expect(rotas.length, "não achei as páginas — o diretório mudou de lugar?").toBeGreaterThan(4);
    const cobertas = rotas.filter((rota) => exigeGateMaioridade(false, rota));
    expect(cobertas.sort()).toEqual(["/", "/fairness", "/history", "/limits"]);
  });

  it("atestado, nenhuma página exige o gate", () => {
    expect(rotas.filter((rota) => exigeGateMaioridade(true, rota))).toEqual([]);
  });

  // `/login`: a atestação vem depois de entrar (é gravada no servidor, na conta).
  // `/responsible-gaming`: ajuda e autoexclusão — exigir declaração de idade de quem
  // procura ajuda seria regressão; o gate barra o JOGO, não a saída dele.
  // `/fairness` NÃO é isenta, ao contrário do `/justica` do roletafly: aqui a página também
  // rotaciona a seed pela API, como o `/seeds` do roletafly, que é gateado.
  it("isenta só o login e a página de ajuda/autoexclusão", () => {
    expect([...ROTAS_SEM_GATE_MAIORIDADE].sort()).toEqual(["/login", "/responsible-gaming"]);
    for (const isenta of ROTAS_SEM_GATE_MAIORIDADE) {
      expect(exigeGateMaioridade(false, isenta), isenta).toBe(false);
    }
  });
});
