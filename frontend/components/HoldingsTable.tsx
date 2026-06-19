import { Holding } from "@/lib/api";
import { formatAUD, formatPct, formatUnits, gainColour } from "@/lib/format";

interface Props { holdings: Holding[] }

export default function HoldingsTable({ holdings }: Props) {
  const sorted = [...holdings].sort((a, b) => b.market_value - a.market_value);

  return (
    <div className="card">
      <p className="stat-label mb-3">Portfolio Holdings</p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th text-left">Asset</th>
              <th className="table-th">Class</th>
              <th className="table-th">Units</th>
              <th className="table-th">Live Price</th>
              <th className="table-th">Avg Cost</th>
              <th className="table-th">Market Value</th>
              <th className="table-th">Unrealised P&amp;L</th>
              <th className="table-th">Ann. Return</th>
              <th className="table-th">Div Yield</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 text-sm py-8">
                  No holdings — add transactions to get started.
                </td>
              </tr>
            )}
            {sorted.map((h) => (
              <tr key={h.ticker} className="hover:bg-slate-800/40 transition-colors">
                <td className="table-td text-left">
                  <span className="font-medium text-slate-100">{h.ticker}</span>
                  <span className="block text-xs text-slate-500 truncate max-w-[180px]">{h.name}</span>
                  {h.is_retirement && (
                    <span className="text-[10px] text-purple-400 font-medium">SUPER</span>
                  )}
                </td>
                <td className="table-td">
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                    {h.asset_class}
                  </span>
                </td>
                <td className="table-td text-slate-300">{formatUnits(h.total_units)}</td>
                <td className="table-td text-slate-300">{formatAUD(h.current_price)}</td>
                <td className="table-td text-slate-400">{formatAUD(h.weighted_avg_cost)}</td>
                <td className="table-td font-medium text-slate-100">{formatAUD(h.market_value)}</td>
                <td className={`table-td font-medium ${gainColour(h.unrealised_gain)}`}>
                  {formatAUD(h.unrealised_gain)}
                  <span className="block text-xs">{formatPct(h.unrealised_gain_pct)}</span>
                </td>
                <td className={`table-td ${gainColour(h.annualised_return_pct)}`}>
                  {formatPct(h.annualised_return_pct)}
                </td>
                <td className="table-td text-slate-400">
                  {h.dividend_yield_on_cost > 0 ? formatPct(h.dividend_yield_on_cost) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} className="text-xs text-slate-500 pt-3">Total</td>
                <td className="table-td font-semibold text-slate-100">
                  {formatAUD(sorted.reduce((s, h) => s + h.market_value, 0))}
                </td>
                <td className={`table-td font-semibold ${gainColour(sorted.reduce((s, h) => s + h.unrealised_gain, 0))}`}>
                  {formatAUD(sorted.reduce((s, h) => s + h.unrealised_gain, 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
