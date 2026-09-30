'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { History, Search, Download, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight, formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function MovementsPage() {
  const transactions = dataStore.getInventoryTransactions();
  const [search, setSearch] = useState('');

  const filtered = transactions.filter(t => 
    t.lot_number?.toLowerCase().includes(search.toLowerCase()) ||
    t.transaction_type.toLowerCase().includes(search.toLowerCase()) ||
    t.reference_display?.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const exportData = filtered.map(t => ({
      'Date': t.transaction_date,
      'Transaction Type': t.transaction_type,
      'Lot Number': t.lot_number,
      'Quantity (KG)': t.quantity,
      'Reference Details': t.reference_display || t.remarks
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Movements');
    XLSX.writeFile(wb, `Movement_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Inventory Movement Ledger</h1>
          <p className="text-xs text-slate-500">Immutable transaction log tracking inbound receipts, allocations, sales, and adjustments</p>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Export Ledger Excel</span>
        </button>
      </div>

      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions by lot, type, reference..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        <span className="text-slate-600 font-medium">
          Total Movements: <strong className="text-slate-900">{filtered.length}</strong>
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Transaction Type</th>
              <th className="table-header">Lot Number</th>
              <th className="table-header">Reference Transaction</th>
              <th className="table-header text-right">Movement Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="table-cell text-slate-600">{formatDate(t.transaction_date)}</td>
                <td className="table-cell">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {t.transaction_type}
                  </span>
                </td>
                <td className="table-cell">
                  <Link href={`/inventory/lots?q=${t.lot_number}`} className="font-mono font-bold text-slate-900 hover:text-blue-600">
                    {t.lot_number}
                  </Link>
                </td>
                <td className="table-cell font-medium text-slate-700">{t.reference_display || t.remarks}</td>
                <td className={`table-cell text-right font-bold text-sm ${t.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t.quantity >= 0 ? `+${formatWeight(t.quantity)}` : formatWeight(t.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
