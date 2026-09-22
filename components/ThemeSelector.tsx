"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";

const resolvedThemeLabels = {
  light: "light",
  dark: "dark",
} as const;

const PREFERENCE_EVENT = "somapah-swap-theme-change";

type ThemeOption = {
  value: ThemePreference;
  label: string;
  icon: ReactNode;
};

const themeOptions: readonly ThemeOption[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <circle cx="8" cy="8" r="3.25" />
        <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.4" />
        <path d="M6 13.5h4" />
      </svg>
    ),
  },
];

function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

function subscribeToPreference(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFERENCE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFERENCE_EVENT, onChange);
  };
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");

  if (!query) {
    return () => undefined;
  }

  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/**
 * Applies the resolved theme to <html>. System mode removes the attribute so
 * the stylesheet resolves the theme from the browser colour scheme.
 */
function applyThemeAttribute(preference: ThemePreference) {
  const root = document.documentElement;

  if (preference === "system") {
    root.removeAttribute(THEME_ATTRIBUTE);
    return;
  }

  root.setAttribute(THEME_ATTRIBUTE, preference);
}

export function ThemeSelector() {
  // Both values live outside React, so they are read as external stores. This
  // keeps the first client render identical to the server render and avoids
  // setting state inside an effect.
  const preference = useSyncExternalStore(
    subscribeToPreference,
    readStoredPreference,
    () => DEFAULT_THEME_PREFERENCE,
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemPrefersDark,
    () => false,
  );

  const resolved = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    applyThemeAttribute(preference);
  }, [preference]);

  function select(next: ThemePreference) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the theme still applies for this session.
    }

    applyThemeAttribute(next);
    window.dispatchEvent(new Event(PREFERENCE_EVENT));
  }

  return (
    <div className="theme-control">
      <span className="theme-control__label" id="theme-control-label">
        Theme
      </span>
      <div
        aria-labelledby="theme-control-label"
        className="theme-control__options"
        role="group"
      >
        {themeOptions.map((option) => (
          <button
            aria-pressed={preference === option.value}
            className="theme-control__button"
            key={option.value}
            onClick={() => select(option.value)}
            type="button"
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <span aria-live="polite" className="visually-hidden">
        {`Theme set to ${resolvedThemeLabels[resolved]}`}
      </span>
    </div>
  );
}
