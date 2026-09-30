'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Search, Download, Users, Truck, DollarSign } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight, formatCurrency, formatDate } from '@/lib/utils';

export default function SalesPage() {
  const customers = dataStore.getCustomers();
  const lots = dataStore.getLots();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sales & Customer Allocations</h1>
          <p className="text-xs text-slate-500">Manage internal allocations (SE, BM) and customer sales invoices with lot traceability</p>
        </div>
      </div>

      {/* Allocation Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Internal Stock (Sandeep Edgetech - Self)</span>
          <span className="text-xl font-bold text-slate-900">
            {formatWeight(lots.reduce((acc, l) => acc + l.available_qty, 0))}
          </span>
          <p className="text-[11px] text-slate-500">Unrestricted inventory available for Sandeep Edgetech internal processing & stock</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Trading Division Allocation (BM)</span>
          <span className="text-xl font-bold text-indigo-700">0.000 KG</span>
          <p className="text-[11px] text-slate-500">Allocated to back-to-back trading orders</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Direct Customer Dispatches</span>
          <span className="text-xl font-bold text-emerald-600">0.000 KG</span>
          <p className="text-[11px] text-slate-500">Billed against commercial sales invoices</p>
        </div>
      </div>

      {/* Recent Allocations / Sales Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Lot Allocation Registry</h2>
          <span className="text-[11px] text-slate-400">All landed lots mapped to customer designations</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr>
                <th className="table-header">Lot Number</th>
                <th className="table-header">Material Spec</th>
                <th className="table-header">Source PO</th>
                <th className="table-header">Primary Allocation</th>
                <th className="table-header text-right">Available Weight</th>
                <th className="table-header text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lots.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="table-cell font-mono font-bold text-slate-900">{l.lot_number}</td>
                  <td className="table-cell font-medium text-slate-800">{l.grade_code} ({l.section_name})</td>
                  <td className="table-cell font-bold text-blue-600">PO {l.po_number}</td>
                  <td className="table-cell">
                    <span className="font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Sandeep Edgetech (Self)
                    </span>
                  </td>
                  <td className="table-cell text-right font-bold text-emerald-600 text-sm">{formatWeight(l.available_qty)}</td>
                  <td className="table-cell text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      In Stock
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
