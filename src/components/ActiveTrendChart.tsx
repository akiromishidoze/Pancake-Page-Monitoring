'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Series = {
  label: string;
  data: { time: string; active: number; inactive: number; total: number }[];
};

export function ActiveTrendChart({ series }: { series: Series[] }) {
  if (series.length === 0) return null;

  const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444'];

  const merged = new Map<string, Record<string, number>>();
  const timestamps = new Set<string>();

  for (const s of series) {
    for (const d of s.data) {
      const key = d.time.slice(0, 16);
      timestamps.add(key);
      if (!merged.has(key)) merged.set(key, {});
      merged.get(key)![`${s.label}_active`] = d.active;
      merged.get(key)![`${s.label}_total`] = d.total;
    }
  }

  const chartData = Array.from(timestamps).sort().map(t => {
    const row: Record<string, string | number> = { time: t };
    const values = merged.get(t);
    if (values) {
      for (const key of Object.keys(values)) {
        row[key] = values[key];
      }
    }
    return row;
  });

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-400 uppercase mb-4">Active Pages Over Time</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#334155" />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#334155" allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
              itemStyle={{ color: '#f8fafc' }}
            />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            {series.map((s, i) => (
              <Line
                key={s.label}
                type="monotone"
                dataKey={`${s.label}_active`}
                name={s.label}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
