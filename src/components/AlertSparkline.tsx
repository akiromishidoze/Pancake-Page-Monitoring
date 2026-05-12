'use client';

type RunSample = { alert_count: number; generated_at: string };

export function AlertSparkline({ runs, height = 40, width = 160 }: { runs: RunSample[]; height?: number; width?: number }) {
  if (runs.length < 2) return null;

  const values = runs.map(r => r.alert_count ?? 0);
  const maxV = Math.max(...values, 1);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = Math.round(i * step);
    const y = Math.round(height - (v / maxV) * (height - 4) - 2);
    return `${x},${y}`;
  });

  const hasAlerts = values.some(v => v > 0);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="rounded bg-slate-800/20">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={hasAlerts ? '#ef4444' : '#22c55e'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        if (!v) return null;
        const [x, y] = points[i].split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r="2.5" fill="#ef4444" />;
      })}
    </svg>
  );
}
