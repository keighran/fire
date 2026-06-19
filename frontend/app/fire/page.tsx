import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import FIREChart from "@/components/FIREChart";
import UpgradePrompt from "@/components/UpgradePrompt";
import { formatAUD } from "@/lib/format";
import { ApiError } from "@/lib/api";

export const metadata = { title: "FIRE Projection — WealthTrack AU" };

export default async function FIREPage() {
  const token = await getAuthToken();

  let inputs: Record<string, number | null> | null = null;
  let result = null;
  let isLocked = false;

  try {
    inputs = await api.getFIREInputs(token);
    if (inputs) result = await api.fireProjection(token, inputs).catch(() => null);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) isLocked = true;
  }

  if (isLocked) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">FIRE 🔥 Projection</h1>
        <UpgradePrompt
          feature="FIRE Projection Engine"
          description="Model your path to Financial Independence with compound growth projections, drawdown modelling, and interactive FIRE date estimates."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">FIRE 🔥 Projection</h1>

      {result && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card text-center">
            <p className="stat-label mb-1">FIRE Number</p>
            <p className="text-xl font-semibold text-blue-400">{formatAUD(result.fire_number)}</p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">Years to FIRE</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {result.already_fire ? "You're FIRE! ✅" : (result.years_to_fire ?? "—")}
            </p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">FIRE Date</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{result.fire_date_year ?? "—"}</p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">Current Shortfall</p>
            <p className="text-xl font-semibold text-red-400">
              {result.already_fire ? "—" : formatAUD(result.current_shortfall)}
            </p>
          </div>
        </div>
      )}

      <FIREChart trajectory={result?.trajectory ?? []} fireNumber={result?.fire_number ?? 0} />

      <div className="card">
        <p className="stat-label mb-3">Assumptions</p>
        {inputs ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-slate-500">Return Rate</span><br /><span className="text-slate-800 dark:text-slate-200">{(((inputs.investment_return_rate ?? 0) as number) * 100).toFixed(1)}%</span></div>
            <div><span className="text-slate-500">Inflation</span><br /><span className="text-slate-800 dark:text-slate-200">{(((inputs.inflation_rate ?? 0) as number) * 100).toFixed(1)}%</span></div>
            <div><span className="text-slate-500">SWR</span><br /><span className="text-slate-800 dark:text-slate-200">{(((inputs.safe_withdrawal_rate ?? 0) as number) * 100).toFixed(1)}%</span></div>
            <div><span className="text-slate-500">Annual Spend</span><br /><span className="text-slate-800 dark:text-slate-200">{formatAUD((inputs.target_annual_spend ?? 0) as number)}</span></div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Configure FIRE assumptions in Settings.</p>
        )}
      </div>
    </div>
  );
}
