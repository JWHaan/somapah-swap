import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  isThemePreference,
  parseThemePreference,
  resolveTheme,
  themeInitScript,
} from "../lib/theme";

describe("theme preference model", () => {
  it("offers exactly light, dark, and system", () => {
    expect(THEME_PREFERENCES).toEqual(["light", "dark", "system"]);
  });

  it("defaults to system", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
  });

  it("resolves an explicit preference regardless of the system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("resolves system from the browser colour scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
  ] as const)("accepts the stored value %s", (stored, expected) => {
    expect(parseThemePreference(stored)).toBe(expected);
  });

  it.each([null, undefined, "", "solarized", "LIGHT", 42, {}, []])(
    "falls back safely for an invalid stored value: %j",
    (stored) => {
      expect(parseThemePreference(stored)).toBe("system");
    },
  );

  it("exposes a type guard that rejects non-preferences", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("dim")).toBe(false);
  });
});

describe("theme bootstrap script", () => {
  it("reads the documented storage key and attribute", () => {
    expect(themeInitScript).toContain(THEME_STORAGE_KEY);
    expect(themeInitScript).toContain(THEME_ATTRIBUTE);
  });

  it("only applies an explicit light or dark choice", () => {
    expect(themeInitScript).toContain('s==="light"||s==="dark"');
  });

  it("cannot throw when storage is unavailable", () => {
    expect(themeInitScript).toContain("try{");
    expect(themeInitScript).toContain("catch(e){}");
  });

  it("stays small enough to inline before paint", () => {
    expect(themeInitScript.length).toBeLessThan(400);
  });
});
