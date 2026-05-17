'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { SlimPage } from '@/lib/db';

interface PageWaterfallChartProps {
  activePages: SlimPage[];
  inactivePages: SlimPage[];
}

export function PageWaterfallChart({ activePages, inactivePages }: PageWaterfallChartProps) {
  // Support both `kind` and `activity_kind` fields from receiver payloads
  const funnelCount = activePages.filter(p => (p.activity_kind ?? p.kind) === 'funnel_converting').length;
  const chatCount = activePages.filter(p => (p.activity_kind ?? p.kind) === 'chat_only').length;
  const directCount = activePages.filter(p => (p.activity_kind ?? p.kind) === 'direct_orders_only').length;
  const inactiveCount = inactivePages.length;
  
  const totalCount = funnelCount + chatCount + directCount + inactiveCount;

  // If there's no data at all, show a friendly placeholder instead of an empty chart
  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 flex items-center justify-center h-[400px]">
        <div className="text-slate-400 text-sm">No page activity data</div>
      </div>
    );
  }

  // Build categories and filter out zero-valued buckets so they don't appear in legend/colors
  const categories = [
    { key: 'funnel', label: 'Funnel', count: funnelCount, fill: '#22c55e' },
    { key: 'chat', label: 'Chat Only', count: chatCount, fill: '#84cc16' },
    { key: 'direct', label: 'Direct Orders', count: directCount, fill: '#14b8a6' },
    { key: 'inactive', label: 'Inactive', count: inactiveCount, fill: '#64748b' },
  ];

  const visibleCats = categories.filter((c) => c.count > 0);
  let cum = 0;
  const data = visibleCats.map((c) => {
    const item = { name: `${c.label} (${c.count})`, base: cum, val: c.count, fill: c.fill };
    cum += c.count;
    return item;
  });

  // Always include a total bar for context
  data.push({ name: 'Total', base: 0, val: totalCount, fill: '#3b82f6' });

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<Record<string, unknown>> }) => {
    if (active && payload && payload.length) {
      const valPayload = payload.find((p) => (p as Record<string, unknown>).dataKey === 'val');
      if (!valPayload) return null;
      const p = valPayload.payload as Record<string, unknown>;

      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-lg text-sm">
          <p className="font-semibold text-white mb-1">{p.name as string}</p>
          <p className="text-slate-300">
            Count:{' '}
            <span style={{ color: p.fill as string, fontWeight: 'bold' }}>
              {valPayload.value as number}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 flex flex-col h-[400px]">
      <h3 className="text-sm font-medium text-slate-400 uppercase mb-4">
        Page Activity Buildup
      </h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b' }} />
            {/* The transparent base pushes the top bar to the correct height */}
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="val" stackId="a">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
