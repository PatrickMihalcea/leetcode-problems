import { useMemo, useState } from 'react';
import { useContainerWidth } from './useContainerWidth';
import { niceMax } from './niceScale';
import type { ChartPoint } from '../../lib/completionStats';

interface TrendChartProps {
  data: ChartPoint[];
  color: string;
  height?: number;
  valueLabel?: string;
}

const MARGIN = { top: 12, right: 16, bottom: 24, left: 36 };

export default function TrendChart({ data, color, height = 220, valueLabel = 'solved' }: TrendChartProps) {
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const maxValue = data.length ? Math.max(...data.map((d) => d.value)) : 0;
  const { max, step } = niceMax(maxValue);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);

  const xFor = (i: number) => (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerWidth);
  const yFor = (v: number) => (max === 0 ? innerHeight : innerHeight - (v / max) * innerHeight);

  const linePath = useMemo(() => {
    if (!data.length || innerWidth <= 0) return '';
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(d.value).toFixed(2)}`).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, innerWidth, innerHeight, max]);

  const areaPath = linePath ? `${linePath} L ${xFor(data.length - 1).toFixed(2)} ${innerHeight} L 0 ${innerHeight} Z` : '';

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    if (!data.length || innerWidth <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / innerWidth) * (data.length - 1));
    setHoverIdx(Math.min(data.length - 1, Math.max(0, idx)));
  }

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const anchorX = hoverIdx !== null ? MARGIN.left + xFor(hoverIdx) : 0;
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

            {areaPath && <path d={areaPath} fill={color} opacity={0.12} stroke="none" />}
            {linePath && (
              <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}

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

            {hovered && hoverIdx !== null && (
              <>
                <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={0} y2={innerHeight} className="chart-crosshair" />
                <circle cx={xFor(hoverIdx)} cy={yFor(hovered.value)} r={5} fill={color} stroke="var(--bg-panel)" strokeWidth={2} />
              </>
            )}

            <rect
              x={0}
              y={0}
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHoverIdx(null)}
            />
          </g>
        </svg>
      )}

      {hovered && hoverIdx !== null && (
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
