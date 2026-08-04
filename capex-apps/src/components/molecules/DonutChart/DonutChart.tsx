import React, { useMemo } from 'react';

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
  valueFormatter?: (value: number) => string;
  embedded?: boolean;
}

const CX = 100;
const CY = 100;
const PIE_R = 60;
const TICK_R = 72;
const HORIZONTAL = 18;

function polar(r: number, degFromTop: number) {
  const rad = ((degFromTop - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function pieSlicePath(startDeg: number, endDeg: number): string {
  if (endDeg - startDeg >= 359.999) {
    return `M ${CX} ${CY} m -${PIE_R} 0 a ${PIE_R} ${PIE_R} 0 1 0 ${PIE_R * 2} 0 a ${PIE_R} ${PIE_R} 0 1 0 -${PIE_R * 2} 0`;
  }
  const p1 = polar(PIE_R, startDeg);
  const p2 = polar(PIE_R, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${PIE_R} ${PIE_R} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function isRightSide(deg: number): boolean {
  const n = ((deg % 360) + 360) % 360;
  return n < 180;
}

function calloutForSlice(midDeg: number, name: string) {
  const edge = polar(PIE_R, midDeg);
  const elbow = polar(TICK_R, midDeg);
  const right = isRightSide(midDeg);
  const tipX = right ? elbow.x + HORIZONTAL : elbow.x - HORIZONTAL;
  return {
    points: `${edge.x},${edge.y} ${elbow.x},${elbow.y} ${tipX},${elbow.y}`,
    textX: right ? tipX + 4 : tipX - 4,
    textY: elbow.y,
    textAnchor: right ? ('start' as const) : ('end' as const),
    name,
  };
}

/** Upper-right callout — readable for single-slice pies */
const SINGLE_SLICE_LABEL_DEG = 35;

export const DonutChart: React.FC<DonutChartProps> = ({ title, data, valueFormatter, embedded = false }) => {
  const formatValue = valueFormatter ?? ((value: number) => String(value));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const slices = useMemo(() => {
    if (total === 0) return [];
    let cursor = 0;
    const active = data.filter((item) => item.value > 0);
    const singleSlice = active.length === 1;

    return active.map((item) => {
      const pct = (item.value / total) * 100;
      const sweep = (item.value / total) * 360;
      const startDeg = cursor;
      const endDeg = cursor + sweep;
      const midDeg = singleSlice ? SINGLE_SLICE_LABEL_DEG : startDeg + sweep / 2;
      cursor = endDeg;
      return {
        ...item,
        pct,
        path: pieSlicePath(startDeg, endDeg),
        callout: calloutForSlice(midDeg, item.name),
      };
    });
  }, [data, total]);

  const chartBody =
    total === 0 ? (
      <p className="text-sm text-siloam-text-secondary text-center py-8">Belum ada data.</p>
    ) : (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 min-h-0">
        <div className="relative w-full max-w-[400px] aspect-square shrink-0">
          <svg viewBox="-28 -28 256 256" className="w-full h-full overflow-visible">
            {slices.map((item, index) => (
              <path
                key={`slice-${index}`}
                d={item.path}
                fill={item.color}
                stroke="#222"
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
            ))}
            <circle cx={CX} cy={CY} r={PIE_R} fill="none" stroke="#222" strokeWidth={1.2} pointerEvents="none" />
            {slices.map((item, index) => (
              <g key={`callout-${index}`}>
                <polyline
                  points={item.callout.points}
                  fill="none"
                  stroke="#222"
                  strokeWidth={1}
                />
                <text
                  x={item.callout.textX}
                  y={item.callout.textY}
                  textAnchor={item.callout.textAnchor}
                  dominantBaseline="middle"
                  fill="#222"
                  fontSize={14}
                  fontFamily="system-ui, sans-serif"
                >
                  {item.callout.name}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-1 w-full px-3">
          {data.map((item, index) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            const active = item.value > 0;
            return (
              <div
                key={index}
                className={`flex items-center gap-1.5 text-sm tabular-nums ${
                  active ? 'text-siloam-text-primary font-medium' : 'text-siloam-text-secondary/45'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10"
                  style={{ backgroundColor: item.color }}
                />
                {active ? (
                  <span>{pct.toFixed(0)}% · {formatValue(item.value)}</span>
                ) : (
                  <span>{item.name} 0%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

  if (embedded) {
    return chartBody;
  }

  return (
    <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full flex flex-col border border-siloam-border/60 min-h-[400px]">
      <h3 className="text-base font-bold text-siloam-text-primary mb-2 shrink-0">{title}</h3>
      {chartBody}
    </div>
  );
};

DonutChart.displayName = 'DonutChart';
