'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ShoppingBag, 
  Building2, 
  Calendar, 
  MapPin, 
  Plus, 
  Package, 
  Clock, 
  Layers, 
  History, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight,
  X,
  FileText,
  Trash2,
  Pencil,
  Split,
  ArrowRight,
  RotateCcw,
  CheckCircle,
  HelpCircle,
  PackageCheck
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { PurchaseOrder, PurchaseOrderItem, Receipt, BalanceResolution } from '@/types';
import { formatWeight, formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/utils';
import { AddReceiptModal } from '@/components/AddReceiptModal';
import { EditReceiptModal } from '@/components/EditReceiptModal';
import { googleSync } from '@/lib/googleSync';

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [selectedItem, setSelectedItem] = useState<PurchaseOrderItem | null>(null);
  const [isAddReceiptOpen, setIsAddReceiptOpen] = useState(false);
  const [targetItemId, setTargetItemId] = useState<string | undefined>(undefined);
  const [dataVersion, setDataVersion] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit / Delete Individual Receipt State
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<Receipt | null>(null);

  const handleDeleteReceipt = (receipt: Receipt) => {
    try {
      const { updatedPO } = dataStore.deleteReceipt(receipt.id);
      if (updatedPO) {
        googleSync.syncCreatePO(updatedPO);
      }
      setDeletingReceipt(null);
      setDataVersion(v => v + 1);
    } catch (err: any) {
      alert(err.message || 'Failed to delete receipt');
    }
  };

  // Resolve Balance Modal State
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [resolvingItem, setResolvingItem] = useState<PurchaseOrderItem | null>(null);
  const [resolveOption, setResolveOption] = useState<'KEEP_PENDING' | 'CARRY_FORWARD' | 'WAIVED' | 'MIXED'>('CARRY_FORWARD');
  const [cfQty, setCfQty] = useState('');
  const [waivedQty, setWaivedQty] = useState('');
  const [resolveReason, setResolveReason] = useState('Supplier production shortage accepted');
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [resolveExpDate, setResolveExpDate] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  // Edit PO Modal State
  const [isEditPoOpen, setIsEditPoOpen] = useState(false);
  const [editOrderDate, setEditOrderDate] = useState('');
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editDestination, setEditDestination] = useState('');
  const [editDeliveryTerms, setEditDeliveryTerms] = useState('FOB');
  const [editPaymentTerms, setEditPaymentTerms] = useState('');
  const [editOcNumber, setEditOcNumber] = useState('');
  const [editOcDate, setEditOcDate] = useState('');
  const [editExpDelivery, setEditExpDelivery] = useState('');
  const [editStatus, setEditStatus] = useState<PurchaseOrder['status']>('Open');
  const [editRemarks, setEditRemarks] = useState('');

  // Add Item to existing PO Modal State
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [itemGrade, setItemGrade] = useState('1.2311');
  const [itemGradeDoc, setItemGradeDoc] = useState('');
  const [itemSection, setItemSection] = useState('Plate');
  const [itemDiaW, setItemDiaW] = useState('');
  const [itemThk, setItemThk] = useState('');
  const [itemLen, setItemLen] = useState('');
  const [itemTreatment, setItemTreatment] = useState('Annealed');
  const [itemCondition, setItemCondition] = useState('BLACK ROLLED');
  const [itemQty, setItemQty] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemExpDelivery, setItemExpDelivery] = useState('');

  // Multi-item Selection & Bulk Receipt State
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isBulkReceiptOpen, setIsBulkReceiptOpen] = useState(false);
  const [bulkLotNumber, setBulkLotNumber] = useState('');
  const [bulkInvoiceNumber, setBulkInvoiceNumber] = useState('');
  const [bulkInvoiceDate, setBulkInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkWarehouseLocation, setBulkWarehouseLocation] = useState('Nhava Sheva Yard');
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [bulkMode, setBulkMode] = useState<'RECEIVE' | 'UPDATE'>('RECEIVE');
  const [bulkItemQuantities, setBulkItemQuantities] = useState<Record<string, number>>({});
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  const toggleSelectItem = (itemId: string) => {
    setSelectedItemIds(prev => 
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (!po?.items) return;
    if (selectedItemIds.length === po.items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(po.items.map(i => i.id));
    }
  };

  const handleOpenBulkReceipt = (mode: 'RECEIVE' | 'UPDATE' = 'RECEIVE') => {
    if (selectedItemIds.length === 0 || !po) return;
    setBulkMode(mode);
    setBulkError(null);

    // Auto-fill full ordered / pending quantity for each selected item
    const qtys: Record<string, number> = {};
    const defaultLot = `LOT-${po.po_number}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
    setBulkLotNumber(defaultLot);
    setBulkInvoiceNumber('');
    const todayStr = new Date().toISOString().split('T')[0];
    setBulkInvoiceDate(todayStr);
    setBulkWarehouseLocation('Nhava Sheva Yard');
    setBulkRemarks('');

    for (const itemId of selectedItemIds) {
      const it = po.items?.find(i => i.id === itemId);
      if (it) {
        const fillQty = (it.actionable_pending_qty ?? it.balance_quantity ?? it.ordered_quantity);
        qtys[itemId] = fillQty > 0 ? fillQty : it.ordered_quantity;
      }
    }
    setBulkItemQuantities(qtys);
    setIsBulkReceiptOpen(true);
  };

  const handleSubmitBulkReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!po) return;
    setBulkError(null);

    if (!bulkLotNumber.trim()) {
      setBulkError('Please enter a Lot Number.');
      return;
    }
    if (!bulkInvoiceNumber.trim()) {
      setBulkError('Please enter the Supplier Commercial Invoice number.');
      return;
    }

    try {
      setIsSubmittingBulk(true);
      if (bulkMode === 'RECEIVE') {
        const { receipts } = dataStore.addBulkReceipt({
          poIdOrNumber: po.id,
          itemIds: selectedItemIds,
          lotNumber: bulkLotNumber.trim(),
          supplierInvoice: bulkInvoiceNumber.trim(),
          supplierInvoiceDate: bulkInvoiceDate,
          receiptDate: bulkInvoiceDate,
          warehouseLocation: bulkWarehouseLocation.trim() || undefined,
          remarks: bulkRemarks.trim() || undefined,
          itemQuantities: bulkItemQuantities
        });
        googleSync.syncReceipts(po.po_number, receipts);
      } else {
        dataStore.updateBulkItemReceipts({
          poIdOrNumber: po.id,
          itemIds: selectedItemIds,
          lotNumber: bulkLotNumber.trim(),
          supplierInvoice: bulkInvoiceNumber.trim(),
          supplierInvoiceDate: bulkInvoiceDate
        });
      }

      setIsSubmittingBulk(false);
      setIsBulkReceiptOpen(false);
      setSelectedItemIds([]);
      setDataVersion(v => v + 1);
    } catch (err: any) {
      setIsSubmittingBulk(false);
      setBulkError(err.message || 'Failed to process bulk receipt.');
    }
  };

  const loadData = () => {
    if (id) {
      const found = dataStore.getPurchaseOrderById(id);
      if (found) {
        setPo(JSON.parse(JSON.stringify(found)));
        // If an item was selected, refresh its reference
        if (selectedItem) {
          const freshItem = found.items?.find(i => i.id === selectedItem.id);
          if (freshItem) setSelectedItem(freshItem);
        }
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [id, dataVersion]);

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  if (!po) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-slate-500">Loading purchase order details...</p>
        <Link href="/purchasing/purchase-orders" className="text-blue-600 text-xs hover:underline">
          Return to PO List
        </Link>
      </div>
    );
  }

  const suppliers = dataStore.getSuppliers();

  const handleOpenReceiptForItem = (itemId: string) => {
    setTargetItemId(itemId);
    setIsAddReceiptOpen(true);
  };

  const handleOpenEditPO = () => {
    if (!po) return;
    setEditOrderDate(po.order_date ? po.order_date.split('T')[0] : '');
    setEditSupplierName(po.supplier_name || '');
    setEditCurrency(po.currency || 'USD');
    setEditDestination(po.destination || 'N.S.');
    setEditDeliveryTerms(po.delivery_terms || 'FOB');
    setEditPaymentTerms(po.payment_terms || '');
    setEditOcNumber(po.oc_number || '');
    setEditOcDate(po.oc_date ? po.oc_date.split('T')[0] : '');
    setEditExpDelivery(po.expected_delivery_date ? po.expected_delivery_date.split('T')[0] : '');
    setEditStatus(po.status || 'Open');
    setEditRemarks(po.remarks || '');
    setIsEditPoOpen(true);
  };

  const handleSavePOEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!po) return;

    dataStore.updatePurchaseOrder(po.id, {
      order_date: editOrderDate,
      supplier_name: editSupplierName,
      currency: editCurrency,
      destination: editDestination,
      delivery_terms: editDeliveryTerms,
      payment_terms: editPaymentTerms,
      oc_number: editOcNumber.trim() || undefined,
      oc_date: editOcDate || undefined,
      expected_delivery_date: editExpDelivery || undefined,
      status: editStatus,
      remarks: editRemarks
    });

    setIsEditPoOpen(false);
    loadData();
    setDataVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:data-updated'));
    }
  };

  const handleOpenResolveBalance = (item: PurchaseOrderItem) => {
    setResolvingItem(item);
    const pending = item.actionable_pending_qty ?? item.balance_quantity ?? Math.max(0, item.ordered_quantity - (item.received_quantity || 0));
    setResolveOption('CARRY_FORWARD');
    setCfQty(pending > 0 ? String(pending) : '');
    setWaivedQty('');
    setResolveReason('Supplier production shortage accepted');
    setResolveRemarks('');
    setResolveExpDate(po.expected_delivery_date ? po.expected_delivery_date.split('T')[0] : '');
    setResolveError(null);
    setIsResolveOpen(true);
  };

  const handleSubmitResolveBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingItem || !po) return;

    if (resolveOption === 'KEEP_PENDING') {
      setIsResolveOpen(false);
      return;
    }

    const actionable = resolvingItem.actionable_pending_qty ?? resolvingItem.balance_quantity ?? 0;
    const cf = resolveOption === 'CARRY_FORWARD' || resolveOption === 'MIXED' ? parseFloat(cfQty) || 0 : 0;
    const waived = resolveOption === 'WAIVED' || resolveOption === 'MIXED' ? parseFloat(waivedQty) || 0 : 0;

    if (cf < 0 || waived < 0) {
      setResolveError('Quantities cannot be negative.');
      return;
    }

    if (cf + waived <= 0) {
      setResolveError('Please specify a quantity greater than zero to resolve.');
      return;
    }

    if (cf + waived > actionable) {
      setResolveError(`Resolved quantity (${cf + waived} KG) cannot exceed current pending quantity of ${actionable.toLocaleString()} KG.`);
      return;
    }

    setIsSubmittingResolve(true);
    setResolveError(null);

    try {
      dataStore.resolveBalance({
        poIdOrNumber: po.id,
        itemId: resolvingItem.id,
        option: resolveOption,
        carryForwardQty: cf,
        waivedQty: waived,
        reason: resolveReason,
        remarks: resolveRemarks,
        expectedDeliveryDate: resolveExpDate || undefined
      });

      setIsResolveOpen(false);
      loadData();
      setDataVersion(v => v + 1);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('app:data-updated'));
      }
    } catch (err: any) {
      setResolveError(err.message || 'Failed to resolve balance');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  const handleReverseResolution = (resolutionId: string) => {
    if (!confirm('Are you sure you want to reverse this balance resolution transaction? Any unfulfilled linked carry-forward item will be cancelled.')) {
      return;
    }
    try {
      dataStore.reverseResolution(resolutionId, 'Manual reversal by operations');
      loadData();
      setDataVersion(v => v + 1);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('app:data-updated'));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reverse resolution');
    }
  };

  const handleAddItemToPO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemQty || parseFloat(itemQty) <= 0) return;

    dataStore.addPurchaseOrderItem(po.id, {
      grade_code: itemGrade.trim() || '1.2311',
      grade_doc: itemGradeDoc.trim() || undefined,
      section_name: itemSection,
      diameter_width: parseFloat(itemDiaW) || 0,
      thickness: parseFloat(itemThk) || 0,
      length: parseFloat(itemLen) || 0,
      treatment: itemTreatment.trim() || 'Annealed',
      condition_name: itemCondition.trim() || 'BLACK ROLLED',
      ordered_quantity: parseFloat(itemQty),
      purchase_price: parseFloat(itemPrice) || 0,
      currency: po.currency,
      expected_delivery_date: itemExpDelivery || po.expected_delivery_date || undefined
    });

    setIsAddItemOpen(false);
    setItemQty('');
    setItemPrice('');
    setItemDiaW('');
    setItemThk('');
    setItemLen('');
    setItemGradeDoc('');
    loadData();
    setDataVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:data-updated'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/purchasing/purchase-orders" className="hover:text-blue-600 flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Purchase Orders</span>
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-900">PO {po.po_number}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenEditPO}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg card-shadow transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-slate-600" />
            <span>Edit PO Details</span>
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete PO</span>
          </button>

          <button
            onClick={() => setIsAddItemOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg card-shadow transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-blue-600" />
            <span>Add Item to PO</span>
          </button>

          <button
            onClick={() => {
              setTargetItemId(undefined);
              setIsAddReceiptOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Receipt to PO</span>
          </button>
        </div>
      </div>

      {/* PO Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-600">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900">Purchase Order {po.po_number}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadgeClass(po.status)}`}>
                  {po.status}
                </span>
                {po.is_overdue && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700">
                    {po.days_overdue} days overdue
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Supplier: <strong className="text-slate-800">{po.supplier_name}</strong></span>
                {po.origin_make_name && (
                  <span className="text-slate-400">| Make: {po.origin_make_name}</span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Quantities Summary Widget */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 px-4 py-3 rounded-lg border border-slate-200 text-center">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ordered</span>
              <span className="text-sm font-bold text-slate-800">{formatWeight(po.total_ordered_qty)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Received</span>
              <span className="text-sm font-bold text-emerald-600">{formatWeight(po.total_received_qty)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending</span>
              <span className="text-sm font-bold text-blue-700">{formatWeight(po.total_balance_qty)}</span>
            </div>
          </div>
        </div>

        {/* Contract Meta Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 pt-5 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Order Date</span>
            <span className="font-semibold text-slate-800">{formatDate(po.order_date)}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Currency</span>
            <span className="font-semibold text-slate-800">{po.currency}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Payment Terms</span>
            <span className="font-semibold text-slate-800">{po.payment_terms || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Delivery Terms / Port</span>
            <span className="font-semibold text-slate-800">{po.delivery_terms || 'FOB'} / {po.destination || 'N.S.'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Order Confirmation (O/C)</span>
            <span className="font-semibold text-slate-800">
              {po.oc_number ? `${po.oc_number}${po.oc_date ? ` (${formatDate(po.oc_date)})` : ''}` : '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Expected Delivery</span>
            <span className="font-semibold text-slate-800">{formatDate(po.expected_delivery_date)}</span>
          </div>
        </div>
        {po.remarks && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-400">Remarks:</span>
            <span>{po.remarks}</span>
          </div>
        )}
      </div>

      {/* Material Line Items Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Ordered Material Items ({po.items?.length || 0})
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {selectedItemIds.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">
                <span className="text-xs font-bold text-blue-900">
                  {selectedItemIds.length} item{selectedItemIds.length > 1 ? 's' : ''} selected
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenBulkReceipt('RECEIVE')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm transition-colors"
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>Bulk Receive Items</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBulkReceipt('UPDATE')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded shadow-sm transition-colors"
                  title="Bulk edit Lot No. and Invoice info for existing receipts"
                >
                  <Pencil className="h-3 w-3" />
                  <span>Bulk Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedItemIds([])}
                  className="text-xs text-slate-500 hover:text-slate-700 underline px-1"
                >
                  Clear
                </button>
              </div>
            )}
            <button
              onClick={() => setIsAddItemOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Material Item</span>
            </button>
            <span className="text-[11px] text-slate-400 hidden sm:inline">Click any row to inspect complete receipt history & lot details</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-header w-10 text-center">
                  <input 
                    type="checkbox"
                    aria-label="Select all items"
                    checked={selectedItemIds.length > 0 && selectedItemIds.length === (po.items?.length || 0)}
                    ref={el => {
                      if (el) el.indeterminate = selectedItemIds.length > 0 && selectedItemIds.length < (po.items?.length || 0);
                    }}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                  />
                </th>
                <th className="table-header">Line #</th>
                <th className="table-header">Steel Grade</th>
                <th className="table-header">Doc Grade</th>
                <th className="table-header">Section</th>
                <th className="table-header">Dimensions (W x T x L)</th>
                <th className="table-header">Treatment & Condition</th>
                <th className="table-header text-right">Price</th>
                <th className="table-header text-right">Ordered Qty</th>
                <th className="table-header text-right">Received Qty</th>
                <th className="table-header text-right">Pending Qty</th>
                <th className="table-header text-center">Receipts</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {po.items?.map((item) => {
                const dimStr = `${item.diameter_width || '—'} ${item.thickness ? 'x ' + item.thickness : ''} ${item.length ? 'x ' + item.length : ''} mm`;
                const actionable = item.actionable_pending_qty ?? item.balance_quantity ?? 0;
                const physicalShort = item.physical_short_qty ?? Math.max(0, item.ordered_quantity - (item.received_quantity || 0));

                return (
                  <tr 
                    key={item.id} 
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                  >
                    <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        aria-label={`Select item ${item.line_number}`}
                        checked={selectedItemIds.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                      />
                    </td>
                    <td className="table-cell font-mono font-bold text-slate-500">#{item.line_number}</td>
                    <td className="table-cell font-bold text-slate-900">{item.grade_code}</td>
                    <td className="table-cell text-slate-500">{item.grade_doc || '—'}</td>
                    <td className="table-cell font-medium text-slate-700">{item.section_name}</td>
                    <td className="table-cell font-mono text-slate-800">{dimStr}</td>
                    <td className="table-cell text-slate-600">
                      <span>{item.treatment || 'Annealed'}</span>
                      <span className="text-[10px] text-slate-400 block">{item.condition_name || 'BLACK ROLLED'}</span>
                    </td>
                    <td className="table-cell text-right font-mono text-slate-700">
                      {formatCurrency(item.purchase_price, item.currency)}
                    </td>
                    <td className="table-cell text-right font-semibold text-slate-800">
                      {formatWeight(item.ordered_quantity)}
                    </td>
                    <td className="table-cell text-right font-bold text-emerald-600">
                      {formatWeight(item.received_quantity)}
                    </td>
                    <td className="table-cell text-right font-bold text-blue-700">
                      <div>{formatWeight(actionable)}</div>
                      {physicalShort > actionable && (
                        <div className="text-[10px] text-amber-700 font-normal">
                          Short: {formatWeight(physicalShort)}
                        </div>
                      )}
                    </td>
                    <td className="table-cell text-center font-bold text-slate-600">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border">
                        {item.receipt_count || 0}
                      </span>
                    </td>
                    <td className="table-cell text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenReceiptForItem(item.id);
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 font-semibold text-[11px] transition-colors"
                        >
                          + Receive
                        </button>
                        {actionable > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenResolveBalance(item);
                            }}
                            className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-800 border border-amber-200 font-semibold text-[11px] transition-colors"
                            title="Resolve remaining balance"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Detail Drilldown Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-600">
                  <Package className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold">
                    Material Item #{selectedItem.line_number} — {selectedItem.grade_code}
                  </h2>
                  <p className="text-xs text-slate-400">PO {po.po_number} Line Item Specification & Fulfillment Timeline</p>
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs text-slate-700">
              {/* Carry Forward Outbound Banner */}
              {selectedItem.carried_forward_to_item_id && (() => {
                const linked = po.items?.find(i => i.id === selectedItem.carried_forward_to_item_id);
                return (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-900">
                      <Split className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                      <div>
                        <strong className="font-bold">Balance Carried Forward:</strong>{' '}
                        <span>{formatWeight(selectedItem.carried_forward_qty)} carried forward to PO Item #{linked?.line_number || selectedItem.carried_forward_to_item_id}</span>
                      </div>
                    </div>
                    {linked && (
                      <button
                        onClick={() => setSelectedItem(linked)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm"
                      >
                        <span>View Item #{linked.line_number}</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Created From Inbound Banner */}
              {selectedItem.created_from_item_id && (() => {
                const source = po.items?.find(i => i.id === selectedItem.created_from_item_id);
                return (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-900">
                      <Split className="h-4 w-4 text-blue-600 flex-shrink-0 rotate-180" />
                      <div>
                        <strong className="font-bold">Derived Order Item:</strong>{' '}
                        <span>Created from {formatWeight(selectedItem.ordered_quantity)} outstanding balance of PO Item #{source?.line_number || selectedItem.created_from_item_id}</span>
                      </div>
                    </div>
                    {source && (
                      <button
                        onClick={() => setSelectedItem(source)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm"
                      >
                        <span>View Original #{source.line_number}</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Specification Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Grade</span>
                  <span className="font-bold text-slate-900">{selectedItem.grade_code}</span>
                  {selectedItem.grade_doc && (
                    <span className="text-[10px] text-slate-500 block">Doc: {selectedItem.grade_doc}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Profile & Dimensions</span>
                  <span className="font-bold text-slate-900">
                    {selectedItem.section_name} ({selectedItem.diameter_width || '—'}{selectedItem.thickness ? 'x' + selectedItem.thickness : ''}{selectedItem.length ? 'x' + selectedItem.length : ''} mm)
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Condition & Treatment</span>
                  <span className="font-semibold text-slate-800">
                    {selectedItem.treatment || 'Annealed'}, {selectedItem.condition_name || 'BLACK ROLLED'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Contract Price</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(selectedItem.purchase_price, selectedItem.currency)}
                  </span>
                </div>
              </div>

              {/* Quantity Summary Card (Section 6) */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-700">Quantity & Balance Breakdown</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(selectedItem.status)}`}>
                    {selectedItem.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Ordered</span>
                    <span className="text-sm font-bold text-slate-900">{formatWeight(selectedItem.ordered_quantity)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Received</span>
                    <span className="text-sm font-bold text-emerald-600">{formatWeight(selectedItem.received_quantity)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Physical Short</span>
                    <span className="text-sm font-bold text-slate-700">
                      {formatWeight(selectedItem.physical_short_qty ?? Math.max(0, selectedItem.ordered_quantity - (selectedItem.received_quantity || 0)))}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Carried Forward</span>
                    <span className="text-sm font-bold text-indigo-600">{formatWeight(selectedItem.carried_forward_qty || 0)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Waived / Short</span>
                    <span className="text-sm font-bold text-amber-600">{formatWeight(selectedItem.waived_qty || 0)}</span>
                  </div>
                  <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-[10px] text-blue-600 font-bold uppercase block">Pending Qty</span>
                    <span className="text-sm font-bold text-blue-900">
                      {formatWeight(selectedItem.actionable_pending_qty ?? selectedItem.balance_quantity)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Balance Resolution History */}
              {(() => {
                const itemRes = dataStore.getBalanceResolutions(selectedItem.id);
                if (!itemRes || itemRes.length === 0) return null;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                        <RotateCcw className="h-4 w-4 text-amber-600" />
                        <span>Balance Resolution History ({itemRes.length})</span>
                      </h3>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 font-bold text-slate-600">Type</th>
                            <th className="p-2.5 font-bold text-slate-600 text-right">Resolved Qty</th>
                            <th className="p-2.5 font-bold text-slate-600">Reason & Remarks</th>
                            <th className="p-2.5 font-bold text-slate-600">Date & By</th>
                            <th className="p-2.5 font-bold text-slate-600 text-center">Status</th>
                            <th className="p-2.5 font-bold text-slate-600 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {itemRes.map(res => (
                            <tr key={res.id} className="hover:bg-slate-50">
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  res.resolution_type === 'CARRY_FORWARD' 
                                    ? 'bg-indigo-100 text-indigo-800' 
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {res.resolution_type === 'CARRY_FORWARD' ? 'Carry Forward' : 'Waived'}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-800 font-mono">
                                {formatWeight(res.quantity)}
                              </td>
                              <td className="p-2.5">
                                <div className="font-medium text-slate-800">{res.reason}</div>
                                {res.remarks && <div className="text-[11px] text-slate-500">{res.remarks}</div>}
                                {res.linked_po_item_id && (
                                  <div className="text-[10px] text-indigo-600 font-mono">Linked Item: {res.linked_po_item_id}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-500 whitespace-nowrap">
                                <div>{formatDate(res.created_at)}</div>
                                <div className="text-[10px] text-slate-400">{res.created_by}</div>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  res.status === 'ACTIVE' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                    : 'bg-rose-50 text-rose-700 border border-rose-200 line-through'
                                }`}>
                                  {res.status}
                                </span>
                              </td>
                              <td className="p-2.5 text-right">
                                {res.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => handleReverseResolution(res.id)}
                                    className="px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition-colors"
                                  >
                                    Reverse
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Receipt Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                    <History className="h-4 w-4 text-emerald-600" />
                    <span>Physical Receipt Timeline ({selectedItem.receipts?.length || 0} Deliveries)</span>
                  </h3>
                  <button
                    onClick={() => {
                      const itId = selectedItem.id;
                      setSelectedItem(null);
                      handleOpenReceiptForItem(itId);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-white hover:bg-blue-600 rounded border border-blue-200 transition-colors"
                  >
                    + Record Receipt
                  </button>
                </div>

                {!selectedItem.receipts || selectedItem.receipts.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 border border-dashed rounded-lg">
                    No physical receipts have been recorded against this line item yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedItem.receipts.map((rc, idx) => (
                      <div key={rc.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-blue-100 text-blue-800">
                              {rc.receipt_number}
                            </span>
                            <span className="font-semibold text-slate-800">{formatDate(rc.receipt_date)}</span>
                            {rc.supplier_invoice_number && (
                              <span className="text-slate-500">
                                • Inv: <strong className="text-slate-700 font-mono">{rc.supplier_invoice_number}</strong>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Assigned to Lot: <strong className="text-slate-800 font-mono">{rc.lot_number || 'UNASSIGNED'}</strong>
                            {rc.raw_formula && (
                              <span className="ml-2 font-mono text-[10px] bg-slate-200/70 px-1 py-0.5 rounded text-slate-600">
                                Formula: {rc.raw_formula}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-sm font-bold text-emerald-600 block">
                              +{formatWeight(rc.received_quantity)}
                            </span>
                            <span className="text-[10px] text-slate-400">Warehouse Receipt</span>
                          </div>
                          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                            <button
                              type="button"
                              onClick={() => setEditingReceipt(rc)}
                              title="Edit Receipt"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingReceipt(rc)}
                              title="Delete Receipt"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t flex items-center justify-between">
                <div>
                  {(selectedItem.actionable_pending_qty ?? selectedItem.balance_quantity ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const it = selectedItem;
                        setSelectedItem(null);
                        handleOpenResolveBalance(it);
                      }}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      <Split className="h-3.5 w-3.5" />
                      <span>Resolve Balance ({formatWeight(selectedItem.actionable_pending_qty ?? selectedItem.balance_quantity)})</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Material Item to PO Modal */}
      {isAddItemOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 my-6">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Package className="h-5 w-5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Add Material Item to PO {po.po_number}</h2>
                  <p className="text-xs text-slate-500">Append a new material specification and contracted quantity to this order</p>
                </div>
              </div>
              <button onClick={() => setIsAddItemOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddItemToPO} className="space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Steel Grade *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1.2311"
                    value={itemGrade}
                    onChange={(e) => setItemGrade(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Doc Grade Alias</label>
                  <input
                    type="text"
                    placeholder="e.g. 1.2312"
                    value={itemGradeDoc}
                    onChange={(e) => setItemGradeDoc(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Section</label>
                  <select
                    value={itemSection}
                    onChange={(e) => setItemSection(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Plate">Plate</option>
                    <option value="Round">Round</option>
                    <option value="FLAT">FLAT</option>
                    <option value="Block">Block</option>
                    <option value="Square">Square</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Treatment</label>
                  <input
                    type="text"
                    placeholder="Annealed / Q&T"
                    value={itemTreatment}
                    onChange={(e) => setItemTreatment(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Surface Condition</label>
                  <input
                    type="text"
                    placeholder="BLACK ROLLED / BRIGHT / MACHINED"
                    value={itemCondition}
                    onChange={(e) => setItemCondition(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={itemExpDelivery}
                    onChange={(e) => setItemExpDelivery(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Dia / Width (mm)</label>
                  <input
                    type="number"
                    placeholder="e.g. 2300"
                    value={itemDiaW}
                    onChange={(e) => setItemDiaW(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Thickness (mm)</label>
                  <input
                    type="number"
                    placeholder="e.g. 32"
                    value={itemThk}
                    onChange={(e) => setItemThk(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Length (mm)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5800"
                    value={itemLen}
                    onChange={(e) => setItemLen(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Ordered Quantity (KG) *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 5000"
                    value={itemQty}
                    onChange={(e) => setItemQty(e.target.value)}
                    className="w-full p-2 bg-white border border-blue-400 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Unit Price ({po.currency})</label>
                  <input
                    type="number"
                    placeholder="e.g. 785"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {itemQty && parseFloat(itemQty) > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-slate-600">Calculated Item Value:</span>
                  <strong className="text-sm font-bold text-blue-900">
                    {po.currency} {((parseFloat(itemQty) || 0) * (parseFloat(itemPrice) || 0)).toLocaleString()}
                  </strong>
                </div>
              )}

              <div className="pt-3 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddItemOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Add Item to PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Add Receipt Modal for PO */}
      <AddReceiptModal
        isOpen={isAddReceiptOpen}
        onClose={() => setIsAddReceiptOpen(false)}
        defaultPoId={po.po_number}
        defaultItemId={targetItemId}
        onReceiptAdded={() => {
          setDataVersion(v => v + 1);
        }}
      />

      {/* Delete PO Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-100 flex-shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Delete Purchase Order</h2>
                <p className="text-xs text-slate-500">PO {po.po_number} — {po.supplier_name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete purchase order <strong>PO {po.po_number}</strong>? 
              This will remove all {po.items?.length || 0} line items and any associated receipt records.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  dataStore.deletePurchaseOrder(po.id);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('app:data-updated'));
                  }
                  router.push('/purchasing/purchase-orders');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
              >
                Yes, Delete PO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit PO Details Modal */}
      {isEditPoOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 my-6">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Pencil className="h-5 w-5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Edit Purchase Order {po.po_number}</h2>
                  <p className="text-xs text-slate-500">Update supplier, order confirmation, commercial terms, or dates</p>
                </div>
              </div>
              <button onClick={() => setIsEditPoOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePOEdits} className="space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">PO Number</label>
                  <input
                    type="text"
                    disabled
                    value={po.po_number}
                    className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-500 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-400">PO Number cannot be modified once created</span>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Order Date *</label>
                  <input
                    type="date"
                    required
                    value={editOrderDate}
                    onChange={(e) => setEditOrderDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Supplier Name *</label>
                  <select
                    value={editSupplierName}
                    onChange={(e) => setEditSupplierName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    {suppliers.findIndex(s => s.supplier_name.toLowerCase() === (editSupplierName || '').toLowerCase()) === -1 && editSupplierName && (
                      <option value={editSupplierName}>{editSupplierName}</option>
                    )}
                    {suppliers.map(s => (
                      <option key={s.id} value={s.supplier_name}>
                        {s.supplier_name} ({s.country || 'Overseas'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Currency *</label>
                  <select
                    value={editCurrency}
                    onChange={(e) => setEditCurrency(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">Euro (€)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="YEN">Yen (¥)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Delivery Terms</label>
                  <select
                    value={editDeliveryTerms}
                    onChange={(e) => setEditDeliveryTerms(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="FOB">FOB</option>
                    <option value="CFR">CFR</option>
                    <option value="CIF">CIF</option>
                    <option value="Ex-Works">Ex-Works</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Destination Port</label>
                  <input
                    type="text"
                    placeholder="e.g. N.S. / Nhava Sheva"
                    value={editDestination}
                    onChange={(e) => setEditDestination(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Payment Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. DP at sight, LC 90 days"
                    value={editPaymentTerms}
                    onChange={(e) => setEditPaymentTerms(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Order Confirmation (O/C No.)</label>
                  <input
                    type="text"
                    placeholder="e.g. OC-24-901"
                    value={editOcNumber}
                    onChange={(e) => setEditOcNumber(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">O/C Date</label>
                  <input
                    type="date"
                    value={editOcDate}
                    onChange={(e) => setEditOcDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={editExpDelivery}
                    onChange={(e) => setEditExpDelivery(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">PO Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as PurchaseOrder['status'])}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                  >
                    <option value="Open">Open</option>
                    <option value="Partially Received">Partially Received</option>
                    <option value="Received">Received</option>
                    <option value="Over Received">Over Received</option>
                    <option value="Closed">Closed</option>
                    <option value="Draft">Draft</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Remarks / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Special testing or dispatch instructions"
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditPoOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Balance Modal */}
      {isResolveOpen && resolvingItem && (() => {
        const actionable = resolvingItem.actionable_pending_qty ?? resolvingItem.balance_quantity ?? 0;
        const physicalShort = resolvingItem.physical_short_qty ?? Math.max(0, resolvingItem.ordered_quantity - (resolvingItem.received_quantity || 0));
        const alreadyResolved = (resolvingItem.carried_forward_qty || 0) + (resolvingItem.waived_qty || 0);
        const cfNum = resolveOption === 'CARRY_FORWARD' || resolveOption === 'MIXED' ? (parseFloat(cfQty) || 0) : 0;
        const waivedNum = resolveOption === 'WAIVED' || resolveOption === 'MIXED' ? (parseFloat(waivedQty) || 0) : 0;
        const totalResolving = cfNum + waivedNum;
        const isOverLimit = totalResolving > actionable;
        const remainingAfter = Math.max(0, actionable - totalResolving);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 my-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2.5 text-amber-600">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Split className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Resolve Remaining Balance</h2>
                    <p className="text-xs text-slate-500">
                      PO {po.po_number} • Line Item #{resolvingItem.line_number} ({resolvingItem.grade_code} {resolvingItem.section_name})
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsResolveOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Balance Context Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Ordered</span>
                  <span className="font-bold text-slate-800">{formatWeight(resolvingItem.ordered_quantity)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Received</span>
                  <span className="font-bold text-emerald-600">{formatWeight(resolvingItem.received_quantity)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Physical Short</span>
                  <span className="font-bold text-slate-700">{formatWeight(physicalShort)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Already Resolved</span>
                  <span className="font-bold text-indigo-600">{formatWeight(alreadyResolved)}</span>
                </div>
                <div className="bg-blue-100/70 rounded-lg py-1 border border-blue-200">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">Pending Qty</span>
                  <span className="font-bold text-blue-900 text-sm">{formatWeight(actionable)}</span>
                </div>
              </div>

              <form onSubmit={handleSubmitResolveBalance} className="space-y-4 text-xs text-slate-700">
                {/* Decision Prompt */}
                <div>
                  <label className="block font-bold text-slate-900 mb-2 text-xs">
                    How do you want to handle the remaining balance of {formatWeight(actionable)}?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Option 1: Keep Pending */}
                    <label 
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        resolveOption === 'KEEP_PENDING'
                          ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolveOption"
                        checked={resolveOption === 'KEEP_PENDING'}
                        onChange={() => setResolveOption('KEEP_PENDING')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <strong className="block font-bold text-slate-900">1. Keep Pending</strong>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Continue expecting the supplier to deliver remaining material. Item remains Partially Received.
                        </p>
                      </div>
                    </label>

                    {/* Option 2: Carry Forward */}
                    <label 
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        resolveOption === 'CARRY_FORWARD'
                          ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolveOption"
                        checked={resolveOption === 'CARRY_FORWARD'}
                        onChange={() => {
                          setResolveOption('CARRY_FORWARD');
                          setCfQty(String(actionable));
                          setWaivedQty('');
                        }}
                        className="mt-0.5 text-indigo-600"
                      />
                      <div>
                        <strong className="block font-bold text-slate-900">2. Carry Forward / New Item</strong>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Close this balance and spawn a new linked line item under this PO with original specs.
                        </p>
                      </div>
                    </label>

                    {/* Option 3: Short Close / Waive */}
                    <label 
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        resolveOption === 'WAIVED'
                          ? 'border-amber-600 bg-amber-50/60 ring-1 ring-amber-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolveOption"
                        checked={resolveOption === 'WAIVED'}
                        onChange={() => {
                          setResolveOption('WAIVED');
                          setWaivedQty(String(actionable));
                          setCfQty('');
                        }}
                        className="mt-0.5 text-amber-600"
                      />
                      <div>
                        <strong className="block font-bold text-slate-900">3. Short Close / Waive</strong>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Accept shortage without expecting delivery. Preserves ordered vs received for supplier rating.
                        </p>
                      </div>
                    </label>

                    {/* Option 4: Split / Mixed */}
                    <label 
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        resolveOption === 'MIXED'
                          ? 'border-cyan-600 bg-cyan-50/60 ring-1 ring-cyan-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolveOption"
                        checked={resolveOption === 'MIXED'}
                        onChange={() => {
                          setResolveOption('MIXED');
                          setCfQty(String(Math.floor(actionable * 0.9)));
                          setWaivedQty(String(Math.ceil(actionable * 0.1)));
                        }}
                        className="mt-0.5 text-cyan-600"
                      />
                      <div>
                        <strong className="block font-bold text-slate-900">4. Split (Carry Forward + Waive)</strong>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Carry forward a portion into a new order item and waive the rest as commercial shortage.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Option 1 Detail Notice */}
                {resolveOption === 'KEEP_PENDING' && (
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                    <HelpCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block">No Changes Required</strong>
                      <span>
                        The system will keep the outstanding balance of {formatWeight(actionable)} active and overdue tracking will continue normally. No transaction will be generated.
                      </span>
                    </div>
                  </div>
                )}

                {/* Form Fields for Carry Forward / Waive / Mixed */}
                {resolveOption !== 'KEEP_PENDING' && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                    {/* Quantity Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(resolveOption === 'CARRY_FORWARD' || resolveOption === 'MIXED') && (
                        <div>
                          <label className="block font-semibold mb-1 text-slate-800">
                            Quantity to Carry Forward (KG) *
                          </label>
                          <input
                            type="number"
                            required
                            step="any"
                            min="0"
                            max={actionable}
                            value={cfQty}
                            onChange={(e) => setCfQty(e.target.value)}
                            placeholder="e.g. 1000"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-900"
                          />
                        </div>
                      )}

                      {(resolveOption === 'WAIVED' || resolveOption === 'MIXED') && (
                        <div>
                          <label className="block font-semibold mb-1 text-slate-800">
                            Waived / Short Closed Quantity (KG) *
                          </label>
                          <input
                            type="number"
                            required
                            step="any"
                            min="0"
                            max={actionable}
                            value={waivedQty}
                            onChange={(e) => setWaivedQty(e.target.value)}
                            placeholder="e.g. 70"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-slate-900"
                          />
                        </div>
                      )}

                      {(resolveOption === 'CARRY_FORWARD' || resolveOption === 'MIXED') && (
                        <div>
                          <label className="block font-semibold mb-1 text-slate-800">
                            Expected Delivery Date (New Item)
                          </label>
                          <input
                            type="date"
                            value={resolveExpDate}
                            onChange={(e) => setResolveExpDate(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block font-semibold mb-1 text-slate-800">
                          Primary Reason *
                        </label>
                        <select
                          value={resolveReason}
                          onChange={(e) => setResolveReason(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                        >
                          <option value="Supplier production shortage accepted">Supplier production shortage accepted</option>
                          <option value="Commercial weight tolerance accepted (<1%)">Commercial weight tolerance accepted (&lt;1%)</option>
                          <option value="Balance carried forward to fresh schedule">Balance carried forward to fresh schedule</option>
                          <option value="Supplier out of stock / end of campaign">Supplier out of stock / end of campaign</option>
                          <option value="Cancelled by mutual commercial agreement">Cancelled by mutual commercial agreement</option>
                          <option value="Material specification superseded">Material specification superseded</option>
                          <option value="Other / Special Reason">Other / Special Reason</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Remarks / Documentation Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. Agreed via email with supplier rep on 28-Sep"
                        value={resolveRemarks}
                        onChange={(e) => setResolveRemarks(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Live Calculation Summary */}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                      <div className="space-x-2">
                        <span className="text-slate-500">Total Resolving:</span>
                        <strong className={`font-mono font-bold ${isOverLimit ? 'text-rose-600' : 'text-slate-900'}`}>
                          {formatWeight(totalResolving)}
                        </strong>
                        <span className="text-slate-400">of {formatWeight(actionable)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Remaining Actionable:</span>{' '}
                        <strong className="font-mono font-bold text-blue-700">
                          {formatWeight(remainingAfter)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Error Alert */}
                {(isOverLimit || resolveError) && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                    <span>
                      {resolveError || `Resolved quantity cannot exceed the current pending quantity of ${formatWeight(actionable)}.`}
                    </span>
                  </div>
                )}

                {/* Submit Actions */}
                <div className="pt-3 border-t flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsResolveOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingResolve || (resolveOption !== 'KEEP_PENDING' && (isOverLimit || totalResolving <= 0))}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-sm transition-colors"
                  >
                    {isSubmittingResolve 
                      ? 'Processing...' 
                      : resolveOption === 'KEEP_PENDING' 
                        ? 'Keep Pending & Close' 
                        : 'Confirm & Apply Resolution'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* BULK RECEIVE / EDIT MODAL */}
      {isBulkReceiptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {bulkMode === 'RECEIVE' ? 'Bulk Receive Selected Items' : 'Bulk Edit Lot & Invoice Details'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Applying shared Lot No. and Invoice across {selectedItemIds.length} selected items
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkReceiptOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBulkReceipt} className="p-6 space-y-4 text-xs">
              {/* Auto-fill notification alert */}
              {bulkMode === 'RECEIVE' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Full Ordered Quantities Auto-Filled:</span>
                    <span>
                      Since multiple items are selected under one Lot and Invoice, the full contracted / pending quantity for each item has been pre-filled automatically.
                    </span>
                  </div>
                </div>
              )}

              {/* Shared Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Lot Number *</label>
                    <button
                      type="button"
                      onClick={() => setBulkLotNumber(`LOT-${po.po_number}-${Math.floor(100 + Math.random() * 900)}`)}
                      className="text-[10px] text-blue-600 hover:underline font-semibold"
                    >
                      Generate Lot #
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={bulkLotNumber}
                    onChange={(e) => setBulkLotNumber(e.target.value)}
                    placeholder="e.g. LOT-24-001"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier Commercial Invoice *</label>
                  <input
                    type="text"
                    required
                    value={bulkInvoiceNumber}
                    onChange={(e) => setBulkInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-2024-8841"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={bulkInvoiceDate}
                    onChange={(e) => setBulkInvoiceDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Warehouse Location</label>
                  <input
                    type="text"
                    value={bulkWarehouseLocation}
                    onChange={(e) => setBulkWarehouseLocation(e.target.value)}
                    placeholder="e.g. Nhava Sheva Yard"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Selected Items Breakdown Table */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Selected Items ({selectedItemIds.length}) & Landed Quantities
                </label>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 font-semibold text-slate-600">Line</th>
                        <th className="py-2 px-3 font-semibold text-slate-600">Grade & Dimensions</th>
                        <th className="py-2 px-3 font-semibold text-slate-600 text-right">Ordered</th>
                        <th className="py-2 px-3 font-semibold text-slate-600 text-right">
                          {bulkMode === 'RECEIVE' ? 'Receive Qty (KG)' : 'Current Received'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedItemIds.map(itemId => {
                        const item = po.items?.find(i => i.id === itemId);
                        if (!item) return null;
                        const qtyVal = bulkItemQuantities[itemId] !== undefined 
                          ? bulkItemQuantities[itemId] 
                          : (item.actionable_pending_qty ?? item.balance_quantity ?? item.ordered_quantity);

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-mono font-bold text-slate-500">#{item.line_number}</td>
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-800">{item.grade_code}</span>
                              <span className="text-slate-400 block text-[10px]">
                                {item.diameter_width} x {item.thickness || '—'} x {item.length || '—'} mm
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-slate-600">
                              {formatWeight(item.ordered_quantity)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {bulkMode === 'RECEIVE' ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={qtyVal || ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setBulkItemQuantities(prev => ({ ...prev, [itemId]: val }));
                                  }}
                                  className="w-28 p-1.5 bg-white border border-slate-300 rounded font-bold text-right text-xs focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="font-bold text-emerald-600">
                                  {formatWeight(item.received_quantity || 0)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Summary */}
              {bulkMode === 'RECEIVE' && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-semibold text-slate-600">Total Bulk Quantity to Receive:</span>
                  <span className="font-bold font-mono text-sm text-blue-700">
                    {formatWeight(
                      selectedItemIds.reduce((sum, itemId) => {
                        const it = po.items?.find(i => i.id === itemId);
                        const val = bulkItemQuantities[itemId] !== undefined 
                          ? bulkItemQuantities[itemId] 
                          : (it?.actionable_pending_qty ?? it?.balance_quantity ?? it?.ordered_quantity ?? 0);
                        return sum + (Number(val) || 0);
                      }, 0)
                    )}
                  </span>
                </div>
              )}

              {bulkError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkReceiptOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBulk}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmittingBulk ? 'Processing...' : bulkMode === 'RECEIVE' ? 'Record Bulk Receipt' : 'Save Bulk Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Individual Receipt Modal */}
      <EditReceiptModal
        isOpen={!!editingReceipt}
        receipt={editingReceipt}
        onClose={() => setEditingReceipt(null)}
        onReceiptUpdated={() => {
          setDataVersion(v => v + 1);
          setEditingReceipt(null);
        }}
      />

      {/* Delete Individual Receipt Confirmation Modal */}
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
