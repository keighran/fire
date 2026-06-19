"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  priceId: string | null;
  features: string[];
  cta: string;
  highlight: boolean;
}

interface Props {
  plans: Plan[];
  currentTier: string;
}

export default function PricingCards({ plans, currentTier }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(priceId: string, planName: string) {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    setLoading(planName);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/billing/create-checkout-session`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ price_id: priceId }),
        },
      );
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map((plan) => {
        const isCurrentPlan = plan.name.toLowerCase() === currentTier;
        return (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-7 flex flex-col transition-all duration-200 ${
              plan.highlight
                ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/30"
                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                  Most popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{plan.price}</span>
                <span className="text-slate-500 dark:text-slate-400 text-sm">{plan.period}</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{plan.description}</p>
            </div>

            <ul className="space-y-2.5 flex-1 mb-8">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {isCurrentPlan ? (
              <div className="text-center py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-sm font-medium">
                Current plan
              </div>
            ) : plan.priceId ? (
              <button
                onClick={() => handleUpgrade(plan.priceId!, plan.name)}
                disabled={loading === plan.name}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-850 dark:text-white"
                } disabled:opacity-50`}
              >
                {loading === plan.name ? "Redirecting…" : plan.cta}
              </button>
            ) : (
              <div className="text-center py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-sm font-medium">
                {plan.cta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
