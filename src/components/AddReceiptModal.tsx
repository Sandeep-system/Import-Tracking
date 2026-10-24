'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, PackagePlus, AlertCircle } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { PurchaseOrder, PurchaseOrderItem } from '@/types';
import { formatWeight, formatDate } from '@/lib/utils';

interface AddReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReceiptAdded?: () => void;
  defaultPoId?: string;
  defaultItemId?: string;
}

export function AddReceiptModal({
  isOpen,
  onClose,
  onReceiptAdded,
  defaultPoId,
  defaultItemId
}: AddReceiptModalProps) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>(defaultPoId || '');
  const [selectedItemId, setSelectedItemId] = useState<string>(defaultItemId || '');
  
  // Form fields
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receivedQty, setReceivedQty] = useState<string>('');
  const [pieces, setPieces] = useState<string>('1');
  const [supplierInvoice, setSupplierInvoice] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [lotNumber, setLotNumber] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  
  // Validation & Warnings
  const [error, setError] = useState<string | null>(null);
  const [showOverReceiptConfirm, setShowOverReceiptConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const pos = dataStore.getPurchaseOrders().filter(p => !p.is_closed);
      setPurchaseOrders(pos);
      if (defaultPoId) {
        setSelectedPoId(defaultPoId);
      } else if (pos.length > 0 && !selectedPoId) {
        setSelectedPoId(pos[0].id);
      }
    }
  }, [isOpen, defaultPoId]);

  useEffect(() => {
    if (selectedPoId) {
      const po = purchaseOrders.find(p => p.id === selectedPoId || p.po_number === selectedPoId);
      if (po && po.items && po.items.length > 0) {
        if (defaultItemId && po.items.some(i => i.id === defaultItemId)) {
          setSelectedItemId(defaultItemId);
        } else {
          setSelectedItemId(po.items[0].id);
        }
      } else {
        setSelectedItemId('');
      }
    }
  }, [selectedPoId, purchaseOrders, defaultItemId]);

  useEffect(() => {
    if (selectedItemId && selectedPoId) {
      const po = purchaseOrders.find(p => p.id === selectedPoId || p.po_number === selectedPoId);
      const it = po?.items?.find(i => i.id === selectedItemId);
      if (it) {
        if (it.lot_number) setLotNumber(it.lot_number);
        if (it.pieces) setPieces(String(it.pieces));
      }
    }
  }, [selectedItemId, selectedPoId, purchaseOrders]);

  if (!isOpen) return null;

  const currentPo = purchaseOrders.find(p => p.id === selectedPoId || p.po_number === selectedPoId);
  const currentItem = currentPo?.items?.find(i => i.id === selectedItemId);

  const numReceived = parseFloat(receivedQty) || 0;
  const currentPending = currentItem?.balance_quantity ?? 0;
  const newPending = currentPending - numReceived;
  const isOverReceipt = numReceived > currentPending;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!selectedPoId || !selectedItemId) {
      setError('Please select a Purchase Order and PO Item.');
      return;
    }
    if (numReceived <= 0) {
      setError('Received quantity must be greater than 0 KG.');
      return;
    }
    if (!lotNumber.trim()) {
      setError('Please provide a Lot Number.');
      return;
    }
    if (!supplierInvoice.trim()) {
      setError('Please enter the Supplier Commercial Invoice number.');
      return;
    }

    if (isOverReceipt && !showOverReceiptConfirm) {
      setShowOverReceiptConfirm(true);
      return;
    }

    try {
      setIsSubmitting(true);
      dataStore.addReceipt({
        poId: selectedPoId,
        itemId: selectedItemId,
        receiptDate,
        receivedQuantity: numReceived,
        pieces: parseInt(pieces, 10) || 1,
        supplierInvoice: supplierInvoice.trim(),
        supplierInvoiceDate: invoiceDate,
        lotNumber: lotNumber.trim(),
        remarks: remarks.trim() || undefined
      });

      setIsSubmitting(false);
      setShowOverReceiptConfirm(false);
      onClose();
      if (onReceiptAdded) onReceiptAdded();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || 'Failed to save receipt.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600">
              <PackagePlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Record Material Ready (Ready to Ship)</h2>
              <p className="text-xs text-slate-400">Record ready quantity & lot details against PO Line Item</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 space-y-4 text-xs text-slate-700 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* PO & Item Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Select Purchase Order *</label>
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {purchaseOrders.map((po, idx) => (
                  <option key={`${po.id}-${idx}`} value={po.id}>
                    PO {po.po_number} — {po.supplier_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Select PO Item Specification *</label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {currentPo?.items?.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.line_number}: {item.grade_code} {item.section_name} ({item.diameter_width}x{item.thickness || '—'} mm)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Real-Time Item Quantity Specs */}
          {currentItem && (
            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Ordered Qty</span>
                <span className="text-xs font-bold text-slate-800">{formatWeight(currentItem.ordered_quantity)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Already Ready</span>
                <span className="text-xs font-bold text-emerald-600">{formatWeight(currentItem.received_quantity)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Current Pending</span>
                <span className={`text-xs font-bold ${(currentItem.balance_quantity ?? 0) < 0 ? 'text-purple-700' : 'text-blue-600'}`}>
                  {formatWeight(currentItem.balance_quantity)}
                </span>
              </div>
            </div>
          )}

          {/* Receipt Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ready Quantity (KG) *</label>
              <input
                type="number"
                step="any"
                required
                value={receivedQty}
                onChange={(e) => {
                  setReceivedQty(e.target.value);
                  setShowOverReceiptConfirm(false);
                }}
                placeholder="e.g. 2000"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pieces (pc) *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={pieces}
                onChange={(e) => setPieces(e.target.value)}
                placeholder="e.g. 1"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Lot Number *</label>
              <input
                type="text"
                required
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="e.g. LOT-1849 or 1849"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Commercial Invoice *</label>
              <input
                type="text"
                required
                value={supplierInvoice}
                onChange={(e) => setSupplierInvoice(e.target.value)}
                placeholder="e.g. TM-260815"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                  setReceiptDate(e.target.value);
                }}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>


            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Remarks / Bundle Info</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. 4 bundles, wooden box packing"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Dynamic Balance Preview Card */}
          {numReceived > 0 && currentItem && (
            <div className="bg-blue-50/60 rounded-lg p-3.5 border border-blue-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider block">Calculation Preview</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-slate-600">Current Pending: <strong className="text-slate-800">{formatWeight(currentPending)}</strong></span>
                  <span className="text-slate-400">→</span>
                  <span className="text-blue-700">Receiving: <strong className="text-blue-900">{formatWeight(numReceived)}</strong></span>
                  <span className="text-slate-400">→</span>
                  <span className={newPending < 0 ? "text-purple-700 font-bold" : "text-emerald-700 font-bold"}>
                    New Pending: {formatWeight(newPending)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Over-Receipt Warning Banner */}
          {isOverReceipt && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">Over-Receipt Warning: Receipt exceeds pending balance</p>
                <p className="text-[11px] text-amber-800">
                  Receiving {formatWeight(numReceived)} will result in an over-receipt of{' '}
                  <strong>{formatWeight(Math.abs(newPending))}</strong> (New Balance: {formatWeight(newPending)}).
                  This is allowed for mill tolerances and packing variations.
                </p>
                {showOverReceiptConfirm && (
                  <p className="text-[11px] font-semibold text-amber-900 pt-1">
                    Click "Confirm Over-Receipt & Save" below to proceed.
                  </p>
                )}
              </div>
            </div>
          )}

          </div>

          {/* Modal Footer Buttons */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>

            {isOverReceipt && !showOverReceiptConfirm ? (
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
              >
                Review Over-Receipt
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : isOverReceipt ? 'Confirm Over-Receipt & Set Ready' : 'Confirm & Set Ready to Ship'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
