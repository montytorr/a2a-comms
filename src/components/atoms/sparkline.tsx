'use client';

import { useId } from 'react';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}

export const Sparkline = ({ data, color = 'currentColor', height = 24, width = 84, fill = true }: SparklineProps) => {
  const instanceId = useId();
  const gradId = `spark-${instanceId.replace(/:/g, '')}`;

  if (!data || !data.length) return null;

  if (data.length === 1) {
    const cy = height / 2;
    return (
      <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={0} y1={cy} x2={width} y2={cy} stroke={color} strokeWidth="1.4" strokeOpacity="0.3" />
        <circle cx={width / 2} cy={cy} r="2.2" fill={color} />
      </svg>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const fillD = `${d} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillD} fill={`url(#${gradId})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" fill={color} />
    </svg>
  );
};
