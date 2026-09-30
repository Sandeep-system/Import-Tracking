'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Layers, Search, Download, Truck, PackageCheck } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function StockPage() {
  const lots = dataStore.getLots();
  const [search, setSearch] = useState('');

  // Group by Grade and Section
  const specMap: Record<string, {
    grade: string;
    section: string;
    lotsCount: number;
    totalLanded: number;
    totalAvailable: number;
    dimensions: Set<string>;
  }> = {};

  for (const l of lots) {
    const key = `${l.grade_code}__${l.section_name}`;
    if (!specMap[key]) {
      specMap[key] = {
        grade: l.grade_code || 'Other',
        section: l.section_name || 'Standard',
        lotsCount: 0,
        totalLanded: 0,
        totalAvailable: 0,
        dimensions: new Set()
      };
    }
    specMap[key].lotsCount++;
    specMap[key].totalLanded += l.total_received_qty;
    specMap[key].totalAvailable += l.available_qty;
    if (l.dimensions_display) specMap[key].dimensions.add(l.dimensions_display);
  }

  const specsList = Object.values(specMap).filter(s =>
    s.grade.toLowerCase().includes(search.toLowerCase()) ||
    s.section.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const exportData = specsList.map(s => ({
      'Steel Grade': s.grade,
      'Product Section': s.section,
      'Lots Count': s.lotsCount,
      'Total Landed Weight (KG)': s.totalLanded,
      'Available Stock (KG)': s.totalAvailable,
      'Active Dimensions': Array.from(s.dimensions).join(', ')
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock By Spec');
    XLSX.writeFile(wb, `Stock_By_Spec_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Available Stock by Specification</h1>
          <p className="text-xs text-slate-500">Aggregated physical inventory grouped by steel grade, product profile, and dimensions</p>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Export Stock Excel</span>
        </button>
      </div>

      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by steel grade or section..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        <span className="text-slate-600 font-medium">
          Total Material in Yard: <strong className="text-emerald-600">{formatWeight(lots.reduce((acc, l) => acc + l.available_qty, 0))}</strong>
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr>
              <th className="table-header">Steel Grade</th>
              <th className="table-header">Section Profile</th>
              <th className="table-header text-center">Active Lots</th>
              <th className="table-header text-right">Total Landed Qty</th>
              <th className="table-header text-right">Available in Yard</th>
              <th className="table-header">Active Dimension Sizes</th>
              <th className="table-header text-right">Inspect Lots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {specsList.map((s, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="table-cell font-bold text-slate-900">{s.grade}</td>
                <td className="table-cell font-semibold text-slate-700">{s.section}</td>
                <td className="table-cell text-center">
                  <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-800 border">
                    {s.lotsCount} Lots
                  </span>
                </td>
                <td className="table-cell text-right font-medium text-slate-700">{formatWeight(s.totalLanded)}</td>
                <td className="table-cell text-right font-bold text-emerald-600 text-sm">{formatWeight(s.totalAvailable)}</td>
                <td className="table-cell text-slate-500 font-mono text-[11px] truncate max-w-xs">
                  {Array.from(s.dimensions).slice(0, 3).join(', ')}
                  {s.dimensions.size > 3 ? ` +${s.dimensions.size - 3} more` : ''}
                </td>
                <td className="table-cell text-right">
                  <Link
                    href={`/inventory/lots?q=${encodeURIComponent(s.grade)}`}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    View Lots →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
