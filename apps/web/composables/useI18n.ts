export type Locale = "en" | "pt" | "es";

const messages = {
  en: {
    banner: "Demo project — virtual coins & Stripe test mode only. No real money.",
    "nav.play": "Play",
    "nav.history": "History",
    "nav.fairness": "Fairness",
    "nav.signout": "Sign out",
    "login.signin": "Sign in",
    "login.signup": "Create account",
    "login.email": "email",
    "login.password": "password (min 6 chars)",
    "login.signupBtn": "Sign up — get $10 free demo coins",
    "login.toSignup": "No account? Sign up",
    "login.toSignin": "Have an account? Sign in",
    "game.title": "Dice",
    "game.rollUnder": "Roll under {target} to win. Payout: {mult}× (1% house edge).",
    "game.winChance": "Win chance: {pct}%",
    "game.stake": "Stake ($)",
    "game.winPays": "Win pays {amount}",
    "game.roll": "Roll",
    "game.rolling": "Rolling…",
    "game.won": "Won {amount}!",
    "game.lost": "Lost",
    "game.errInsufficient": "Not enough coins — make a (test) deposit below.",
    "game.errFailed": "Bet failed, try again.",
    "game.errCheckout": "Could not start checkout.",
    "game.depositTitle": "Deposit (Stripe test mode)",
    "game.depositHint": "Use card 4242 4242 4242 4242, any future expiry, any CVC.",
    "history.title": "Bet history",
    "history.loading": "Loading…",
    "history.empty": "No bets yet — go roll some dice.",
    "history.when": "When",
    "history.stake": "Stake",
    "history.target": "Target",
    "history.roll": "Roll",
    "history.payout": "Payout",
    "fair.title": "Provably fair",
    "fair.explain":
      "Every roll is HMAC-SHA256(serverSeed, clientSeed:nonce). The server commits to sha256(serverSeed) before you bet; rotating reveals the seed so you can re-verify every past roll below — no trust required.",
    "fair.current": "Current seed pair",
    "fair.hashCommit": "Server seed hash (commitment)",
    "fair.clientSeed": "Client seed",
    "fair.nextNonce": "Next nonce",
    "fair.newSeedPh": "new client seed (optional)",
    "fair.rotate": "Rotate & reveal",
    "fair.verify": "Verify a roll",
    "fair.serverSeedPh": "revealed server seed",
    "fair.clientSeedPh": "client seed",
    "fair.noncePh": "nonce",
    "fair.compute": "Compute",
    "fair.rollLabel": "Roll:",
    "fair.hashNote1": "sha256 of that seed:",
    "fair.hashNote2": "— must match the commitment shown before your bets.",
    "fair.revealedTitle": "Revealed seeds",
    "fair.noneRevealed": "Nothing revealed yet — rotate the seed above after playing.",
    "fair.serverSeed": "Server seed",
    "fair.hash": "Hash",
    "fair.seedStats": "Client seed / bets played",
    "lang.title": "Language",
    "theme.title": "Theme",
    "theme.blue": "Blue",
    "theme.purple": "Purple",
    "theme.orange": "Orange",
  },
  pt: {
    banner: "Projeto demo — moedas virtuais e Stripe em modo de teste. Sem dinheiro real.",
    "nav.play": "Jogar",
    "nav.history": "Histórico",
    "nav.fairness": "Transparência",
    "nav.signout": "Sair",
    "login.signin": "Entrar",
    "login.signup": "Criar conta",
    "login.email": "e-mail",
    "login.password": "senha (mín. 6 caracteres)",
    "login.signupBtn": "Cadastre-se — ganhe $10 em moedas demo",
    "login.toSignup": "Não tem conta? Cadastre-se",
    "login.toSignin": "Já tem conta? Entrar",
    "game.title": "Dados",
    "game.rollUnder": "Tire menos de {target} para ganhar. Prêmio: {mult}× (1% de vantagem da casa).",
    "game.winChance": "Chance de vitória: {pct}%",
    "game.stake": "Aposta ($)",
    "game.winPays": "Vitória paga {amount}",
    "game.roll": "Rolar",
    "game.rolling": "Rolando…",
    "game.won": "Ganhou {amount}!",
    "game.lost": "Perdeu",
    "game.errInsufficient": "Moedas insuficientes — faça um depósito (teste) abaixo.",
    "game.errFailed": "A aposta falhou, tente novamente.",
    "game.errCheckout": "Não foi possível iniciar o pagamento.",
    "game.depositTitle": "Depósito (Stripe modo teste)",
    "game.depositHint": "Use o cartão 4242 4242 4242 4242, qualquer validade futura, qualquer CVC.",
    "history.title": "Histórico de apostas",
    "history.loading": "Carregando…",
    "history.empty": "Nenhuma aposta ainda — vá rolar os dados.",
    "history.when": "Quando",
    "history.stake": "Aposta",
    "history.target": "Alvo",
    "history.roll": "Resultado",
    "history.payout": "Prêmio",
    "fair.title": "Comprovadamente justo",
    "fair.explain":
      "Cada rolagem é HMAC-SHA256(serverSeed, clientSeed:nonce). O servidor se compromete com sha256(serverSeed) antes de você apostar; ao rotacionar, a seed é revelada para você reverificar cada rolagem abaixo — sem precisar confiar.",
    "fair.current": "Par de seeds atual",
    "fair.hashCommit": "Hash da seed do servidor (compromisso)",
    "fair.clientSeed": "Seed do cliente",
    "fair.nextNonce": "Próximo nonce",
    "fair.newSeedPh": "nova seed do cliente (opcional)",
    "fair.rotate": "Rotacionar e revelar",
    "fair.verify": "Verificar uma rolagem",
    "fair.serverSeedPh": "seed do servidor revelada",
    "fair.clientSeedPh": "seed do cliente",
    "fair.noncePh": "nonce",
    "fair.compute": "Calcular",
    "fair.rollLabel": "Resultado:",
    "fair.hashNote1": "sha256 dessa seed:",
    "fair.hashNote2": "— deve corresponder ao compromisso mostrado antes das suas apostas.",
    "fair.revealedTitle": "Seeds reveladas",
    "fair.noneRevealed": "Nada revelado ainda — rotacione a seed acima depois de jogar.",
    "fair.serverSeed": "Seed do servidor",
    "fair.hash": "Hash",
    "fair.seedStats": "Seed do cliente / apostas feitas",
    "lang.title": "Idioma",
    "theme.title": "Tema",
    "theme.blue": "Azul",
    "theme.purple": "Roxo",
    "theme.orange": "Laranja",
  },
  es: {
    banner: "Proyecto demo — monedas virtuales y Stripe en modo de prueba. Sin dinero real.",
    "nav.play": "Jugar",
    "nav.history": "Historial",
    "nav.fairness": "Transparencia",
    "nav.signout": "Cerrar sesión",
    "login.signin": "Iniciar sesión",
    "login.signup": "Crear cuenta",
    "login.email": "correo",
    "login.password": "contraseña (mín. 6 caracteres)",
    "login.signupBtn": "Regístrate — recibe $10 en monedas demo",
    "login.toSignup": "¿Sin cuenta? Regístrate",
    "login.toSignin": "¿Ya tienes cuenta? Inicia sesión",
    "game.title": "Dados",
    "game.rollUnder": "Saca menos de {target} para ganar. Pago: {mult}× (1% de ventaja de la casa).",
    "game.winChance": "Probabilidad de ganar: {pct}%",
    "game.stake": "Apuesta ($)",
    "game.winPays": "Ganar paga {amount}",
    "game.roll": "Lanzar",
    "game.rolling": "Lanzando…",
    "game.won": "¡Ganaste {amount}!",
    "game.lost": "Perdiste",
    "game.errInsufficient": "Monedas insuficientes — haz un depósito (de prueba) abajo.",
    "game.errFailed": "La apuesta falló, inténtalo de nuevo.",
    "game.errCheckout": "No se pudo iniciar el pago.",
    "game.depositTitle": "Depósito (Stripe modo prueba)",
    "game.depositHint": "Usa la tarjeta 4242 4242 4242 4242, cualquier vencimiento futuro, cualquier CVC.",
    "history.title": "Historial de apuestas",
    "history.loading": "Cargando…",
    "history.empty": "Aún no hay apuestas — ve a lanzar los dados.",
    "history.when": "Cuándo",
    "history.stake": "Apuesta",
    "history.target": "Objetivo",
    "history.roll": "Resultado",
    "history.payout": "Pago",
    "fair.title": "Demostrablemente justo",
    "fair.explain":
      "Cada lanzamiento es HMAC-SHA256(serverSeed, clientSeed:nonce). El servidor se compromete con sha256(serverSeed) antes de que apuestes; al rotar, la seed se revela para que verifiques cada lanzamiento a continuación — sin necesidad de confiar.",
    "fair.current": "Par de seeds actual",
    "fair.hashCommit": "Hash de la seed del servidor (compromiso)",
    "fair.clientSeed": "Seed del cliente",
    "fair.nextNonce": "Próximo nonce",
    "fair.newSeedPh": "nueva seed del cliente (opcional)",
    "fair.rotate": "Rotar y revelar",
    "fair.verify": "Verificar un lanzamiento",
    "fair.serverSeedPh": "seed del servidor revelada",
    "fair.clientSeedPh": "seed del cliente",
    "fair.noncePh": "nonce",
    "fair.compute": "Calcular",
    "fair.rollLabel": "Resultado:",
    "fair.hashNote1": "sha256 de esa seed:",
    "fair.hashNote2": "— debe coincidir con el compromiso mostrado antes de tus apuestas.",
    "fair.revealedTitle": "Seeds reveladas",
    "fair.noneRevealed": "Nada revelado aún — rota la seed de arriba después de jugar.",
    "fair.serverSeed": "Seed del servidor",
    "fair.hash": "Hash",
    "fair.seedStats": "Seed del cliente / apuestas hechas",
    "lang.title": "Idioma",
    "theme.title": "Tema",
    "theme.blue": "Azul",
    "theme.purple": "Morado",
    "theme.orange": "Naranja",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

export function useLocale() {
  return useState<Locale>("locale", () => "en");
}

export function useI18n() {
  const locale = useLocale();

  /** Restore saved locale, or guess from the browser. Call once on mount. */
  function initLocale() {
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved && saved in messages) {
      locale.value = saved;
      return;
    }
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("pt")) locale.value = "pt";
    else if (nav.startsWith("es")) locale.value = "es";
  }

  function setLocale(l: Locale) {
    locale.value = l;
    localStorage.setItem("locale", l);
  }

  function t(key: MessageKey, params?: Record<string, string | number>): string {
    let s: string = messages[locale.value][key] ?? messages.en[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    }
    return s;
  }

  return { t, locale, setLocale, initLocale };
}
