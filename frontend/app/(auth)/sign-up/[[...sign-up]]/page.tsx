"use client";

import { useEffect, useState } from "react";
import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerkTheme";

export default function SignUpPage() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            WealthTrack AU 🇦🇺
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Join the Australian FI/RE community
          </p>
        </div>
        <SignUp appearance={clerkAppearance(isDark)} />
      </div>
    </div>
  );
}
