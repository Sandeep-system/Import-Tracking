'use client';

import React from 'react';
import Link from 'next/link';
import { Anchor, Search, MapPin, Truck, Calendar, ShoppingBag } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatDate, formatWeight } from '@/lib/utils';

export default function ShipmentsPage() {
  const allPOs = dataStore.getPurchaseOrders().filter(p => !p.is_closed);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Shipments, Ports & Logistics</h1>
        <p className="text-xs text-slate-500">Track inbound maritime shipments, bill of ladings (BL), containers, and discharge ports</p>
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
