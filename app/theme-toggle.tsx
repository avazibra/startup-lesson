"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemePreference = "system" | Theme;

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<Theme>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const storedPreference = window.localStorage.getItem("theme") as ThemePreference | null;
    const initialPreference = storedPreference === "light" || storedPreference === "dark" || storedPreference === "system" ? storedPreference : "system";

    function applyTheme(nextPreference: ThemePreference) {
      const nextResolvedTheme = nextPreference === "system" ? (media.matches ? "dark" : "light") : nextPreference;
      setPreference(nextPreference);
      setResolvedTheme(nextResolvedTheme);
      document.documentElement.dataset.theme = nextResolvedTheme;
      document.documentElement.dataset.themePreference = nextPreference;
    }

    applyTheme(initialPreference);

    function handleSystemThemeChange() {
      const currentPreference = (window.localStorage.getItem("theme") as ThemePreference | null) ?? "system";
      if (currentPreference === "system") {
        applyTheme("system");
      }
    }

    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, []);

  function toggleTheme() {
    const nextPreference: ThemePreference = preference === "system" ? "light" : preference === "light" ? "dark" : "system";
    const nextResolvedTheme = resolveTheme(nextPreference);
    setPreference(nextPreference);
    setResolvedTheme(nextResolvedTheme);
    document.documentElement.dataset.theme = nextResolvedTheme;
    document.documentElement.dataset.themePreference = nextPreference;
    window.localStorage.setItem("theme", nextPreference);
  }

  const nextPreference = preference === "system" ? "light" : preference === "light" ? "dark" : "system";

  return (
    <button
      aria-label={`Switch appearance to ${nextPreference}`}
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
    >
      <span aria-hidden="true">{preference === "system" ? "◐" : resolvedTheme === "dark" ? "☾" : "☀"}</span>
      <span>{preference === "system" ? "System" : preference === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
