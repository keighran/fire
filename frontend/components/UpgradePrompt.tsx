import Link from "next/link";

interface Props {
  feature: string;
  requiredTier?: "pro" | "enterprise";
  description?: string;
  children?: React.ReactNode;
}

const TIER_LABEL: Record<string, string> = { pro: "Pro", enterprise: "Enterprise" };
const TIER_COLOR: Record<string, string> = {
  pro: "border-emerald-800 bg-emerald-950/40",
  enterprise: "border-violet-800 bg-violet-950/40",
};
const BUTTON_COLOR: Record<string, string> = {
  pro: "bg-emerald-600 hover:bg-emerald-500",
  enterprise: "bg-violet-600 hover:bg-violet-500",
};

export default function UpgradePrompt({
  feature,
  requiredTier = "pro",
  description,
  children,
}: Props) {
  const label = TIER_LABEL[requiredTier] ?? "Pro";
  const borderStyle = TIER_COLOR[requiredTier] ?? TIER_COLOR.pro;
  const btnStyle = BUTTON_COLOR[requiredTier] ?? BUTTON_COLOR.pro;

  return (
    <div className={`relative rounded-xl border ${borderStyle} p-8`}>
      {/* Blurred preview of locked content */}
      {children && (
        <div className="pointer-events-none select-none blur-sm opacity-40 mb-6">
          {children}
        </div>
      )}

      {/* Lock overlay */}
      <div className="flex flex-col items-center text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h3 className="text-white font-semibold text-lg mb-2">{feature}</h3>
        <p className="text-slate-400 text-sm mb-5 max-w-sm">
          {description ??
            `${feature} is available on the ${label} plan. Upgrade to unlock unlimited access.`}
        </p>
        <Link
          href="/pricing"
          className={`inline-block ${btnStyle} text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm`}
        >
          Upgrade to {label}
        </Link>
      </div>
    </div>
  );
}
