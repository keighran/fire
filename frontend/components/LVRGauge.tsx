"use client";

/**
 * LVR (Loan-to-Value Ratio) gauge using a filled SVG arc.
 * Zones: green < 60 %, amber 60–80 %, red > 80 %
 */

interface Props {
  lvr: number; // 0–100
  size?: number;
}

function arcPath(pct: number, size: number) {
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -180;
  const endAngle   = startAngle + Math.min(pct / 100, 1) * 180;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export default function LVRGauge({ lvr, size = 140 }: Props) {
  const clamped = Math.max(0, Math.min(lvr, 100));
  const color   = clamped < 60 ? "#10b981" : clamped < 80 ? "#f59e0b" : "#f43f5e";
  const label   = clamped < 60 ? "Conservative" : clamped < 80 ? "Moderate" : "High Risk";
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        {/* Background track */}
        <path
          d={arcPath(100, size)}
          fill="none"
          stroke="#1e293b"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={arcPath(clamped, size)}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Zone markers */}
        {[60, 80].map((mark) => {
          const angle = -180 + (mark / 100) * 180;
          const rad = (angle * Math.PI) / 180;
          const x = cx + r * Math.cos(rad);
          const y = cy + r * Math.sin(rad);
          return <circle key={mark} cx={x} cy={y} r={3} fill="#334155" />;
        })}
        {/* Centre text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize={20} fontWeight={700}>
          {clamped.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize={10}>
          LVR
        </text>
      </svg>
      <span className="text-xs font-medium mt-1" style={{ color }}>{label}</span>
    </div>
  );
}
