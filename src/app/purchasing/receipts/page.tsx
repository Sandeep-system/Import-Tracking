'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Package, 
  Search, 
  Download, 
  Plus, 
  Truck, 
  Building2, 
  Layers, 
  FileText,
  AlertTriangle,
  Edit2,
  Trash2,
  X
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { Receipt } from '@/types';
import { formatWeight, formatDate } from '@/lib/utils';
import { AddReceiptModal } from '@/components/AddReceiptModal';
import { EditReceiptModal } from '@/components/EditReceiptModal';
import { useAuth } from '@/context/AuthContext';
import * as XLSX from 'xlsx';

export default function ReceiptsPage() {
  const { isViewer } = useAuth();
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [isAddReceiptOpen, setIsAddReceiptOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<Receipt | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const allReceipts = React.useMemo(() => dataStore.getReceipts(), [dataVersion]);
  const allPOs = React.useMemo(() => dataStore.getPurchaseOrders(), [dataVersion]);

  // Unique PO options
  const uniquePOs = React.useMemo(() => {
    const set = new Set(allReceipts.map(r => r.po_number).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allReceipts]);

  // Unique Suppliers
  const uniqueSuppliers = React.useMemo(() => {
    const set = new Set(allPOs.map(p => p.supplier_name).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allPOs]);

  // Supplier lookup by PO number
  const poSupplierMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const po of allPOs) {
      if (po.po_number && po.supplier_name) {
        map.set(po.po_number, po.supplier_name);
      }
    }
    return map;
  }, [allPOs]);
  
  const filteredReceipts = React.useMemo(() => {
    return allReceipts.filter(rc => {
      if (search) {
        const q = search.toLowerCase();
        const matches = (
          rc.receipt_number.toLowerCase().includes(q) ||
          rc.po_number?.toLowerCase().includes(q) ||
          rc.supplier_invoice_number?.toLowerCase().includes(q) ||
          rc.lot_number?.toLowerCase().includes(q) ||
          rc.remarks?.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }

      if (selectedPO !== 'ALL' && rc.po_number !== selectedPO) {
        return false;
      }

      if (selectedSupplier !== 'ALL') {
        const sup = rc.po_number ? poSupplierMap.get(rc.po_number) : '';
        if (sup !== selectedSupplier) return false;
      }

      return true;
    });
  }, [allReceipts, search, selectedPO, selectedSupplier, poSupplierMap]);

  const totalPages = Math.ceil(filteredReceipts.length / pageSize) || 1;
  const paginated = filteredReceipts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = () => {
    const exportData = filteredReceipts.map(rc => ({
      'Receipt #': rc.receipt_number,
      'PO Number': rc.po_number,
      'Receipt Date': rc.receipt_date,
      'Supplier Invoice #': rc.supplier_invoice_number,
      'Invoice Date': rc.supplier_invoice_date,
      'Lot Number': rc.lot_number,
      'Received Qty (KG)': rc.received_quantity,
      'Raw Formula': rc.raw_formula,
      'Remarks': rc.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Physical Receipts');
    XLSX.writeFile(wb, `Receipts_Log_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDeleteReceipt = (receipt: Receipt) => {
    try {
      dataStore.deleteReceipt(receipt.id);
      setDeletingReceipt(null);
      setDataVersion(v => v + 1);
    } catch (err: any) {
      alert(err.message || 'Failed to delete receipt');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Physical Receipts Log</h1>
          <p className="text-xs text-slate-500">Every inbound delivery transaction against import purchase orders</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export Excel</span>
          </button>

          {!isViewer && (
            <button
              onClick={() => setIsAddReceiptOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record New Receipt</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Receipt#, PO#, Invoice#, Lot#..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <select
            value={selectedPO}
            onChange={(e) => {
              setSelectedPO(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Purchase Orders ({uniquePOs.length})</option>
            {uniquePOs.map(po => (
              <option key={po} value={po}>PO #{po}</option>
            ))}
          </select>

          <select
            value={selectedSupplier}
            onChange={(e) => {
              setSelectedSupplier(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Suppliers ({uniqueSuppliers.length})</option>
            {uniqueSuppliers.map(sup => (
              <option key={sup} value={sup}>{sup}</option>
            ))}
          </select>

          {(search !== '' || selectedPO !== 'ALL' || selectedSupplier !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedPO('ALL');
                setSelectedSupplier('ALL');
                setCurrentPage(1);
              }}
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-slate-600 font-medium">
          <span>Transactions: <strong className="text-slate-900">{filteredReceipts.length}</strong></span>
          <span>•</span>
          <span>
            Total Received: <strong className="text-emerald-600">{formatWeight(filteredReceipts.reduce((acc, r) => acc + (Number(r.received_quantity) || 0), 0))}</strong>
          </span>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="table-header">Receipt #</th>
                <th className="table-header">Receipt Date</th>
                <th className="table-header">Purchase Order</th>
                <th className="table-header">Supplier Invoice #</th>
                <th className="table-header">Invoice Date</th>
                <th className="table-header">Assigned Lot</th>
                <th className="table-header text-right">Received Quantity</th>
                <th className="table-header">Formula Audit</th>
                <th className="table-header">Remarks</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    No receipts found matching your query.
                  </td>
                </tr>
              ) : (
                paginated.map((rc) => (
                  <tr key={rc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="table-cell font-mono font-bold text-slate-900">{rc.receipt_number}</td>
                    <td className="table-cell text-slate-600">{formatDate(rc.receipt_date)}</td>
                    <td className="table-cell">
                      <Link 
                        href={`/purchasing/purchase-orders/${rc.po_number}`}
                        className="font-bold text-blue-600 hover:underline"
                      >
                        PO {rc.po_number}
                      </Link>
                    </td>
                    <td className="table-cell font-mono font-semibold text-slate-700">
                      {rc.supplier_invoice_number || '—'}
                    </td>
                    <td className="table-cell text-slate-500">{formatDate(rc.supplier_invoice_date)}</td>
                    <td className="table-cell">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200">
                        {rc.lot_number || 'UNASSIGNED'}
                      </span>
                    </td>
                    <td className="table-cell text-right font-bold text-emerald-600 text-sm">
                      {formatWeight(rc.received_quantity)}
                    </td>
                    <td className="table-cell text-[11px] font-mono text-slate-400">
                      {rc.raw_formula ? (
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                          {rc.raw_formula}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-cell text-slate-500 truncate max-w-[200px]">{rc.remarks || '—'}</td>
                    <td className="table-cell text-right">
                      {isViewer ? (
                        <span className="text-[11px] text-slate-400 italic font-medium px-2 py-0.5">View Only</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingReceipt(rc)}
                            title="Edit Receipt"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingReceipt(rc)}
                            title="Delete Receipt"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredReceipts.length)}</strong> of <strong>{filteredReceipts.length}</strong> receipts
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded border bg-white hover:bg-slate-100 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="px-2 font-medium">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded border bg-white hover:bg-slate-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <AddReceiptModal
        isOpen={isAddReceiptOpen}
        onClose={() => setIsAddReceiptOpen(false)}
        onReceiptAdded={() => setDataVersion(v => v + 1)}
      />

      <EditReceiptModal
        isOpen={!!editingReceipt}
        receipt={editingReceipt}
        onClose={() => setEditingReceipt(null)}
        onReceiptUpdated={() => {
          setDataVersion(v => v + 1);
          setEditingReceipt(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deletingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Physical Receipt?</h3>
                <p className="text-xs text-slate-500">Receipt #{deletingReceipt.receipt_number}</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2 text-rose-800">
              <p>
                Are you sure you want to delete receipt <strong>{deletingReceipt.receipt_number}</strong> for{' '}
                <strong>{formatWeight(deletingReceipt.received_quantity)}</strong> against PO{' '}
                <strong>{deletingReceipt.po_number}</strong>?
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-700">
                <li>Deducts <strong>{formatWeight(deletingReceipt.received_quantity)}</strong> from Lot <strong>{deletingReceipt.lot_number}</strong></li>
                <li>Restores <strong>{formatWeight(deletingReceipt.received_quantity)}</strong> pending balance on PO item</li>
                <li>Removes the corresponding inventory ledger transaction</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingReceipt(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteReceipt(deletingReceipt)}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
              >
                Yes, Delete Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
