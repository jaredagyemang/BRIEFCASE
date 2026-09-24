export const THEME_COOKIE = "theme";

export type Theme = "system" | "light" | "dark";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
