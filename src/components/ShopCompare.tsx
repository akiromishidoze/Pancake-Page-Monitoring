'use client';

import React, { useMemo, useState } from 'react';
import { SlimPage } from '@/lib/receiver';

type Row = {
  page_id: string;
  shop: string | null;
  name: string | null;
  kind: string | null;
  is_activated: boolean;
  is_canary: boolean;
  reason: string | null;
  state_change: string | null;
};

export default function ShopCompare({ rows, shops }: { rows: Row[]; shops: string[] }) {
  const perShop = useMemo(() => {
    const map: Record<string, { total: number; active: number; inactive: number; kinds: Record<string, number> }> = {};
    for (const s of shops) {
      map[s] = { total: 0, active: 0, inactive: 0, kinds: {} };
    }
    for (const r of rows) {
      const shop = r.shop ?? '—';
      if (!map[shop]) map[shop] = { total: 0, active: 0, inactive: 0, kinds: {} };
      map[shop].total += 1;
      if (r.is_activated) map[shop].active += 1;
      else map[shop].inactive += 1;
      const k = r.kind ?? 'none';
      map[shop].kinds[k] = (map[shop].kinds[k] ?? 0) + 1;
    }
    return map;
  }, [rows, shops]);

  const [a, setA] = useState(shops[0] ?? '');
  const [b, setB] = useState(shops[1] ?? shops[0] ?? '');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-200 mb-2">Per-shop breakdown</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2">Shop</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Inactive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {Object.keys(perShop).map((shop) => (
                  <tr key={shop} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-200">{shop}</td>
                    <td className="px-3 py-2">{perShop[shop].total}</td>
                    <td className="px-3 py-2 text-green-300">{perShop[shop].active}</td>
                    <td className="px-3 py-2 text-red-300">{perShop[shop].inactive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-200 mb-2">Top kinds per shop</h4>
            <div className="space-y-2">
              {Object.keys(perShop).map((shop) => (
                <div key={`k-${shop}`} className="text-sm text-slate-300">
                  <div className="font-semibold text-slate-200">{shop}</div>
                  <div className="text-xs text-slate-400">
                    {Object.entries(perShop[shop].kinds)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' — ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-200 mb-2">Compare shops</h3>
        <div className="flex gap-3 items-center mb-3">
          <select value={a} onChange={(e) => setA(e.target.value)} className="bg-slate-800 border border-slate-700 text-slate-200 px-2 py-1 rounded">
            {shops.map((s) => (
              <option key={`a-${s}`} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-slate-400">vs</span>
          <select value={b} onChange={(e) => setB(e.target.value)} className="bg-slate-800 border border-slate-700 text-slate-200 px-2 py-1 rounded">
            {shops.map((s) => (
              <option key={`b-${s}`} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded">
            <div className="text-xs text-slate-400">{a}</div>
            <div className="text-lg font-bold">{perShop[a]?.total ?? 0} pages</div>
            <div className="text-sm text-slate-400">Active: <span className="font-semibold text-green-300">{perShop[a]?.active ?? 0}</span></div>
            <div className="text-sm text-slate-400">Inactive: <span className="font-semibold text-red-300">{perShop[a]?.inactive ?? 0}</span></div>
            <div className="text-xs text-slate-400 mt-2">Kinds: {Object.entries(perShop[a]?.kinds ?? {}).map(([k,v]) => `${k}:${v}`).join(', ')}</div>
          </div>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded">
            <div className="text-xs text-slate-400">{b}</div>
            <div className="text-lg font-bold">{perShop[b]?.total ?? 0} pages</div>
            <div className="text-sm text-slate-400">Active: <span className="font-semibold text-green-300">{perShop[b]?.active ?? 0}</span></div>
            <div className="text-sm text-slate-400">Inactive: <span className="font-semibold text-red-300">{perShop[b]?.inactive ?? 0}</span></div>
            <div className="text-xs text-slate-400 mt-2">Kinds: {Object.entries(perShop[b]?.kinds ?? {}).map(([k,v]) => `${k}:${v}`).join(', ')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
