'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Truck, 
  Search, 
  Download, 
  Layers, 
  History, 
  ArrowLeftRight, 
  X,
  Building2,
  PackageCheck,
  PackageOpen
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { Lot, InventoryTransaction } from '@/types';
import { formatWeight, formatDate, getStatusBadgeClass } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function LotsPage() {
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [lotHistory, setLotHistory] = useState<InventoryTransaction[]>([]);

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const lots = dataStore.getLots(search);

  const handleInspectLot = (lot: Lot) => {
    setSelectedLot(lot);
    const history = dataStore.getLotHistory(lot.id);
    setLotHistory(history);
  };

  const handleExport = () => {
    const exportData = lots.map(l => ({
      'Lot Number': l.lot_number,
      'PO Number': l.po_number,
      'Supplier': l.supplier_name,
      'Grade': l.grade_code,
      'Section': l.section_name,
      'Dimensions': l.dimensions_display,
      'Total Received (KG)': l.total_received_qty,
      'Allocated / Sold (KG)': l.total_allocated_sold_qty,
      'Available Qty (KG)': l.available_qty,
      'Location': l.warehouse_location,
      'Status': l.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lots Inventory');
    XLSX.writeFile(wb, `Lot_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Lot-Based Warehouse Inventory</h1>
          <p className="text-xs text-slate-500">Track landed lots, physical warehouse locations, allocations, and stock ledger</p>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Export Excel</span>
        </button>
      </div>

      {/* Search and KPI Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lot number, steel grade, supplier, PO..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-4 text-slate-600">
          <span>Active Lots: <strong className="text-slate-900">{lots.length}</strong></span>
          <span>•</span>
          <span>
            Total Stock in Yard: <strong className="text-emerald-600">
              {formatWeight(lots.reduce((acc, l) => acc + l.available_qty, 0))}
            </strong>
          </span>
        </div>
      </div>

      {/* Lots Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-header">Lot Number</th>
                <th className="table-header">Purchase Order</th>
                <th className="table-header">Supplier</th>
                <th className="table-header">Steel Grade</th>
                <th className="table-header">Section</th>
                <th className="table-header">Dimensions</th>
                <th className="table-header text-right">Received Qty</th>
                <th className="table-header text-right">Allocated / Sold</th>
                <th className="table-header text-right">Available Qty</th>
                <th className="table-header">Warehouse Location</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-right">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {lots.map((lot) => (
                <tr 
                  key={lot.id} 
                  onClick={() => handleInspectLot(lot)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                >
                  <td className="table-cell">
                    <span className="px-2.5 py-1 rounded font-mono font-bold text-xs bg-slate-900 text-white shadow-sm">
                      {lot.lot_number}
                    </span>
                  </td>
                  <td className="table-cell">
                    <Link 
                      href={`/purchasing/purchase-orders/${lot.po_number}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-blue-600 hover:underline"
                    >
                      PO {lot.po_number}
                    </Link>
                  </td>
                  <td className="table-cell font-medium text-slate-700 truncate max-w-[150px]">{lot.supplier_name}</td>
                  <td className="table-cell font-bold text-slate-800">{lot.grade_code}</td>
                  <td className="table-cell text-slate-600">{lot.section_name}</td>
                  <td className="table-cell font-mono text-slate-600">{lot.dimensions_display}</td>
                  <td className="table-cell text-right font-medium text-slate-700">{formatWeight(lot.total_received_qty)}</td>
                  <td className="table-cell text-right font-medium text-slate-500">{formatWeight(lot.total_allocated_sold_qty)}</td>
                  <td className="table-cell text-right font-bold text-emerald-600 text-sm">
                    {formatWeight(lot.available_qty)}
                  </td>
                  <td className="table-cell text-slate-600">{lot.warehouse_location}</td>
                  <td className="table-cell text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(lot.status)}`}>
                      {lot.status}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInspectLot(lot);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto"
                    >
                      <History className="h-3.5 w-3.5" />
                      <span>Ledger</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lot Movement Ledger Modal */}
      {selectedLot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-600 text-white">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Lot Movement History: {selectedLot.lot_number}</h2>
                  <p className="text-xs text-slate-400">Inventory transactions and material traceability</p>
                </div>
              </div>
              <button onClick={() => setSelectedLot(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-700">
              {/* Lot Summary Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Steel Spec</span>
                  <span className="font-bold text-slate-900">{selectedLot.grade_code} ({selectedLot.section_name})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Source PO</span>
                  <span className="font-bold text-blue-600">PO {selectedLot.po_number}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Landed</span>
                  <span className="font-bold text-slate-900">{formatWeight(selectedLot.total_received_qty)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Current Balance</span>
                  <span className="font-bold text-emerald-600">{formatWeight(selectedLot.available_qty)}</span>
                </div>
              </div>

              {/* Ledger Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-blue-600" />
                  <span>Audit Movement Ledger</span>
                </h3>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="table-header">Date</th>
                        <th className="table-header">Type</th>
                        <th className="table-header">Reference</th>
                        <th className="table-header text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {lotHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400">
                            No ledger movements recorded for this lot yet.
                          </td>
                        </tr>
                      ) : (
                        lotHistory.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50">
                            <td className="table-cell text-slate-600">{formatDate(tx.transaction_date)}</td>
                            <td className="table-cell">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {tx.transaction_type}
                              </span>
                            </td>
                            <td className="table-cell font-medium text-slate-700">{tx.reference_display || tx.remarks}</td>
                            <td className={`table-cell text-right font-bold text-sm ${tx.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {tx.quantity >= 0 ? `+${formatWeight(tx.quantity)}` : formatWeight(tx.quantity)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-3 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLot(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
