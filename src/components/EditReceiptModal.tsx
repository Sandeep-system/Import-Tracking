'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle2, PackageCheck } from 'lucide-react';
import { Receipt } from '@/types';
import { dataStore } from '@/lib/dataStore';
import { googleSync } from '@/lib/googleSync';
import { formatWeight, formatDate } from '@/lib/utils';

interface EditReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: Receipt | null;
  onReceiptUpdated?: () => void;
}

export function EditReceiptModal({
  isOpen,
  onClose,
  receipt,
  onReceiptUpdated
}: EditReceiptModalProps) {
  const [receivedQty, setReceivedQty] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('Nhava Sheva Yard');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (receipt) {
      setReceivedQty(String(receipt.received_quantity || ''));
      setLotNumber(receipt.lot_number || '');
      setSupplierInvoice(receipt.supplier_invoice_number || '');
      setInvoiceDate(receipt.supplier_invoice_date || receipt.receipt_date || new Date().toISOString().split('T')[0]);
      setRemarks(receipt.remarks || '');
      
      // Look up warehouse location from lot
      const lot = dataStore.getLots().find(l => l.lot_number.toLowerCase() === (receipt.lot_number || '').toLowerCase());
      setWarehouseLocation(lot?.warehouse_location || 'Nhava Sheva Yard');
      setError(null);
    }
  }, [receipt, isOpen]);

  if (!isOpen || !receipt) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = parseFloat(receivedQty);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid received quantity greater than 0 KG.');
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

    try {
      setIsSubmitting(true);
      const { updatedReceipt } = dataStore.updateReceipt(receipt.id, {
        receivedQuantity: qty,
        lotNumber: lotNumber.trim(),
        supplierInvoice: supplierInvoice.trim(),
        supplierInvoiceDate: invoiceDate,
        warehouseLocation: warehouseLocation.trim() || undefined,
        remarks: remarks.trim() || undefined
      });

      // Background sync to Google Sheets
      if (receipt.po_number) {
        googleSync.syncReceipts(receipt.po_number, [updatedReceipt]);
      }

      setIsSubmitting(false);
      onClose();
      if (onReceiptUpdated) onReceiptUpdated();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || 'Failed to update receipt.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Edit Receipt {receipt.receipt_number}</h3>
              <p className="text-xs text-slate-500">
                PO {receipt.po_number} • Originally received {formatWeight(receipt.received_quantity)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Received Quantity (KG) *</label>
              <input
                type="number"
                required
                step="any"
                min="0.1"
                value={receivedQty}
                onChange={(e) => setReceivedQty(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Assigned Lot Number *</label>
              <input
                type="text"
                required
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Commercial Invoice *</label>
              <input
                type="text"
                required
                value={supplierInvoice}
                onChange={(e) => setSupplierInvoice(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Warehouse Location</label>
            <input
              type="text"
              value={warehouseLocation}
              onChange={(e) => setWarehouseLocation(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Adjusted landed weight after container devanning"
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
