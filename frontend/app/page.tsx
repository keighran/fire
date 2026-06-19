import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import NetWorthCard from "@/components/NetWorthCard";
import AllocationChart from "@/components/AllocationChart";
import HoldingsTable from "@/components/HoldingsTable";
import NetWorthHistoryChart from "@/components/NetWorthHistoryChart";

export default async function DashboardPage() {
  const token = await getAuthToken();

  // New user — no settings yet, send to onboarding.
  const settings = await api.getSettings(token).catch((e) => {
    if (e?.status === 404) return null;
    throw e;
  });
  if (!settings) redirect("/onboarding");

  const [netWorth, holdings, history] = await Promise.all([
    api.getNetWorth(token).catch(() => null),
    api.getHoldings(token).catch(() => []),
    api.getHistory(token, 24).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <NetWorthCard snapshot={netWorth} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <NetWorthHistoryChart data={history} />
        </div>
        <AllocationChart snapshot={netWorth} />
      </div>

      <HoldingsTable holdings={holdings} />
    </div>
  );
}
