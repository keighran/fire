"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Detect current state on load
    const isLight = !document.documentElement.classList.contains("dark");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  if (!mounted) {
    return (
      <div className="w-full h-9 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200
        text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
      aria-label="Toggle theme"
    >
      <span className="flex items-center gap-2.5">
        <span className="text-base leading-none">
          {theme === "dark" ? "🌙" : "☀️"}
        </span>
        <span className="font-medium">{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
      </span>
      <span className="text-[9px] tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700/50">
        {theme.toUpperCase()}
      </span>
    </button>
  );
}
