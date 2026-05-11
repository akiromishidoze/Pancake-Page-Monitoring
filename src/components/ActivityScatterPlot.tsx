'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

import { SlimPage } from '@/lib/receiver';

interface ActivityScatterPlotProps {
  activePages: SlimPage[];
  inactivePages: SlimPage[];
}

export function ActivityScatterPlot({ activePages, inactivePages }: ActivityScatterPlotProps) {
  // Helper to calculate hours ago
  const getHoursAgo = (dateStr: string | null) => {
    if (!dateStr) return 24; // boundary for nulls
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const hours = diffMs / (1000 * 60 * 60);
    // Cap at 24 hours to keep the plot readable
    return hours > 24 ? 24 : hours;
  };

  const processData = (pages: SlimPage[], status: 'Active' | 'Inactive') => {
    return pages.map(p => ({
      id: p.id || p.page_id || p.name, // Fallback to name if id is completely missing
      name: p.name,
      status,
      hoursSinceActivity: getHoursAgo(p.last_customer_activity_at ?? null),
      hoursSinceOrder: getHoursAgo(p.last_order_at ?? null),
    }));
  };

  const activeData = processData(activePages || [], 'Active');
  const inactiveData = processData(inactivePages || [], 'Inactive');

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-lg text-sm">
          <p className="font-semibold text-white mb-1">{data.name}</p>
          <p className="text-slate-300">Status: <span className={data.status === 'Active' ? 'text-green-400' : 'text-slate-400'}>{data.status}</span></p>
          <p className="text-slate-300">Inactive since: {data.hoursSinceActivity >= 24 ? '24+ hrs' : `${data.hoursSinceActivity.toFixed(1)} hrs`}</p>
          <p className="text-slate-300">No order since: {data.hoursSinceOrder >= 24 ? '24+ hrs' : `${data.hoursSinceOrder.toFixed(1)} hrs`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 flex flex-col h-[400px]">
      <h3 className="text-sm font-medium text-slate-400 uppercase mb-4">
        Page Health Timeline
      </h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              type="number" 
              dataKey="hoursSinceActivity" 
              name="Hours Since Activity" 
              stroke="#64748b"
              tickFormatter={(val) => val >= 24 ? '24+' : val.toFixed(0)}
              domain={[0, 24]}
              label={{ value: 'Hours Since Customer Activity', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 12 }}
            />
            <YAxis 
              type="number" 
              dataKey="hoursSinceOrder" 
              name="Hours Since Order" 
              stroke="#64748b"
              tickFormatter={(val) => val >= 24 ? '24+' : val.toFixed(0)}
              domain={[0, 24]}
              label={{ value: 'Hours Since Last Order', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Legend verticalAlign="top" height={36} />
            <Scatter name="Active Pages" data={activeData} fill="#22c55e" opacity={0.8} />
            <Scatter name="Inactive Pages" data={inactiveData} fill="#64748b" opacity={0.8} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
