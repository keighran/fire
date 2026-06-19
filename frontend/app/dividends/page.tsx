import { api, ApiError } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatAUD, formatDate, formatPct } from "@/lib/format";
import UpgradePrompt from "@/components/UpgradePrompt";

export const metadata = { title: "Dividends — WealthTrack AU" };

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function DividendCalendar({ dividends }: { dividends: { date: string; net_amount: number }[] }) {
  const currentYear = new Date().getFullYear();
  const byMonth: Record<number, number> = {};
  for (const d of dividends) {
    const dt = new Date(d.date);
    if (dt.getFullYear() === currentYear) {
      const m = dt.getMonth();
      byMonth[m] = (byMonth[m] ?? 0) + d.net_amount;
    }
  }
  const max = Math.max(...Object.values(byMonth), 1);

  return (
    <div className="card">
      <p className="stat-label mb-4">Dividend Calendar — {currentYear}</p>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {MONTH_ABBR.map((abbr, i) => {
          const amount = byMonth[i] ?? 0;
          const intensity = amount > 0 ? 0.15 + 0.85 * (amount / max) : 0;
          return (
            <div key={abbr} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-full aspect-square rounded-md flex items-center justify-center text-[10px] font-medium border transition-colors ${
                  amount > 0
                    ? "text-emerald-950 dark:text-emerald-100 border-emerald-500/20"
                    : "bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-850"
                }`}
                style={amount > 0 ? { backgroundColor: `rgba(16,185,129,${intensity})` } : undefined}
                title={amount > 0 ? `${abbr}: ${formatAUD(amount)}` : `${abbr}: no dividends`}
              >
                {amount > 0 ? formatAUD(amount, true) : "—"}
              </div>
              <span className="text-[9px] text-slate-500 dark:text-slate-400">{abbr}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-600 mt-3">Darker green = higher dividend income for that month.</p>
    </div>
  );
}

export default async function DividendsPage() {
  const token = await getAuthToken();
  let dividends = null;
  let fySummary: Record<string, Record<string, number>> = {};
  let isLocked = false;

  try {
    [dividends, fySummary] = await Promise.all([
      api.getDividends(token),
      api.getDividendFYSummary(token),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) isLocked = true;
  }

  if (isLocked) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Dividends</h1>
        <UpgradePrompt
          feature="Dividend Tracker"
          description="Track all dividends with franking credit gross-ups, yield-on-cost, and FY summaries. Essential for Australian tax returns."
        />
      </div>
    );
  }

  const divs = dividends ?? [];
  const totalNet = divs.reduce((a, d) => a + d.net_amount, 0);
  const totalFranking = divs.reduce((a, d) => a + d.franking_credit, 0);
  const totalGross = divs.reduce((a, d) => a + d.gross_amount, 0);

  const fYears = Object.keys(fySummary).sort().reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dividends</h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="stat-label mb-1">Total Net Dividends</p>
          <p className="stat-value text-emerald-400">{formatAUD(totalNet)}</p>
        </div>
        <div className="card text-center">
          <p className="stat-label mb-1">Total Franking Credits</p>
          <p className="stat-value text-blue-400">{formatAUD(totalFranking)}</p>
        </div>
        <div className="card text-center">
          <p className="stat-label mb-1">Gross Dividend Income</p>
          <p className="stat-value text-slate-900 dark:text-slate-100">{formatAUD(totalGross)}</p>
          <p className="text-xs text-slate-500 mt-1">Net + Franking credits</p>
        </div>
      </div>

      {/* Calendar */}
      <DividendCalendar dividends={divs} />

      {/* FY Summary */}
      {fYears.length > 0 && (
        <div className="card">
          <p className="stat-label mb-3">Financial Year Summary (Jul – Jun)</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th text-left">FY</th>
                  <th className="table-th">ETFs</th>
                  <th className="table-th">Stocks</th>
                  <th className="table-th">Managed Funds</th>
                  <th className="table-th">Crypto</th>
                  <th className="table-th">Total</th>
                </tr>
              </thead>
              <tbody>
                {fYears.map((fy) => {
                  const row = fySummary[fy];
                  return (
                    <tr key={fy} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="table-td text-left font-medium text-slate-700 dark:text-slate-300">FY {fy}</td>
                      <td className="table-td text-emerald-600 dark:text-emerald-400">{formatAUD(row.ETF ?? 0)}</td>
                      <td className="table-td text-blue-600 dark:text-blue-400">{formatAUD(row.Stock ?? 0)}</td>
                      <td className="table-td text-violet-600 dark:text-violet-400">{formatAUD(row["Managed Fund"] ?? 0)}</td>
                      <td className="table-td text-amber-600 dark:text-amber-400">{formatAUD(row.Crypto ?? 0)}</td>
                      <td className="table-td font-semibold text-slate-900 dark:text-slate-100">{formatAUD(row.total ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Ledger */}
      <div className="card">
        <p className="stat-label mb-3">Dividend Ledger</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th text-left">Ticker</th>
                <th className="table-th text-left">Class</th>
                <th className="table-th">Ex-Date</th>
                <th className="table-th">Units</th>
                <th className="table-th">Net Amount</th>
                <th className="table-th">Franking %</th>
                <th className="table-th">Franking Credit</th>
                <th className="table-th">Gross</th>
                <th className="table-th">Yield on Cost</th>
                <th className="table-th">FY</th>
              </tr>
            </thead>
            <tbody>
              {divs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 text-sm py-8">
                    No dividends recorded yet. Add dividend transactions to see them here.
                  </td>
                </tr>
              ) : (
                divs.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="table-td text-left font-medium text-slate-900 dark:text-slate-100">{d.ticker}</td>
                    <td className="table-td text-left text-slate-500 dark:text-slate-400 text-xs">{d.asset_class}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatDate(d.date)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{Number(d.units_at_ex_date).toFixed(2)}</td>
                    <td className="table-td text-emerald-600 dark:text-emerald-400 font-medium">{formatAUD(d.net_amount)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{d.franking_percentage.toFixed(0)}%</td>
                    <td className="table-td text-blue-600 dark:text-blue-400">{formatAUD(d.franking_credit)}</td>
                    <td className="table-td font-semibold text-slate-800 dark:text-slate-200">{formatAUD(d.gross_amount)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{d.yield_on_cost.toFixed(2)}%</td>
                    <td className="table-td text-slate-500 dark:text-slate-500 text-xs">{d.tax_year}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Franking credit = net dividend × (franking% / 100) × (30/70). Gross-up at 30% corporate tax rate (ATO).
        </p>
      </div>
    </div>
  );
}
