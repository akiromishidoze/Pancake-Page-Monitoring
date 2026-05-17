'use client';

import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Series = {
  label: string;
  data: { time: string; active: number; inactive: number; total: number }[];
};

const RANGES = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

export function ActiveTrendChart({ series }: { series: Series[] }) {
  const [range, setRange] = useState(1);

  const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444'];

  if (series.length === 0) return null;

  const filtered = useMemo(() => {
    const cutoff = Date.now() - RANGES[range].ms;
    return series.map(s => ({
      ...s,
      data: s.data.filter(d => new Date(d.time).getTime() >= cutoff),
    }));
  }, [series, range]);

  const chartData = useMemo(() => {
    const merged = new Map<string, Record<string, number>>();
    const timestamps = new Set<string>();

    for (const s of series) {
      const cutoff = Date.now() - RANGES[range].ms;
      for (const d of s.data) {
        if (new Date(d.time).getTime() < cutoff) continue;
        const key = d.time.slice(0, 16);
        timestamps.add(key);
        if (!merged.has(key)) merged.set(key, {});
        merged.get(key)![`${s.label}_active`] = d.active;
        merged.get(key)![`${s.label}_total`] = d.total;
      }
    }

    return Array.from(timestamps).sort().map(t => {
      const row: Record<string, string | number> = { time: t };
      const values = merged.get(t);
      if (values) {
        for (const key of Object.keys(values)) {
          row[key] = values[key];
        }
      }
      return row;
    });
  }, [series, range]);

  const isEmpty = chartData.length === 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-medium text-slate-400 uppercase">Active Pages Over Time</h3>
        <div className="ml-auto flex gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRange(i)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                i === range
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {isEmpty ? (
        <p className="text-xs text-slate-500">No data for the selected time range.</p>
      ) : (
        <div className="w-full">
          <ResponsiveContainer width="100%" height={300} key={`chart-${range}`}>
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
      )}
    </div>
  );
}
