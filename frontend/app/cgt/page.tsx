import { api, ApiError } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatAUD, formatDate, gainColour } from "@/lib/format";
import UpgradePrompt from "@/components/UpgradePrompt";

export const metadata = { title: "Capital Gains — WealthTrack AU" };

export default async function CGTPage({
  searchParams,
}: {
  searchParams: { tax_year?: string };
}) {
  const token = await getAuthToken();
  let report = null;
  let isLocked = false;

  try {
    report = await api.getCGTReport(token, searchParams.tax_year);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) isLocked = true;
  }

  const currentFY = (() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Capital Gains Tax Report</h1>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Tax Year:</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium">{searchParams.tax_year ?? `${currentFY} (current)`}</span>
          {!searchParams.tax_year && (
            <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-transparent">Free plan shows current FY — upgrade for full history</span>
          )}
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="stat-label mb-1">Total Gross Gain</p>
            <p className={`text-xl font-semibold ${gainColour(report.total_gross_gain)}`}>
              {formatAUD(report.total_gross_gain)}
            </p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">Taxable Gain (after discount)</p>
            <p className="text-xl font-semibold text-blue-400">
              {formatAUD(report.total_taxable_gain)}
            </p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">Capital Losses</p>
            <p className="text-xl font-semibold text-red-400">
              {formatAUD(Math.abs(report.total_losses))}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <p className="stat-label mb-3">Disposal Events (FIFO)</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th text-left">Asset</th>
                <th className="table-th">Sell Date</th>
                <th className="table-th">Buy Date</th>
                <th className="table-th">Days Held</th>
                <th className="table-th">Units</th>
                <th className="table-th">Cost Base</th>
                <th className="table-th">Proceeds</th>
                <th className="table-th">Gross Gain</th>
                <th className="table-th">50% Disc.</th>
                <th className="table-th">Taxable Gain</th>
                <th className="table-th">FY</th>
              </tr>
            </thead>
            <tbody>
              {!report || report.events.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-slate-500 text-sm py-8">
                    No disposal events found for this period.
                  </td>
                </tr>
              ) : (
                report.events.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="table-td text-left font-medium text-slate-900 dark:text-slate-100">{e.asset_ticker}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatDate(e.sell_date)}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatDate(e.buy_date)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{e.holding_days}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{Number(e.units_disposed).toFixed(4)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{formatAUD(e.cost_base)}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatAUD(e.gross_proceeds)}</td>
                    <td className={`table-td font-medium ${gainColour(e.gross_gain)}`}>{formatAUD(e.gross_gain)}</td>
                    <td className="table-td text-center">
                      {e.discount_applied
                        ? <span className="text-emerald-400 text-xs font-medium">✓</span>
                        : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className={`table-td font-semibold ${gainColour(e.taxable_gain)}`}>{formatAUD(e.taxable_gain)}</td>
                    <td className="table-td text-slate-500 text-xs">{e.tax_year}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600 mt-4">
          CGT method: FIFO. 50% discount applies to disposals held &gt; 365 days (s115-100 ITAA97). Cost base includes brokerage per ATO rules.
        </p>
      </div>

      {isLocked && (
        <UpgradePrompt
          feature="Full CGT History"
          description="Access CGT reports for all financial years. Free plan shows the current FY only."
        />
      )}
    </div>
  );
}
