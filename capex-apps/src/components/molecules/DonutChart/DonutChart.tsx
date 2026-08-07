import React, { useMemo } from 'react';

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
  valueFormatter?: (value: number) => string;
  /** Render chart body only — parent supplies the card shell */
  embedded?: boolean;
  /** callout = labels with leader lines (wide cards); legend = pie + legend only */
  labelMode?: 'callout' | 'legend';
  /** Smaller pie for 1/3-width dashboard panels */
  compact?: boolean;
}

const CX = 100;
const CY = 100;

function polar(r: number, degFromTop: number) {
  const rad = ((degFromTop - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function pieSlicePath(pieR: number, startDeg: number, endDeg: number): string {
  if (endDeg - startDeg >= 359.999) {
    return `M ${CX} ${CY} m -${pieR} 0 a ${pieR} ${pieR} 0 1 0 ${pieR * 2} 0 a ${pieR} ${pieR} 0 1 0 -${pieR * 2} 0`;
  }
  const p1 = polar(pieR, startDeg);
  const p2 = polar(pieR, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${pieR} ${pieR} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function isRightSide(deg: number): boolean {
  const n = ((deg % 360) + 360) % 360;
  return n < 180;
}

function calloutForSlice(pieR: number, tickR: number, horizontal: number, midDeg: number, name: string) {
  const edge = polar(pieR, midDeg);
  const elbow = polar(tickR, midDeg);
  const right = isRightSide(midDeg);
  const tipX = right ? elbow.x + horizontal : elbow.x - horizontal;
  return {
    points: `${edge.x},${edge.y} ${elbow.x},${elbow.y} ${tipX},${elbow.y}`,
    textX: right ? tipX + 4 : tipX - 4,
    textY: elbow.y,
    textAnchor: right ? ('start' as const) : ('end' as const),
    name,
  };
}

const SINGLE_SLICE_LABEL_DEG = 35;

export const DonutChart: React.FC<DonutChartProps> = ({
  title,
  data,
  valueFormatter,
  embedded = false,
  labelMode = 'callout',
  compact = false,
}) => {
  const formatValue = valueFormatter ?? ((value: number) => String(value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const pieR = compact ? 54 : 60;
  const tickR = pieR + 12;
  const horizontal = compact ? 14 : 18;
  const showCallouts = labelMode === 'callout';
  const maxSize = compact ? 'max-w-[220px]' : 'max-w-[400px]';

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
        path: pieSlicePath(pieR, startDeg, endDeg),
        callout: calloutForSlice(pieR, tickR, horizontal, midDeg, item.name),
      };
    });
  }, [data, total, pieR, tickR, horizontal]);

  const chartBody =
    total === 0 ? (
      <p className="text-sm text-siloam-text-secondary text-center py-8">Belum ada data.</p>
    ) : (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-0 w-full">
        <div className={`relative w-full ${maxSize} aspect-square shrink-0 mx-auto`}>
          <svg viewBox="-28 -28 256 256" className="w-full h-full overflow-hidden">
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
            <circle cx={CX} cy={CY} r={pieR} fill="none" stroke="#222" strokeWidth={1.2} pointerEvents="none" />
            {showCallouts
              ? slices.map((item, index) => (
                  <g key={`callout-${index}`}>
                    <polyline points={item.callout.points} fill="none" stroke="#222" strokeWidth={1} />
                    <text
                      x={item.callout.textX}
                      y={item.callout.textY}
                      textAnchor={item.callout.textAnchor}
                      dominantBaseline="middle"
                      fill="#222"
                      fontSize={compact ? 11 : 14}
                      fontFamily="system-ui, sans-serif"
                    >
                      {item.name}
                    </text>
                  </g>
                ))
              : null}
          </svg>
        </div>
        <div
          className={`flex flex-wrap justify-center items-start gap-x-4 gap-y-2 w-full px-1 ${
            compact ? 'flex-col items-stretch max-h-36 overflow-y-auto' : ''
          }`}
        >
          {data.map((item, index) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            const active = item.value > 0;
            return (
              <div
                key={index}
                className={`flex items-center gap-2 tabular-nums min-w-0 ${
                  compact ? 'text-xs' : 'text-sm'
                } ${active ? 'text-siloam-text-primary font-medium' : 'text-siloam-text-secondary/45'}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate min-w-0" title={item.name}>
                  {active ? (
                    <>
                      <span className="font-semibold">{item.name}</span>
                      {' · '}
                      {pct.toFixed(0)}%
                      {valueFormatter ? ` · ${formatValue(item.value)}` : null}
                    </>
                  ) : (
                    `${item.name} 0%`
                  )}
                </span>
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
    <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full flex flex-col border border-siloam-border/60 min-h-[400px] overflow-hidden">
      <h3 className="text-base font-bold text-siloam-text-primary mb-2 shrink-0">{title}</h3>
      {chartBody}
    </div>
  );
};

DonutChart.displayName = 'DonutChart';
