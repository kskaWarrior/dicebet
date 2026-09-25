import type { EstadoJogoResponsavel, Limites } from "../shared/jogo-responsavel.js";

/**
 * Estado de jogo responsável do jogador logado (`GET /responsible-gaming`), compartilhado
 * entre a casca (relógio de sessão, gate 18+) e as páginas de limites/autoexclusão.
 */
export function useJogoResponsavel() {
  const api = useApi();
  const auth = useAuth();
  const estado = useState<EstadoJogoResponsavel | null>("jogo-responsavel", () => null);

  async function logado(): Promise<boolean> {
    const { data } = await auth.getSession();
    return !!data.session;
  }

  async function carregar(): Promise<EstadoJogoResponsavel | null> {
    if (!(await logado())) return null;
    estado.value = await api<EstadoJogoResponsavel>("/responsible-gaming");
    return estado.value;
  }

  async function salvarLimites(limites: Limites): Promise<void> {
    await api("/responsible-gaming/limits", { method: "PUT", body: limites });
    await carregar();
  }

  async function autoexcluir(days: number): Promise<string> {
    const { selfExcludedUntil } = await api<{ selfExcludedUntil: string }>("/responsible-gaming/self-exclude", {
      method: "POST",
      body: { days },
    });
    await carregar();
    return selfExcludedUntil;
  }

  return { estado, carregar, salvarLimites, autoexcluir, logado };
}

// Gate 18+ na casca (app.vue). A declaração vale no dispositivo (localStorage, para o
// gate não piscar a cada navegação) e é GRAVADA NA CONTA no servidor
// (`POST /responsible-gaming/age-attestation` -> `profiles.age_attested_at`, que guarda a
// primeira). Uma conta já atestada libera qualquer dispositivo; um dispositivo atestado
// antes de haver registro no servidor sobe a declaração no primeiro carregamento logado.
const STORAGE_KEY = "age-gate-attested";

export function useAgeGate() {
  const attested = useState<boolean>(STORAGE_KEY, () => false);
  const api = useApi();
  const { carregar, logado } = useJogoResponsavel();

  function lerLocal(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function gravarLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* armazenamento indisponível: vale só nesta aba */
    }
  }

  async function registrarNoServidor() {
    if (!(await logado())) return;
    try {
      await api("/responsible-gaming/age-attestation", { method: "POST" });
    } catch {
      /* tenta de novo no próximo carregamento (o dispositivo já está atestado) */
    }
  }

  async function init() {
    const local = lerLocal();
    if (local) attested.value = true;
    try {
      const estado = await carregar();
      if (!estado) return;
      if (estado.ageAttestedAt) {
        attested.value = true;
        gravarLocal();
      } else if (local) {
        await registrarNoServidor();
      }
    } catch {
      /* sem API: fica o que o dispositivo sabe */
    }
  }

  async function confirm() {
    attested.value = true;
    gravarLocal();
    await registrarNoServidor();
  }

  return { attested, init, confirm };
}
