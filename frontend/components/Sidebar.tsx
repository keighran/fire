"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser, SignInButton } from "@clerk/nextjs";

const NAV = [
  { href: "/",             label: "Dashboard",      icon: "⬛", tier: "free" },
  { href: "/portfolio",    label: "Portfolio",      icon: "📈", tier: "free" },
  { href: "/dividends",    label: "Dividends",      icon: "💰", tier: "pro"  },
  { href: "/cgt",          label: "Capital Gains",  icon: "📋", tier: "free" },
  { href: "/fire",         label: "FIRE 🔥",         icon: "🔥", tier: "pro"  },
  { href: "/property",     label: "Property",       icon: "🏠", tier: "free" },
  { href: "/super",        label: "Super",          icon: "🏦", tier: "free" },
  { href: "/budget",       label: "Budget",         icon: "📊", tier: "free" },
  { href: "/side-income",  label: "Side Income",    icon: "💼", tier: "free" },
  { href: "/settings",     label: "Settings",       icon: "⚙️",  tier: "free" },
];

const BOTTOM_NAV = [
  { href: "/pricing",     label: "Pricing",         icon: "💎" },
  { href: "/billing",     label: "Billing",         icon: "🧾" },
];

const ADMIN_EMAIL = "admin@astradigital.com.au";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const isSignedIn = isLoaded && !!user;

  if (pathname.startsWith("/onboarding")) return null;

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col py-6 px-3">
      {/* Logo */}
      <div className="px-3 mb-6">
        <span className="text-sm font-semibold text-slate-100">WealthTrack</span>
        <span className="ml-1 text-xs text-slate-500">🇦🇺</span>
      </div>

      {/* Primary nav — blurred + non-interactive when signed out */}
      <nav className={`flex flex-col gap-1 flex-1 transition-all duration-300 ${!isSignedIn ? "pointer-events-none select-none" : ""}`}>
        {NAV.map(({ href, label, icon, tier }) => {
          const active = isSignedIn && pathname === href;
          return (
            <div
              key={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-300
                ${!isSignedIn
                  ? "blur-[3px] opacity-30"
                  : active
                    ? "bg-emerald-700 text-white font-medium"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
                }`}
              onClick={isSignedIn ? () => window.location.href = href : undefined}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
              {tier === "pro" && (
                <span className="ml-auto text-[10px] font-medium text-emerald-500 bg-emerald-950 px-1.5 py-0.5 rounded">
                  PRO
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom nav — blurred when signed out */}
      <div className={`flex flex-col gap-1 mt-4 pt-4 border-t border-slate-800 transition-all duration-300
        ${!isSignedIn ? "pointer-events-none select-none" : ""}`}>
        {BOTTOM_NAV.map(({ href, label, icon }) => {
          const active = isSignedIn && pathname === href;
          return (
            <div
              key={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-300
                ${!isSignedIn
                  ? "blur-[3px] opacity-30"
                  : active
                    ? "bg-slate-700 text-white cursor-pointer"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
                }`}
              onClick={isSignedIn ? () => window.location.href = href : undefined}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </div>
          );
        })}
      </div>

      {/* Admin link — only shown to admin user */}
      {isSignedIn && user.primaryEmailAddress?.emailAddress === ADMIN_EMAIL && (
        <div className="mt-2">
          <div
            onClick={() => window.location.href = "/admin"}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors
              ${pathname === "/admin"
                ? "bg-violet-700 text-white font-medium"
                : "text-violet-400 hover:bg-slate-800 hover:text-violet-300"}`}
          >
            <span className="text-base leading-none">🛡️</span>
            Admin Panel
          </div>
        </div>
      )}

      {/* User section */}
      <div className="mt-4 pt-4 border-t border-slate-800 px-2">
        {isSignedIn ? (
          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">
                {user.firstName ?? user.primaryEmailAddress?.emailAddress ?? "User"}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>
        ) : (
          <SignInButton mode="redirect">
            <button className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600
              text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
              <span className="text-base leading-none">🔐</span>
              Sign In
            </button>
          </SignInButton>
        )}
      </div>
    </aside>
  );
}
