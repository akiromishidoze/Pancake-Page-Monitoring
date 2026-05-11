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
import { SlimPage } from '@/lib/receiver';

interface PageWaterfallChartProps {
  activePages: SlimPage[];
  inactivePages: SlimPage[];
}

export function PageWaterfallChart({ activePages, inactivePages }: PageWaterfallChartProps) {
  const funnelCount = activePages.filter(p => p.kind === 'funnel_converting').length;
  const chatCount = activePages.filter(p => p.kind === 'chat_only').length;
  const directCount = activePages.filter(p => p.kind === 'direct_orders_only').length;
  const inactiveCount = inactivePages.length;
  
  const totalCount = funnelCount + chatCount + directCount + inactiveCount;

  // Build the waterfall data
  // base is the transparent "bottom" bar that pushes the visible "val" bar up
  const data = [
    { name: 'Funnel', base: 0, val: funnelCount, fill: '#22c55e' }, // green-500
    { name: 'Chat Only', base: funnelCount, val: chatCount, fill: '#84cc16' }, // lime-500
    { name: 'Direct Orders', base: funnelCount + chatCount, val: directCount, fill: '#14b8a6' }, // teal-500
    { name: 'Inactive', base: funnelCount + chatCount + directCount, val: inactiveCount, fill: '#64748b' }, // slate-500
    { name: 'Total', base: 0, val: totalCount, fill: '#3b82f6' }, // blue-500
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      // payload[0] is the base (transparent)
      // payload[1] is the val
      const valPayload = payload.find((p: any) => p.dataKey === 'val');
      if (!valPayload) return null;
      
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-lg text-sm">
          <p className="font-semibold text-white mb-1">{valPayload.payload.name}</p>
          <p className="text-slate-300">
            Count:{' '}
            <span style={{ color: valPayload.payload.fill, fontWeight: 'bold' }}>
              {valPayload.value}
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
