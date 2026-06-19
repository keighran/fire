import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { api, SubscriptionInfo } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import ManageSubscriptionButton from "@/components/ManageSubscriptionButton";

export const metadata = { title: "Billing — WealthTrack AU" };

function tierBadge(tier: string) {
  const styles: Record<string, string> = {
    free: "bg-slate-700 text-slate-300",
    pro: "bg-emerald-900 text-emerald-300",
    enterprise: "bg-violet-900 text-violet-300",
  };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium capitalize ${styles[tier] ?? styles.free}`}>
      {tier}
    </span>
  );
}

export default async function BillingPage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const token = await getAuthToken();
  let sub: SubscriptionInfo | null = null;
  try {
    sub = await api.getSubscription(token);
  } catch {}

  const tier = sub?.tier ?? "free";
  const status = sub?.status ?? "active";
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("en-AU", { dateStyle: "long" })
    : null;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-white mb-8">Billing & Subscription</h1>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-slate-400 mb-1">Current plan</p>
            {tierBadge(tier)}
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Status</p>
            <p className={`text-sm font-medium capitalize ${status === "active" || status === "trialing" ? "text-emerald-400" : "text-amber-400"}`}>
              {status}
            </p>
          </div>
        </div>

        {periodEnd && (
          <p className="text-sm text-slate-400">
            {sub?.cancel_at_period_end
              ? `Cancels on ${periodEnd}`
              : `Renews on ${periodEnd}`}
          </p>
        )}
      </div>

      {tier === "free" ? (
        <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">Unlock Pro features</h2>
          <p className="text-slate-400 text-sm mb-4">
            Get unlimited transactions, FIRE projections, live prices, and full CGT history.
          </p>
          <Link
            href="/pricing"
            className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2 rounded-lg transition-colors"
          >
            View pricing
          </Link>
        </div>
      ) : (
        <ManageSubscriptionButton />
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-3">Billing history</h2>
        <p className="text-sm text-slate-400">
          Your invoices are managed through Stripe. Click "Manage subscription" above to view past invoices.
        </p>
      </div>
    </div>
  );
}
