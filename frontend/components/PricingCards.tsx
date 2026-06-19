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
            className={`relative rounded-2xl border p-7 flex flex-col ${
              plan.highlight
                ? "border-emerald-600 bg-emerald-950/30"
                : "border-slate-800 bg-slate-900"
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                <span className="text-slate-400 text-sm">{plan.period}</span>
              </div>
              <p className="text-slate-400 text-sm">{plan.description}</p>
            </div>

            <ul className="space-y-2.5 flex-1 mb-8">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {isCurrentPlan ? (
              <div className="text-center py-2.5 rounded-lg bg-slate-800 text-slate-400 text-sm font-medium">
                Current plan
              </div>
            ) : plan.priceId ? (
              <button
                onClick={() => handleUpgrade(plan.priceId!, plan.name)}
                disabled={loading === plan.name}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
                  plan.highlight
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-slate-700 hover:bg-slate-600"
                } disabled:opacity-50`}
              >
                {loading === plan.name ? "Redirecting…" : plan.cta}
              </button>
            ) : (
              <div className="text-center py-2.5 rounded-lg bg-slate-800 text-slate-400 text-sm font-medium">
                {plan.cta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
