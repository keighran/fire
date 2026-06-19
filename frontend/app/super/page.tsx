import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatAUD, gainColour } from "@/lib/format";

export const metadata = { title: "Super — WealthTrack AU" };

function ProgressBar({ pct, color = "bg-emerald-500" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default async function SuperPage() {
  const token = await getAuthToken();
  const data = await api.getSuperSummary(token).catch(() => null);

  const total = data?.total_balance ?? 0;
  const gain  = data?.total_gain ?? 0;
  const employer   = data?.total_employer_sg ?? 0;
  const voluntary  = data?.total_voluntary_contributions ?? 0;
  const contribTotal = employer + voluntary;
  const employerPct  = contribTotal > 0 ? (employer / contribTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Superannuation</h1>
      <p className="text-sm text-slate-500 -mt-4">
        Super assets are excluded from the main portfolio and not subject to CGT (separate tax treatment).
      </p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="stat-label mb-1">Total Balance</p>
          <p className="stat-value">{formatAUD(total)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Total Gain</p>
          <p className={`stat-value ${gainColour(gain)}`}>{formatAUD(gain)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Employer SG (FY YTD)</p>
          <p className="stat-value text-blue-400">{formatAUD(employer)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Voluntary Contrib (FY YTD)</p>
          <p className="stat-value text-violet-400">{formatAUD(voluntary)}</p>
        </div>
      </div>

      {/* Contribution breakdown */}
      <div className="card">
        <p className="stat-label mb-4">FY Contributions Breakdown</p>
        {contribTotal === 0 ? (
          <p className="text-sm text-slate-500">
            No contributions recorded yet. Add DEPOSIT (employer SG) or INCOME (voluntary) transactions
            to super accounts to track them here.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-400">Employer SG</span>
                <span className="text-blue-400 font-medium">{formatAUD(employer)} ({employerPct.toFixed(0)}%)</span>
              </div>
              <ProgressBar pct={employerPct} color="bg-blue-500" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-400">Voluntary (concessional + non-concessional)</span>
                <span className="text-violet-400 font-medium">{formatAUD(voluntary)} ({(100 - employerPct).toFixed(0)}%)</span>
              </div>
              <ProgressBar pct={100 - employerPct} color="bg-violet-500" />
            </div>
            <div className="flex justify-between text-sm pt-3 border-t border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Total FY Contributions</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatAUD(contribTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Per-fund breakdown */}
      {data?.accounts && data.accounts.length > 0 && (
        <div className="card">
          <p className="stat-label mb-3">Super Funds</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th text-left">Fund</th>
                  <th className="table-th">Balance</th>
                  <th className="table-th">Employer SG (FY)</th>
                  <th className="table-th">Voluntary (FY)</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((fund) => (
                  <tr key={fund.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="table-td text-left font-medium text-slate-800 dark:text-slate-200">{fund.name}</td>
                    <td className="table-td">{formatAUD(fund.balance)}</td>
                    <td className="table-td text-blue-400">{formatAUD(fund.employer_sg)}</td>
                    <td className="table-td text-violet-400">{formatAUD(fund.voluntary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="card border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
        <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-2">Australian Super Rules</p>
        <ul className="text-xs text-blue-800/80 dark:text-blue-300/70 space-y-1.5 list-disc list-inside">
          <li>Employer SG rate: 11.5% of ordinary time earnings (FY 2024–25). Rises to 12% in FY 2025–26.</li>
          <li>Concessional contributions cap: $30,000/year (FY 2024–25).</li>
          <li>Non-concessional cap: $120,000/year (or $360,000 via 3-year bring-forward).</li>
          <li>Super earnings taxed at 15% inside the fund — not CGT.</li>
          <li>Preservation age: 60 (for those born after 1 Jul 1964).</li>
        </ul>
      </div>
    </div>
  );
}
