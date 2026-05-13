'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ActiveDonutChartProps {
  activeCount: number;
  inactiveCount: number;
}

export function ActiveDonutChart({ activeCount, inactiveCount }: ActiveDonutChartProps) {
  const data = [
    { name: 'Active', value: activeCount },
    { name: 'Inactive', value: inactiveCount },
  ];

  const COLORS = ['#22c55e', '#64748b'];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 flex flex-col h-[400px]">
      <h3 className="text-sm font-medium text-slate-400 uppercase mb-4">
        Page Activity Distribution
      </h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
              itemStyle={{ color: '#f8fafc' }}
            />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
