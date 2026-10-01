'use client';

import React from 'react';
import Link from 'next/link';
import { Anchor, Search, MapPin, Truck, Calendar, ShoppingBag, Ship, ArrowRight } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatDate, formatWeight } from '@/lib/utils';

export default function ShipmentsPage() {
  const allPOs = dataStore.getPurchaseOrders().filter(p => !p.is_closed);
  const incSummary = dataStore.getIncomingStockSummary();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Shipments, Ports & Logistics</h1>
          <p className="text-xs text-slate-500">Track inbound maritime shipments, bill of ladings (BL), containers, and discharge ports</p>
        </div>

        <Link
          href="/purchasing/incoming-stock"
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors"
        >
          <Ship className="h-4 w-4" />
          <span>View In-Transit Stock Board ({incSummary.totalInTransitItems} items)</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Linked Logistics Banner */}
      <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-lg text-blue-200">
            <Ship className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-blue-200 uppercase tracking-wider">Live Sea-Port Logistics Linked</div>
            <div className="text-sm font-extrabold text-white mt-0.5">
              {formatWeight(incSummary.totalInTransitWeight)} in transit across {incSummary.uniqueTransitLots} lots
            </div>
            <p className="text-[11px] text-blue-200/80 mt-0.5">
              Directly synced from <code className="bg-white/10 px-1 rounded font-mono">INCOMING STOCK.xlsx</code> • Primary discharge at Nhava Sheva (N.S.)
            </p>
          </div>
        </div>
        <Link
          href="/purchasing/incoming-stock"
          className="px-3.5 py-1.5 bg-white text-blue-900 hover:bg-blue-50 font-bold text-xs rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto shadow-sm"
        >
          Open In-Transit Logistics →
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Anchor className="h-4 w-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Port Shipments ({allPOs.length})</h2>
          </div>
          <span className="text-[11px] text-slate-400">Primary Discharge: Nhava Sheva (N.S.)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr>
                <th className="table-header">PO Number</th>
                <th className="table-header">Supplier</th>
                <th className="table-header">Destination Port</th>
                <th className="table-header">Delivery Terms</th>
                <th className="table-header">Order Confirmation #</th>
                <th className="table-header">Expected Port Arrival</th>
                <th className="table-header text-right">Pending Cargo (KG)</th>
                <th className="table-header text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allPOs.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50">
                  <td className="table-cell font-bold text-blue-600">
                    <Link href={`/purchasing/purchase-orders/${po.po_number}`}>
                      PO {po.po_number}
                    </Link>
                  </td>
                  <td className="table-cell font-medium text-slate-800">{po.supplier_name}</td>
                  <td className="table-cell">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <MapPin className="h-3 w-3 text-red-500" />
                      {po.destination || 'N.S.'}
                    </span>
                  </td>
                  <td className="table-cell font-mono text-slate-600">{po.delivery_terms || 'FOB'}</td>
                  <td className="table-cell font-mono text-slate-700">{po.oc_number || '—'}</td>
                  <td className="table-cell text-slate-600">{formatDate(po.expected_delivery_date)}</td>
                  <td className="table-cell text-right font-bold text-blue-700">{formatWeight(po.total_balance_qty)}</td>
                  <td className="table-cell text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      In Transit / Pending
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
