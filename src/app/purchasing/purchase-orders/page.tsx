'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  ArrowUpDown, 
  ShoppingBag, 
  AlertCircle, 
  ChevronRight,
  X,
  CheckCircle2,
  Calendar,
  Building2,
  Package,
  Trash2,
  Sparkles,
  Database
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { PurchaseOrder } from '@/types';
import { formatWeight, formatDate, getStatusBadgeClass } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { useAuth } from '@/context/AuthContext';

function PurchaseOrdersContent() {
  const { isViewer } = useAuth();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const initialSupplier = searchParams.get('supplier') || 'all';
  const [supplierFilter, setSupplierFilter] = useState(initialSupplier);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'po' | 'pending'>('po');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Delete PO confirmation state
  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);

const STANDARD_PAYMENT_TERMS = [
  'DP at sight',
  'CAD (Cash Against Documents)',
  'LC at sight',
  'LC 30 Days from BL Date',
  'LC 60 Days from BL Date',
  'LC 90 Days from BL Date',
  'LC 120 Days from BL Date',
  'LC 180 Days from BL Date',
  'DA 60 Days from BL Date',
  'DA 90 Days from BL Date',
  '100% Advance TT',
  '10% Advance, Balance DP against BL',
  '10% Deposit & 90% TT against BL',
  '20% Advance, Balance CAD',
  'Bank assignment 90 days after invoice',
  'Open Account 30 days',
  'Net 30 days',
  'Net 60 days',
  'Custom...'
];

const STANDARD_SURFACE_CONDITIONS = [
  'BLACK ROLLED',
  'BRIGHT / PEELED',
  'MACHINED / TURNED',
  'GROUND',
  'ROUGH TURNED',
  'HOT ROLLED',
  'COLD DRAWN',
  'FORGED',
  'AS CAST',
  'MILLED'
];

const STANDARD_ORIGINS = [
  'Germany',
  'China',
  'Japan',
  'South Korea',
  'Italy',
  'Taiwan',
  'India',
  'Sweden',
  'Austria',
  'Buderus',
  'Kind & Co',
  'Dillinger',
  'Groditz',
  'Dongbei',
  'Baosteel',
  'Fushun'
];

  // New PO Modal state
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);
  const [newPoNumber, setNewPoNumber] = useState('');
  const [newPoDate, setNewPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newCustomer, setNewCustomer] = useState('Sandeep Edgetech (Self)');
  const [newCustomCustomer, setNewCustomCustomer] = useState('');
  const [newReferencePerson, setNewReferencePerson] = useState('');
  const [newOrigin, setNewOrigin] = useState('');
  const [newCommission, setNewCommission] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newDestination, setNewDestination] = useState('N.S.');
  const [newTerms, setNewTerms] = useState('FOB');
  const [newPaymentTerms, setNewPaymentTerms] = useState('DP at sight');
  const [isCustomPaymentTerms, setIsCustomPaymentTerms] = useState(false);
  const [newOcNumber, setNewOcNumber] = useState('');
  const [newOcDate, setNewOcDate] = useState('');
  const [newExpDelivery, setNewExpDelivery] = useState('');

  // Quick Supplier Modal State inside PO creation
  const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false);
  const [quickSupName, setQuickSupName] = useState('');
  const [quickSupCountry, setQuickSupCountry] = useState('');
  const [quickSupCurrency, setQuickSupCurrency] = useState('USD');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [quickSupTerms, setQuickSupTerms] = useState('DP at sight');

  // Dynamic Item rows for new PO
  interface DraftItem {
    id: string;
    grade_code: string;
    grade_doc: string;
    section_name: string;
    diameter_width: string;
    thickness: string;
    length: string;
    treatment: string;
    condition_name: string;
    lot_number: string;
    ordered_quantity: string;
    purchase_price: string;
  }

  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    {
      id: '1',
      grade_code: '1.2311',
      grade_doc: '',
      section_name: 'Plate',
      diameter_width: '2300',
      thickness: '32',
      length: '5800',
      treatment: 'Annealed',
      condition_name: 'BLACK ROLLED',
      lot_number: '',
      ordered_quantity: '5000',
      purchase_price: '785'
    }
  ]);

  const handleAddDraftItem = () => {
    setDraftItems(prev => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        grade_code: '1.2311',
        grade_doc: '',
        section_name: 'Plate',
        diameter_width: '2000',
        thickness: '30',
        length: '6000',
        treatment: 'Annealed',
        condition_name: 'BLACK ROLLED',
        lot_number: '',
        ordered_quantity: '1000',
        purchase_price: '750'
      }
    ]);
  };

  const handleRemoveDraftItem = (index: number) => {
    if (draftItems.length <= 1) return;
    setDraftItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateDraftItem = (index: number, field: keyof DraftItem, val: string) => {
    setDraftItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleQuickCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupName.trim()) return;
    const created = dataStore.createSupplier({
      supplier_name: quickSupName.trim(),
      country: quickSupCountry.trim() || 'Overseas',
      default_currency: quickSupCurrency,
      payment_terms: quickSupTerms.trim() || 'DP at sight',
    });
    setNewSupplierName(created.supplier_name);
    setQuickSupName('');
    setQuickSupCountry('');
    setIsQuickSupplierOpen(false);
    setDataVersion(v => v + 1);
  };

  const handleOpenNewPO = () => {
    setNewPoNumber(dataStore.getNextPONumber());
    setIsNewPoOpen(true);
  };

  useEffect(() => {
    const urlSup = searchParams.get('supplier');
    if (urlSup) {
      setSupplierFilter(urlSup);
      setCurrentPage(1);
    }
    if (searchParams.get('new') === 'true') {
      handleOpenNewPO();
    }
  }, [searchParams]);

  useEffect(() => {
    setMounted(true);
    const handleUpdate = () => setDataVersion((v) => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => {
      window.removeEventListener('app:data-updated', handleUpdate);
    };
  }, []);

  const suppliers = dataStore.getSuppliers();
  const customers = dataStore.getCustomers();
  const allPOs = dataStore.getPurchaseOrders({
    status: statusFilter,
    supplier: supplierFilter,
    search,
    overdueOnly
  });

  // Deduplicate POs defensively to prevent any duplicate key errors
  const uniquePOs = useMemo(() => {
    const seen = new Set<string>();
    return allPOs.filter((po) => {
      const key = `${po.id || ''}:::${po.po_number || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allPOs]);

  // Sorting
  const sortedPOs = [...uniquePOs].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'po') {
      diff = a.po_number.localeCompare(b.po_number, undefined, { numeric: true });
    } else if (sortBy === 'date') {
      diff = new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
    } else if (sortBy === 'pending') {
      diff = (a.total_balance_qty || 0) - (b.total_balance_qty || 0);
    }
    return sortDir === 'asc' ? diff : -diff;
  });

  // Pagination
  const totalPages = Math.ceil(sortedPOs.length / pageSize) || 1;
  const paginatedPOs = sortedPOs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = () => {
    const exportData = sortedPOs.map((po) => ({
      'PO Number': po.po_number,
      'Order Date': po.order_date,
      'Supplier': po.supplier_name,
      'Customer': po.customer_name || 'Self',
      'Reference Person': po.reference_person || po.reference || '—',
      'Origin / Make': po.origin || po.origin_make_name || '—',
      'Commission': po.commission || '—',
      'Status': po.status,
      'Total Items': po.total_items,
      'Ordered Qty (KG)': po.total_ordered_qty,
      'Recd / Ready Qty (KG)': po.total_received_qty || po.total_ready_qty || 0,
      'Physical Short (KG)': po.total_physical_short_qty || 0,
      'Carried Forward (KG)': po.total_carried_forward_qty || 0,
      'Waived (KG)': po.total_waived_qty || 0,
      'Pending Qty (KG)': po.is_closed 
        ? (po.total_balance_qty ?? ((po.total_ordered_qty || 0) - (po.total_received_qty || 0)))
        : (po.total_actionable_pending_qty ?? po.total_balance_qty ?? 0),
      'Currency': po.currency,
      'Payment Terms': po.payment_terms,
      'Destination': po.destination,
      'Expected Delivery': po.expected_delivery_date,
      'Is Overdue': po.is_overdue ? 'YES' : 'NO'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders');
    XLSX.writeFile(wb, `Purchase_Orders_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPoNumber.trim()) return;

    const mappedItems = draftItems.map(item => ({
      grade_code: item.grade_code || '1.2311',
      grade_doc: item.grade_doc || undefined,
      section_name: item.section_name || 'Plate',
      diameter_width: parseFloat(item.diameter_width) || 0,
      thickness: parseFloat(item.thickness) || 0,
      length: parseFloat(item.length) || 0,
      treatment: item.treatment || 'Annealed',
      condition_name: item.condition_name || 'BLACK ROLLED',
      lot_number: item.lot_number?.trim() || undefined,
      ordered_quantity: parseFloat(item.ordered_quantity) || 0,
      purchase_price: parseFloat(item.purchase_price) || 0,
      currency: newCurrency,
      unit: 'KG'
    }));

    const finalCustomer = newCustomer === '__custom__' ? newCustomCustomer.trim() : newCustomer;

    const createdPO = dataStore.createPurchaseOrder({
      po_number: newPoNumber.trim(),
      order_date: newPoDate,
      supplier_name: newSupplierName || suppliers[0]?.supplier_name || 'Generic Supplier',
      customer_name: finalCustomer || 'Sandeep Edgetech (Self)',
      reference_person: newReferencePerson.trim() || undefined,
      reference: newReferencePerson.trim() || undefined,
      origin: newOrigin.trim() || undefined,
      origin_make_name: newOrigin.trim() || undefined,
      commission: newCommission.trim() || undefined,
      currency: newCurrency,
      destination: newDestination,
      delivery_terms: newTerms,
      payment_terms: newPaymentTerms,
      oc_number: newOcNumber.trim() || undefined,
      oc_date: newOcDate || undefined,
      expected_delivery_date: newExpDelivery || undefined,
      items: mappedItems
    });

    setIsNewPoOpen(false);
    setNewPoNumber('');
    setNewCustomer('Sandeep Edgetech (Self)');
    setNewCustomCustomer('');
    setNewReferencePerson('');
    setNewOrigin('');
    setNewCommission('');
    setNewPaymentTerms('DP at sight');
    setIsCustomPaymentTerms(false);
    setNewOcNumber('');
    setNewOcDate('');
    setDraftItems([
      {
        id: '1',
        grade_code: '1.2311',
        grade_doc: '',
        section_name: 'Plate',
        diameter_width: '2300',
        thickness: '32',
        length: '5800',
        treatment: 'Annealed',
        condition_name: 'BLACK ROLLED',
        lot_number: '',
        ordered_quantity: '5000',
        purchase_price: '785'
      }
    ]);
    setDataVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:data-updated'));
    }
  };

  const handleSyncCloudDB = async () => {
    try {
      setIsSyncingCloud(true);
      const res = await dataStore.pushToCloud();
      setIsSyncingCloud(false);
      if (res?.message) {
        alert(res.message);
      }
    } catch (err: any) {
      setIsSyncingCloud(false);
      alert(`Cloud sync error: ${err.message}`);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-5 p-4 animate-pulse" suppressHydrationWarning>
        <div className="h-10 bg-slate-100 rounded-lg w-1/3" />
        <div className="h-14 bg-slate-100 rounded-xl" />
        <div className="h-96 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5" suppressHydrationWarning>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Purchase Orders</h1>
          <p className="text-xs text-slate-500">Manage import contracts, item specifications, and fulfillment status</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSyncCloudDB}
            disabled={isSyncingCloud}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors disabled:opacity-50"
            title="Upload and synchronize all purchase orders to the cloud database"
          >
            <Database className="h-3.5 w-3.5 text-blue-600" />
            <span>{isSyncingCloud ? 'Syncing Cloud DB...' : 'Sync Cloud DB'}</span>
          </button>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export Excel</span>
          </button>

          {!isViewer && (
            <button
              onClick={handleOpenNewPO}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Purchase Order</span>
            </button>
          )}
        </div>
      </div>


      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search PO #, supplier, grade, destination..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="Open">Open</option>
            <option value="Ready to Ship">Ready to Ship</option>
            <option value="In Transit">In Transit</option>
            <option value="Received">Received</option>
            <option value="Partially Received">Partially Received</option>
            <option value="Closed">Closed</option>
          </select>

          {/* Supplier Filter */}
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 max-w-[200px]"
          >
            <option value="all">All Suppliers</option>
            {supplierFilter !== 'all' && !suppliers.some(s => s.supplier_name.toLowerCase() === supplierFilter.toLowerCase()) && (
              <option value={supplierFilter}>{supplierFilter}</option>
            )}
            {suppliers.map((s, idx) => (
              <option key={`${s.id || s.supplier_name}-${idx}`} value={s.supplier_name}>{s.supplier_name}</option>
            ))}
          </select>

          {supplierFilter !== 'all' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs font-medium animate-in fade-in duration-150">
              <Building2 className="h-3 w-3 text-blue-600" />
              <span>Supplier: <strong>{supplierFilter}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setSupplierFilter('all');
                  setCurrentPage(1);
                }}
                className="ml-1 text-slate-400 hover:text-slate-700 p-0.5"
                title="Clear supplier filter"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Overdue Toggle */}
          <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked);
                setCurrentPage(1);
              }}
              className="rounded text-rose-600 focus:ring-rose-500/20"
            />
            <span>Overdue Only</span>
          </label>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 text-slate-500">
          <span>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold text-slate-700"
          >
            <option value="po">PO Number</option>
            <option value="date">Order Date</option>
            <option value="pending">Pending Qty</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="p-1 rounded hover:bg-slate-100 text-slate-600"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="table-header">PO Number</th>
                <th className="table-header">Order Date</th>
                <th className="table-header">Supplier</th>
                <th className="table-header">Port / Terms</th>
                <th className="table-header text-center">Items</th>
                <th className="table-header text-right">Ordered Qty</th>
                <th className="table-header text-right">Recd / Ready Qty</th>
                <th className="table-header text-right">Pending Qty</th>
                <th className="table-header">Expected</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedPOs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    No purchase orders found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedPOs.map((po, idx) => (
                  <tr key={`${po.id}-${po.po_number || idx}`} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="table-cell">
                      <Link 
                        href={`/purchasing/purchase-orders/${po.po_number}`}
                        className="font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                      >
                        <ShoppingBag className="h-3.5 w-3.5 text-blue-500" />
                        <span>PO {po.po_number}</span>
                      </Link>
                    </td>
                    <td className="table-cell text-slate-600">{formatDate(po.order_date)}</td>
                    <td className="table-cell">
                      <span className="font-semibold text-slate-800 block truncate max-w-[200px]">
                        {po.supplier_name}
                      </span>
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                        {po.customer_name && (
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">Cust: {po.customer_name}</span>
                        )}
                        {(po.reference_person || po.reference) && (
                          <span className="text-slate-500 font-medium">Ref: {po.reference_person || po.reference}</span>
                        )}
                        {(po.origin || po.origin_make_name) && (
                          <span className="text-blue-600 font-medium">Origin: {po.origin || po.origin_make_name}</span>
                        )}
                        {po.commission && (
                          <span className="text-emerald-700 font-medium">Comm: {po.commission}</span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-slate-700">
                      <span className="font-medium text-slate-800 block">{po.destination || 'N.S.'}</span>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
                        {po.delivery_terms || 'FOB'}
                      </span>
                    </td>
                    <td className="table-cell text-center font-semibold text-slate-700">
                      {po.total_items}
                    </td>
                    <td className="table-cell text-right font-medium text-slate-700">
                      {formatWeight(po.total_ordered_qty)}
                    </td>
                    <td className="table-cell text-right font-semibold text-emerald-600">
                      {formatWeight(po.total_received_qty || po.total_ready_qty || 0)}
                    </td>
                    {(() => {
                      const isSettled = Math.abs((po.total_ordered_qty || 0) - (po.total_received_qty || 0)) < 0.001;
                      const bal = isSettled 
                        ? 0 
                        : (po.is_closed 
                            ? (po.total_balance_qty ?? ((po.total_ordered_qty || 0) - (po.total_received_qty || 0)))
                            : (po.total_actionable_pending_qty ?? po.total_balance_qty ?? 0));
                      const physShort = isSettled ? 0 : (po.total_physical_short_qty ?? 0);
                      return (
                        <td className={`table-cell text-right font-bold ${!isSettled && bal < 0 ? 'text-purple-700' : isSettled ? 'text-slate-400' : 'text-blue-700'}`}>
                          <div>{formatWeight(bal)}</div>
                          {!isSettled && bal > 0 && (
                            <span className={`block text-[10px] font-normal ${po.is_closed ? 'text-amber-700' : 'text-slate-400'}`}>
                              Short: {formatWeight(po.is_closed ? bal : (physShort > bal ? physShort : bal))}
                            </span>
                          )}
                          {!isSettled && bal < 0 && (
                            <span className="block text-[10px] font-normal text-purple-600">
                              Over: {formatWeight(Math.abs(bal))}
                            </span>
                          )}
                        </td>
                      );
                    })()}
                    <td className="table-cell">
                      <span className="text-slate-600 block">{formatDate(po.expected_delivery_date)}</span>
                      {po.is_overdue && (
                        <span className="inline-block text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1 rounded">
                          {po.days_overdue}d overdue
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(po.status)}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/purchasing/purchase-orders/${po.po_number}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 group-hover:text-blue-600 hover:underline"
                        >
                          <span>View</span>
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPoToDelete(po);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title={`Delete PO ${po.po_number}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, sortedPOs.length)}</strong> of <strong>{sortedPOs.length}</strong> orders
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

      {/* New Purchase Order Modal */}
      {isNewPoOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-blue-400" />
                <h2 className="text-base font-bold">Create New Import Purchase Order</h2>
              </div>
              <button onClick={() => setIsNewPoOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-5 text-xs text-slate-700 overflow-y-auto flex-1">
              {/* Contract General Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-800">PO Number *</label>
                    <button
                      type="button"
                      onClick={() => setNewPoNumber(dataStore.getNextPONumber())}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-0.5"
                      title="Automatically calculate and fill next sequential PO number"
                    >
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      <span>Auto-Generate</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newPoNumber}
                    onChange={(e) => setNewPoNumber(e.target.value)}
                    placeholder="e.g. 1137"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Next sequential: #{dataStore.getNextPONumber()}
                  </span>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Order Date *</label>
                  <input
                    type="date"
                    required
                    value={newPoDate}
                    onChange={(e) => setNewPoDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-800">Supplier *</label>
                    <button
                      type="button"
                      onClick={() => setIsQuickSupplierOpen(true)}
                      className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" /> New Supplier
                    </button>
                  </div>
                  <select
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {suppliers.map((s, idx) => (
                      <option key={`${s.id || s.supplier_name}-${idx}`} value={s.supplier_name}>{s.supplier_name} ({s.country || 'Overseas'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Customer</label>
                  <select
                    value={newCustomer}
                    onChange={(e) => setNewCustomer(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {customers.map((c, idx) => (
                      <option key={`${c.id || c.customer_name}-${idx}`} value={c.customer_name}>{c.customer_name}</option>
                    ))}
                    <option value="__custom__">+ Enter Custom Customer...</option>
                  </select>
                  {newCustomer === '__custom__' && (
                    <input
                      type="text"
                      placeholder="Type custom customer name"
                      value={newCustomCustomer}
                      onChange={(e) => setNewCustomCustomer(e.target.value)}
                      className="mt-1.5 w-full p-2 bg-white border border-blue-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Reference Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Sandeep / Rep"
                    value={newReferencePerson}
                    onChange={(e) => setNewReferencePerson(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Origin / Make</label>
                  <div className="flex gap-1.5">
                    <select
                      value={STANDARD_ORIGINS.includes(newOrigin) ? newOrigin : (newOrigin ? '__custom__' : '')}
                      onChange={(e) => {
                        if (e.target.value !== '__custom__') {
                          setNewOrigin(e.target.value);
                        }
                      }}
                      className="w-1/2 p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    >
                      <option value="">Select Origin...</option>
                      {STANDARD_ORIGINS.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                      <option value="__custom__">Custom / Other...</option>
                    </select>
                    <input
                      type="text"
                      placeholder="e.g. Germany"
                      value={newOrigin}
                      onChange={(e) => setNewOrigin(e.target.value)}
                      className="w-1/2 p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Commission</label>
                  <input
                    type="text"
                    placeholder="e.g. $15/MT or 2%"
                    value={newCommission}
                    onChange={(e) => setNewCommission(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Currency</label>
                  <select
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">Euro (€)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="YEN">Yen (¥)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Payment Terms</label>
                  <select
                    value={isCustomPaymentTerms ? 'Custom...' : (STANDARD_PAYMENT_TERMS.includes(newPaymentTerms) ? newPaymentTerms : 'Custom...')}
                    onChange={(e) => {
                      if (e.target.value === 'Custom...') {
                        setIsCustomPaymentTerms(true);
                      } else {
                        setIsCustomPaymentTerms(false);
                        setNewPaymentTerms(e.target.value);
                      }
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    {STANDARD_PAYMENT_TERMS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {isCustomPaymentTerms && (
                    <input
                      type="text"
                      placeholder="Enter custom payment terms"
                      value={newPaymentTerms}
                      onChange={(e) => setNewPaymentTerms(e.target.value)}
                      className="mt-1.5 w-full p-2 bg-white border border-blue-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Delivery Terms</label>
                  <select
                    value={newTerms}
                    onChange={(e) => setNewTerms(e.target.value)}
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
                    value={newDestination}
                    onChange={(e) => setNewDestination(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Order Confirmation (O/C No.)</label>
                  <input
                    type="text"
                    placeholder="e.g. OC-24-901"
                    value={newOcNumber}
                    onChange={(e) => setNewOcNumber(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">O/C Date</label>
                  <input
                    type="date"
                    value={newOcDate}
                    onChange={(e) => setNewOcDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={newExpDelivery}
                    onChange={(e) => setNewExpDelivery(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dynamic Line Items Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-600" />
                      Material Line Items ({draftItems.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Add all material specifications, dimensions, and weights for this contract
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddDraftItem}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200 transition-colors shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Another Item</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {draftItems.map((item, idx) => (
                    <div key={item.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-mono">
                            #{idx + 1}
                          </span>
                          Line Item #{idx + 1} Specification
                        </span>
                        {draftItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(idx)}
                            className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Steel Grade *</label>
                          <input
                            type="text"
                            required
                            value={item.grade_code}
                            onChange={(e) => handleUpdateDraftItem(idx, 'grade_code', e.target.value)}
                            placeholder="e.g. 1.2311"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Doc Grade Alias</label>
                          <input
                            type="text"
                            value={item.grade_doc}
                            onChange={(e) => handleUpdateDraftItem(idx, 'grade_doc', e.target.value)}
                            placeholder="e.g. 1.2312"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Section</label>
                          <select
                            value={item.section_name}
                            onChange={(e) => handleUpdateDraftItem(idx, 'section_name', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          >
                            <option value="Plate">Plate</option>
                            <option value="Round">Round</option>
                            <option value="FLAT">FLAT</option>
                            <option value="Block">Block</option>
                            <option value="Square">Square</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Treatment</label>
                          <input
                            type="text"
                            value={item.treatment}
                            onChange={(e) => handleUpdateDraftItem(idx, 'treatment', e.target.value)}
                            placeholder="Annealed / Q&T"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Dia / Width (mm)</label>
                          <input
                            type="number"
                            value={item.diameter_width}
                            onChange={(e) => handleUpdateDraftItem(idx, 'diameter_width', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Thickness (mm)</label>
                          <input
                            type="number"
                            value={item.thickness}
                            onChange={(e) => handleUpdateDraftItem(idx, 'thickness', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Length (mm)</label>
                          <input
                            type="number"
                            value={item.length}
                            onChange={(e) => handleUpdateDraftItem(idx, 'length', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Ordered Qty (KG) *</label>
                          <input
                            type="number"
                            required
                            value={item.ordered_quantity}
                            onChange={(e) => handleUpdateDraftItem(idx, 'ordered_quantity', e.target.value)}
                            className="w-full p-2 bg-white border border-blue-400 rounded-lg font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1 text-slate-700">Unit Price ({newCurrency})</label>
                          <input
                            type="number"
                            value={item.purchase_price}
                            onChange={(e) => handleUpdateDraftItem(idx, 'purchase_price', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="pt-1 border-t border-slate-200/60">
                        <label className="block font-semibold mb-1 text-slate-700">Surface Condition</label>
                        <div className="flex gap-1.5 max-w-md">
                          <select
                            value={STANDARD_SURFACE_CONDITIONS.includes(item.condition_name) ? item.condition_name : '__custom__'}
                            onChange={(e) => {
                              if (e.target.value !== '__custom__') {
                                handleUpdateDraftItem(idx, 'condition_name', e.target.value);
                              }
                            }}
                            className="w-1/2 p-2 bg-white border border-slate-300 rounded-lg text-xs"
                          >
                            {STANDARD_SURFACE_CONDITIONS.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__custom__">Custom / Other...</option>
                          </select>
                          <input
                            type="text"
                            value={item.condition_name}
                            onChange={(e) => handleUpdateDraftItem(idx, 'condition_name', e.target.value)}
                            placeholder="e.g. BLACK ROLLED"
                            className="w-1/2 p-2 bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Contract Real-Time Aggregates Widget */}
                {(() => {
                  const totalKg = draftItems.reduce((acc, i) => acc + (parseFloat(i.ordered_quantity) || 0), 0);
                  const totalVal = draftItems.reduce((acc, i) => acc + ((parseFloat(i.ordered_quantity) || 0) * (parseFloat(i.purchase_price) || 0)), 0);
                  return (
                    <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-blue-700 block tracking-wider">Contract Total Summary</span>
                        <span className="text-slate-600">
                          {draftItems.length} line item{draftItems.length > 1 ? 's' : ''} configured
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-semibold">Total Contract Weight</span>
                          <strong className="text-sm font-bold text-blue-900">{formatWeight(totalKg)}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-semibold">Estimated Value</span>
                          <strong className="text-sm font-bold text-emerald-700">
                            {newCurrency} {totalVal.toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>

              {/* Pinned Desktop-Friendly Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewPoOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm"
                >
                  Create Order ({draftItems.length} Items)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Supplier Modal inside PO Flow */}
      {isQuickSupplierOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                <Building2 className="h-4 w-4" />
                <span>Quick Add Supplier / Mill</span>
              </div>
              <button onClick={() => setIsQuickSupplierOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700">Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sanyo Special Steel Co. Ltd"
                  value={quickSupName}
                  onChange={(e) => setQuickSupName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Country / Origin</label>
                  <input
                    type="text"
                    placeholder="e.g. Japan"
                    value={quickSupCountry}
                    onChange={(e) => setQuickSupCountry(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Default Currency</label>
                  <select
                    value={quickSupCurrency}
                    onChange={(e) => setQuickSupCurrency(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">Euro</option>
                    <option value="INR">INR</option>
                    <option value="YEN">Yen</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Payment Terms</label>
                <input
                  type="text"
                  placeholder="e.g. DP at sight"
                  value={quickSupTerms}
                  onChange={(e) => setQuickSupTerms(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsQuickSupplierOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm"
                >
                  Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete PO Confirmation Modal */}
      {poToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-100 flex-shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Delete Purchase Order</h2>
                <p className="text-xs text-slate-500">PO {poToDelete.po_number} — {poToDelete.supplier_name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete purchase order <strong>PO {poToDelete.po_number}</strong>? 
              This will permanently remove the contract, its material items, and any child receipt logs.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setPoToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  dataStore.deletePurchaseOrder(poToDelete.id);
                  setPoToDelete(null);
                  setDataVersion(v => v + 1);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('app:data-updated'));
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
              >
                Yes, Delete PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Purchase Orders...</div>}>
      <PurchaseOrdersContent />
    </Suspense>
  );
}
