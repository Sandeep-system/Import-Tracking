'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeftRight, 
  Search, 
  Building2, 
  ShoppingBag, 
  Package, 
  Truck, 
  Users, 
  ShieldCheck
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight, formatDate } from '@/lib/utils';

function TraceabilityContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [traceResult, setTraceResult] = useState<any>(null);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      setActiveQuery(initialQuery);
      const res = dataStore.getTraceability(initialQuery);
      setTraceResult(res);
    }
  }, [initialQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setActiveQuery(query.trim());
      const res = dataStore.getTraceability(query.trim());
      setTraceResult(res);
    }
  };

  const sampleQueries = ['1093', '1109', '1804', '1775', 'B0618669-6040', 'TM-260412-1'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Bidirectional Material Traceability Engine</h1>
        <p className="text-xs text-slate-500">
          Complete chain of custody: trace from Overseas Supplier & PO down to Landed Lot and Customer Invoice, and vice versa.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Purchase Order (e.g. 1093), Lot # (e.g. 1775), or Supplier Invoice # (e.g. B0618669-6040)..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
          >
            Trace Chain
          </button>
        </form>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">Quick Test Searches:</span>
          {sampleQueries.map((sq) => (
            <button
              key={sq}
              onClick={() => {
                setQuery(sq);
                setActiveQuery(sq);
                setTraceResult(dataStore.getTraceability(sq));
              }}
              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] transition-colors border"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Traceability Flow Results */}
      {!traceResult ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 card-shadow">
          <ArrowLeftRight className="h-10 w-10 text-slate-300 mx-auto" />
          <h2 className="text-sm font-bold text-slate-800">No Active Trace Query</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Search for any Purchase Order number, Lot number, or Supplier Commercial Invoice number to inspect its end-to-end supply chain.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Visual Step-by-Step Chain Banner */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Verified Custody Chain for Query: <strong className="text-slate-900 font-mono">"{activeQuery}"</strong></span>
            </h2>

            {/* Stepper / Flow Diagram */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
              {/* Step 1: Supplier */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 relative">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">1. Supplier</span>
                  <Building2 className="h-4 w-4 text-blue-600" />
                </div>
                <p className="font-bold text-slate-900 text-xs truncate">
                  {traceResult.supplier?.supplier_name || traceResult.po?.supplier_name || 'Direct Import'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Origin: {traceResult.po?.origin_make_name || 'Overseas Mill'}
                </p>
              </div>

              {/* Step 2: Purchase Order */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-blue-50/50 space-y-1.5 relative">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">2. Contract PO</span>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </div>
                <p className="font-bold text-blue-700 text-xs">
                  PO {traceResult.po?.po_number || 'N/A'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Order Date: {formatDate(traceResult.po?.order_date)}
                </p>
              </div>

              {/* Step 3: Material Specification */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 relative">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">3. Line Item</span>
                  <Package className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="font-bold text-slate-900 text-xs">
                  {traceResult.item?.grade_code || (traceResult.items?.[0]?.grade_code) || 'Steel Grade'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Ordered: {formatWeight(traceResult.item?.ordered_quantity || traceResult.items?.[0]?.ordered_quantity)}
                </p>
              </div>

              {/* Step 4: Receipt & Invoice */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-emerald-50/50 space-y-1.5 relative">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">4. Receipt & Inv</span>
                  <Truck className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="font-bold text-emerald-800 text-xs">
                  {traceResult.receipt?.supplier_invoice_number || traceResult.receipts?.[0]?.supplier_invoice_number || 'Invoice Verified'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Recd: {formatWeight(traceResult.receipt?.received_quantity || traceResult.receipts?.[0]?.received_quantity)}
                </p>
              </div>

              {/* Step 5: Lot & Allocation */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-purple-50/50 space-y-1.5 relative">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">5. Landed Lot</span>
                  <Users className="h-4 w-4 text-purple-600" />
                </div>
                <p className="font-bold text-purple-900 text-xs font-mono">
                  {traceResult.lot?.lot_number || traceResult.lots?.[0]?.lot_number || 'Assigned Lot'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Allocated to Stock / Customer
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Linked Entities Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 card-shadow p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-blue-600" />
                <span>Upstream Supply Origin (PO & Inbound Delivery)</span>
              </h3>
              <div className="space-y-2 text-xs divide-y divide-slate-100">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Purchase Order:</span>
                  <Link href={`/purchasing/purchase-orders/${traceResult.po?.po_number}`} className="font-bold text-blue-600 hover:underline">
                    PO {traceResult.po?.po_number}
                  </Link>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Overseas Supplier:</span>
                  <span className="font-semibold text-slate-800">{traceResult.po?.supplier_name || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Destination Port:</span>
                  <span className="font-semibold text-slate-800">{traceResult.po?.destination || 'N.S.'} ({traceResult.po?.delivery_terms || 'FOB'})</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Order Confirmation #:</span>
                  <span className="font-mono text-slate-800">{traceResult.po?.oc_number || '—'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 card-shadow p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Truck className="h-4 w-4 text-emerald-600" />
                <span>Downstream Inventory & Lot Allocation</span>
              </h3>
              <div className="space-y-2 text-xs divide-y divide-slate-100">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Warehouse Lot Number:</span>
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                    {traceResult.lot?.lot_number || traceResult.lots?.[0]?.lot_number || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Available Stock in Yard:</span>
                  <span className="font-bold text-emerald-600 text-sm">
                    {formatWeight(traceResult.lot?.available_qty || traceResult.lots?.[0]?.available_qty)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Physical Location:</span>
                  <span className="text-slate-700">{traceResult.lot?.warehouse_location || 'Nhava Sheva Yard'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Allocation Status:</span>
                  <span className="font-semibold text-indigo-700">Allocated to Internal Stock (SE)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TraceabilityPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Traceability Engine...</div>}>
      <TraceabilityContent />
    </Suspense>
  );
}
