import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { formatAUD, formatPct, gainColour } from "@/lib/format";
import BudgetBarChart from "@/components/BudgetBarChart";

export const metadata = { title: "Budget — WealthTrack AU" };

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function SavingsGauge({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(rate, 100));
  const color = clamped >= 30 ? "#10b981" : clamped >= 15 ? "#f59e0b" : "#f43f5e";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
      <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-xs">
        <span className="text-slate-500">Poor</span>
        <span className="font-semibold" style={{ color }}>{rate.toFixed(1)}%</span>
        <span className="text-slate-500">Excellent</span>
      </div>
    </div>
  );
}

export default async function BudgetPage() {
  const token = await getAuthToken();
  const now = new Date();

  const [summary, history, balances, liabilities, settings] = await Promise.all([
    api.getBudgetSummary(token, now.getFullYear(), now.getMonth() + 1).catch(() => null),
    api.getBudgetHistory(token, 12).catch(() => []),
    api.getCashBalances(token).catch(() => ({})),
    api.getLiabilities(token).catch(() => []),
    api.getSettings(token).catch(() => null),
  ]);

  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const emergencyFundTarget = settings
    ? Math.ceil(((summary?.total_expenses ?? 0) * settings.emergency_fund_months) / 1000) * 1000
    : 0;
  const totalCash = Object.values(balances).reduce((a, b) => a + b, 0);
  const emergencyPct = emergencyFundTarget > 0 ? Math.min((totalCash / emergencyFundTarget) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Budget</h1>
        <span className="text-sm text-slate-500">{monthLabel}</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="stat-label mb-1">Income</p>
          <p className="stat-value text-emerald-400">{formatAUD(summary?.total_income ?? 0)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Expenses</p>
          <p className="stat-value text-red-400">{formatAUD(summary?.total_expenses ?? 0)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Net Savings</p>
          <p className={`stat-value ${gainColour(summary?.net_savings ?? 0)}`}>
            {formatAUD(summary?.net_savings ?? 0)}
          </p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Savings Rate</p>
          <p className={`stat-value ${gainColour(summary?.savings_rate_pct ?? 0)}`}>
            {(summary?.savings_rate_pct ?? 0).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Savings rate gauge */}
      <div className="card">
        <p className="stat-label mb-4">Savings Rate — {monthLabel}</p>
        <SavingsGauge rate={summary?.savings_rate_pct ?? 0} />
        <p className="text-xs text-slate-600 mt-3">
          Target: 20%+ (good), 30%+ (excellent), 50%+ (FI/RE accelerator)
        </p>
      </div>

      {/* Monthly bar chart */}
      <BudgetBarChart data={history} />

      {/* Bottom row: emergency fund + cash + liabilities */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Emergency fund */}
        <div className="card">
          <p className="stat-label mb-3">Emergency Fund</p>
          {settings ? (
            <>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-400">Target ({settings.emergency_fund_months} months)</span>
                <span className="text-slate-200 font-medium">{formatAUD(emergencyFundTarget)}</span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-400">Current cash</span>
                <span className={`font-medium ${gainColour(totalCash - emergencyFundTarget)}`}>{formatAUD(totalCash)}</span>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${emergencyPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">{emergencyPct.toFixed(0)}% funded</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Configure in Settings to see your target.</p>
          )}
        </div>

        {/* Cash balances */}
        <div className="card">
          <p className="stat-label mb-3">Cash Accounts</p>
          {Object.keys(balances).length === 0 ? (
            <p className="text-sm text-slate-500">No cash accounts found.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(balances).map(([name, bal]) => (
                <div key={name} className="flex justify-between items-center py-1.5 border-t border-slate-800">
                  <span className="text-sm text-slate-400 truncate">{name}</span>
                  <span className={`text-sm font-medium ml-4 ${gainColour(bal)}`}>{formatAUD(bal)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 border-t border-slate-700 mt-1">
                <span className="text-sm font-semibold text-slate-300">Total Cash</span>
                <span className="text-sm font-semibold text-slate-200">{formatAUD(totalCash)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Liabilities */}
        <div className="card">
          <p className="stat-label mb-3">Liabilities</p>
          {liabilities.length === 0 ? (
            <p className="text-sm text-slate-500">No liabilities found.</p>
          ) : (
            <div className="space-y-4">
              {liabilities.map((lib) => (
                <div key={lib.account_name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">{lib.account_name}</span>
                    <span className="text-red-400 font-medium">{formatAUD(lib.remaining_balance)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${lib.progress_pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{lib.progress_pct.toFixed(0)}% repaid</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
