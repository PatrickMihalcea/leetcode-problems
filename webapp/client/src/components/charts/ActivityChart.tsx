import { useState } from 'react';
import { useContainerWidth } from './useContainerWidth';
import { niceMax } from './niceScale';
import type { ChartPoint } from '../../lib/completionStats';

interface ActivityChartProps {
  data: ChartPoint[];
  color: string;
  height?: number;
  valueLabel?: string;
}

const MARGIN = { top: 12, right: 16, bottom: 24, left: 36 };
const MAX_BAR_WIDTH = 24;
const GAP = 2;

function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const radius = Math.min(r, w / 2, h);
  const top = y;
  const bottom = y + h;
  return `M ${x} ${bottom}
    L ${x} ${top + radius}
    Q ${x} ${top} ${x + radius} ${top}
    L ${x + w - radius} ${top}
    Q ${x + w} ${top} ${x + w} ${top + radius}
    L ${x + w} ${bottom}
    Z`;
}

export default function ActivityChart({ data, color, height = 180, valueLabel = 'solved' }: ActivityChartProps) {
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const maxValue = data.length ? Math.max(...data.map((d) => d.value)) : 0;
  const { max, step } = niceMax(maxValue);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);

  const slot = data.length ? innerWidth / data.length : 0;
  const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, slot - GAP));

  const yFor = (v: number) => (max === 0 ? innerHeight : innerHeight - (v / max) * innerHeight);

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const anchorX = hoverIdx !== null ? MARGIN.left + hoverIdx * slot + slot / 2 : 0;
  const tooltipLeft = Math.min(Math.max(anchorX, 70), Math.max(70, width - 70));

  return (
    <div className="chart-wrap" ref={containerRef} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="chart-svg">
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerWidth} y1={yFor(t)} y2={yFor(t)} className="chart-gridline" />
                <text x={-8} y={yFor(t)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                  {t.toLocaleString()}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const x = i * slot + (slot - barWidth) / 2;
              const y = yFor(d.value);
              const h = innerHeight - y;
              const isHover = hoverIdx === i;
              return (
                <g key={i}>
                  {h > 0 && (
                    <path d={roundedTopBarPath(x, y, barWidth, h, 4)} fill={color} opacity={isHover ? 1 : 0.85} />
                  )}
                  <rect
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={innerHeight}
                    fill="transparent"
                    onMouseMove={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                  />
                </g>
              );
            })}

            {data.length > 0 && (
              <>
                <text x={0} y={innerHeight + 18} className="chart-axis-label" textAnchor="start">
                  {data[0].label}
                </text>
                <text x={innerWidth} y={innerHeight + 18} className="chart-axis-label" textAnchor="end">
                  {data[data.length - 1].label}
                </text>
              </>
            )}
          </g>
        </svg>
      )}

      {hovered && (
        <div className="chart-tooltip" style={{ left: tooltipLeft, top: MARGIN.top + yFor(hovered.value) }}>
          <div className="chart-tooltip-value">
            <span className="chart-tooltip-key" style={{ background: color }} />
            {hovered.value.toLocaleString()} {valueLabel}
          </div>
          <div className="chart-tooltip-label">{hovered.fullLabel}</div>
        </div>
      )}
    </div>
  );
}
