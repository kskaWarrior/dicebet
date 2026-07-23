export type Theme = "blue" | "purple" | "orange";

export const THEMES: Theme[] = ["blue", "purple", "orange"];

/** Swatch colors shown in the picker (matches each theme's --accent). */
export const THEME_ACCENTS: Record<Theme, string> = {
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f97316",
};

export function useTheme() {
  const theme = useState<Theme>("theme", () => "blue");

  function apply(t: Theme) {
    document.documentElement.dataset.theme = t;
  }

  /** Restore the saved theme. Call once on mount. */
  function initTheme() {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved && THEMES.includes(saved)) theme.value = saved;
    apply(theme.value);
  }

  function setTheme(t: Theme) {
    theme.value = t;
    localStorage.setItem("theme", t);
    apply(t);
  }

  return { theme, setTheme, initTheme };
}
