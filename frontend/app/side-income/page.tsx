import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatAUD } from "@/lib/format";
import SideIncomeChart from "@/components/SideIncomeChart";

export const metadata = { title: "Side Income — WealthTrack AU" };

export default async function SideIncomePage() {
  const token = await getAuthToken();

  const [monthly, rollingData] = await Promise.all([
    api.getSideIncomeMonthly(token).catch(() => []),
    api.getSideIncomeRollingAvg(token).catch(() => ({ rolling_365_avg: 0 })),
  ]);

  const rollingAvg = rollingData?.rolling_365_avg ?? 0;

  // Derive FY YTD from monthly data (Australian FY: Jul–Jun)
  const now = new Date();
  const fyStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const fyYtd = monthly
    .filter((m) => {
      const [year, month] = m.month.split("-").map(Number);
      return year > fyStart || (year === fyStart && month >= 7);
    })
    .reduce((a, m) => a + m.amount, 0);

  const monthsElapsed = now.getMonth() >= 6
    ? now.getMonth() - 6 + 1
    : now.getMonth() + 7;
  const predictedYearly = monthsElapsed > 0 ? (fyYtd / monthsElapsed) * 12 : 0;

  const totalAllTime = monthly.reduce((a, m) => a + m.amount, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Side Income</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="stat-label mb-1">365-Day Avg / Month</p>
          <p className="stat-value text-violet-400">{formatAUD(rollingAvg)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Annualised (×12)</p>
          <p className="stat-value text-emerald-400">{formatAUD(rollingAvg * 12)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">FY YTD</p>
          <p className="stat-value">{formatAUD(fyYtd)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Predicted This FY</p>
          <p className="stat-value text-amber-400">{formatAUD(predictedYearly)}</p>
        </div>
      </div>

      {/* Monthly bar chart */}
      <SideIncomeChart data={monthly} rollingAvg={rollingAvg} />

      {/* All-time summary */}
      <div className="card">
        <p className="stat-label mb-3">All Time</p>
        {monthly.length === 0 ? (
          <p className="text-sm text-slate-500">
            No side income recorded yet. Add INCOME-type transactions to non-employment accounts to track them here.
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Total side income recorded</span>
            <span className="text-lg font-semibold text-slate-100">{formatAUD(totalAllTime)}</span>
          </div>
        )}
        <p className="text-xs text-slate-600 mt-3">
          Rolling 365-day average excludes employment salary. Includes rental income, freelance, dividends classified as side income.
        </p>
      </div>
    </div>
  );
}
