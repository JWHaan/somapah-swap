export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "somapah-swap-theme";
export const THEME_ATTRIBUTE = "data-theme";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return preference;
}

/**
 * Runs before first paint so an explicit Light or Dark choice is applied
 * without an incorrect-theme flash. System mode needs no attribute: the
 * stylesheet resolves it from the browser colour scheme, so the page still
 * works with JavaScript delayed and with storage unavailable.
 */
export const themeInitScript = `(function(){try{var s=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(s==="light"||s==="dark"){document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},s);}}catch(e){}})();`;
