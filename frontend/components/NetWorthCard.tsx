import { NetWorthSnapshot } from "@/lib/api";
import { formatAUD } from "@/lib/format";

interface Props {
  snapshot: NetWorthSnapshot | null;
}

function StatRow({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-t border-slate-800">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-red-400" : "text-slate-200"}`}>
        {formatAUD(value)}
      </span>
    </div>
  );
}

export default function NetWorthCard({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="card col-span-full">
        <p className="text-slate-500 text-sm">Could not load net worth — is the backend running?</p>
      </div>
    );
  }

  return (
    <div className="card col-span-full xl:col-span-1">
      <p className="stat-label mb-1">Total Net Worth</p>
      <p className="stat-value text-3xl">{formatAUD(snapshot.net_worth)}</p>

      <div className="mt-4 space-y-0">
        <StatRow label="Total Assets"      value={snapshot.total_assets} />
        <StatRow label="ETFs"              value={snapshot.etf_value} />
        <StatRow label="Shares"            value={snapshot.shares_value} />
        <StatRow label="Managed Funds"     value={snapshot.managed_fund_value} />
        <StatRow label="Crypto"            value={snapshot.crypto_value} />
        <StatRow label="Cash"              value={snapshot.cash_value} />
        <StatRow label="Super"             value={snapshot.super_value} />
        <StatRow label="Property (Equity)" value={snapshot.property_value} />
        <StatRow label="Other Assets"      value={snapshot.other_assets_value} />
        <StatRow label="Liabilities"       value={-snapshot.total_liabilities} highlight />
      </div>
    </div>
  );
}
