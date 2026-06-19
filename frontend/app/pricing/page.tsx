import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PricingCards from "@/components/PricingCards";
import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

export const metadata = { title: "Pricing — WealthTrack AU" };

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with the essentials.",
    priceId: null,
    features: [
      "Net worth dashboard",
      "Holdings overview",
      "Up to 50 transactions",
      "CGT report (current FY)",
      "Cash & budget tracker",
      "Property equity tracking",
    ],
    cta: "Current plan",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month AUD",
    description: "For serious wealth builders.",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "",
    features: [
      "Everything in Free",
      "Unlimited transactions",
      "Full CGT history (all years)",
      "FIRE projection engine",
      "Live ASX & crypto prices",
      "Dividend tracker with franking",
      "CSV import (CommSec format)",
      "Priority email support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "$79",
    period: "/ month AUD",
    description: "For families and advisers.",
    priceId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID ?? "",
    features: [
      "Everything in Pro",
      "Multi-portfolio support",
      "API access",
      "Dedicated account manager",
      "Custom integrations",
      "SLA support",
    ],
    cta: "Upgrade to Enterprise",
    highlight: false,
  },
];

export default async function PricingPage() {
  let currentTier = "free";
  try {
    const { userId } = auth();
    if (userId) {
      const token = await getAuthToken();
      const profile = await api.getMe(token);
      currentTier = profile.tier;
    }
  } catch {}

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">Simple, transparent pricing</h1>
        <p className="text-slate-400 text-lg">
          Built for the Australian FI/RE community. Cancel anytime.
        </p>
      </div>
      <PricingCards plans={PLANS} currentTier={currentTier} />
      <p className="text-center text-sm text-slate-500 mt-8">
        Prices in AUD (inc. GST). Secure payments via Stripe. Australian ABN: available on invoice.
      </p>
    </div>
  );
}
