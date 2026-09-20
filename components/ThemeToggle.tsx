"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("mcp-audit-theme", next);
    } catch {
      // A blocked storage API must not break the toggle.
    }
  }

  return (
    <div className="segmented" role="group" aria-label="Colour theme">
      <button type="button" aria-pressed={theme === "light"} onClick={() => choose("light")}>
        Light
      </button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => choose("dark")}>
        Dark
      </button>
    </div>
  );
}
