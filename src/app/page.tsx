'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  PackageCheck, 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  Filter, 
  ArrowUpRight,
  ShieldAlert,
  ChevronRight,
  Truck,
  Building2,
  Layers,
  Archive,
  Search,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  ChevronLeft
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight, formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/utils';
import Link from 'next/link';
import { PurchaseOrder, Receipt } from '@/types';
import * as XLSX from 'xlsx';

export default function DashboardPage() {
  const [dataVersion, setDataVersion] = useState(0);
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderViewTab, setOrderViewTab] = useState<'active' | 'closed' | 'all'>('active');
  const [orderSearch, setOrderSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const handleUpdate = () => setDataVersion((v) => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const kpis = dataStore.getDashboardKPIs();
  const allPOs = dataStore.getPurchaseOrders();
  const allReceipts = dataStore.getReceipts();
  const suppliers = dataStore.getSuppliers();

  // Filtered orders for the Dashboard Orders Hub
  const displayedOrders = allPOs.filter((po) => {
    const isClosed = po.is_closed || po.status === 'Closed';
    
    // Tab filter
    if (orderViewTab === 'active' && isClosed) return false;
    if (orderViewTab === 'closed' && !isClosed) return false;

    // Supplier filter
    if (supplierFilter !== 'all' && !po.supplier_name?.toLowerCase().includes(supplierFilter.toLowerCase())) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && po.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }

    // Search query
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
      const matchPO = po.po_number.toLowerCase().includes(q);
      const matchSup = po.supplier_name?.toLowerCase().includes(q);
      const matchOC = po.oc_number?.toLowerCase().includes(q);
      const matchDest = po.destination?.toLowerCase().includes(q);
      const matchItem = po.items?.some(i => 
        i.grade_code.toLowerCase().includes(q) || 
        i.section_name.toLowerCase().includes(q)
      );
      if (!matchPO && !matchSup && !matchOC && !matchDest && !matchItem) return false;
    }

    return true;
  });

  const totalPages = Math.ceil(displayedOrders.length / pageSize) || 1;
  const paginatedOrders = displayedOrders.slice((tablePage - 1) * pageSize, tablePage * pageSize);

  // Export current displayed orders to Excel
  const handleExportOrders = () => {
    const rows = displayedOrders.map(po => ({
      'PO Number': po.po_number,
      'Order Date': po.order_date,
      'Supplier': po.supplier_name,
      'Status': po.status,
      'Type': (po.is_closed || po.status === 'Closed') ? 'Closed / Historical Archive' : 'Active Contract',
      'Destination': po.destination || 'N.S.',
      'Contracted Qty (KG)': po.total_ordered_qty || 0,
      'Received Qty (KG)': po.total_received_qty || 0,
      'Physical Short (KG)': po.total_physical_short_qty || 0,
      'Carried Forward (KG)': po.total_carried_forward_qty || 0,
      'Waived / Short (KG)': po.total_waived_qty || 0,
      'Pending Qty (KG)': po.total_actionable_pending_qty ?? po.total_balance_qty ?? 0,
      'Items Count': po.items?.length || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, orderViewTab === 'closed' ? 'Closed Orders' : 'Orders');
    XLSX.writeFile(wb, `Import_${orderViewTab === 'closed' ? 'Closed' : 'Active'}_Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Extract upcoming deliveries & overdue items (Active orders only)
  const upcomingDeliveries: {
    po_number: string;
    supplier_name: string;
    grade_code: string;
    dimensions: string;
    expected_date: string;
    ordered_qty: number;
    pending_qty: number;
    days_left: number;
  }[] = [];

  const overdueOrders: {
    po_number: string;
    supplier_name: string;
    grade_code: string;
    dimensions: string;
    expected_date: string;
    pending_qty: number;
    days_overdue: number;
  }[] = [];

  const today = new Date('2026-09-28');

  for (const po of allPOs) {
    if (po.is_closed || po.status === 'Closed') continue;
    for (const item of (po.items || [])) {
      const actionable = item.actionable_pending_qty ?? item.balance_quantity ?? 0;
      if (actionable > 0) {
        const expDate = item.expected_delivery_date || po.expected_delivery_date;
        if (expDate) {
          const d = new Date(expDate);
          const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const dim = `${item.diameter_width || '—'}${item.thickness ? 'x' + item.thickness : ''} mm`;

          if (diffDays < 0) {
            overdueOrders.push({
              po_number: po.po_number,
              supplier_name: po.supplier_name || '—',
              grade_code: item.grade_code,
              dimensions: dim,
              expected_date: expDate,
              pending_qty: actionable,
              days_overdue: Math.abs(diffDays)
            });
          } else if (diffDays <= 45) {
            upcomingDeliveries.push({
              po_number: po.po_number,
              supplier_name: po.supplier_name || '—',
              grade_code: item.grade_code,
              dimensions: dim,
              expected_date: expDate,
              ordered_qty: item.ordered_quantity,
              pending_qty: actionable,
              days_left: diffDays
            });
          }
        }
      }
    }
  }

  // Sort upcoming by closest date, overdue by longest overdue
  upcomingDeliveries.sort((a, b) => a.days_left - b.days_left);
  overdueOrders.sort((a, b) => b.days_overdue - a.days_overdue);

  // Recent 8 receipts
  const recentReceipts = [...allReceipts].slice(-8).reverse();

  return (
    <div className="space-y-6">
      {/* Page Header with Stats Badge and Quick Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Executive Operations Dashboard</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
              Live Import Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time material pipeline, active purchase orders & complete historical closed orders archive
          </p>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-lg text-xs card-shadow">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-600">Active:</span>
              <strong className="text-slate-900">{kpis.totalActivePOs} POs</strong>
            </div>
            <div className="h-3 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <Archive className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-slate-600">Closed Archive:</span>
              <strong className="text-slate-900">{kpis.totalClosedPOs} POs</strong>
            </div>
            <div className="h-3 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-slate-600">Receipts:</span>
              <strong className="text-slate-900">{allReceipts.length.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Top 8 Management KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Active Open POs */}
        <div 
          onClick={() => { setOrderViewTab('active'); setTablePage(1); }}
          className={`bg-white p-3.5 rounded-xl border transition-all cursor-pointer card-shadow flex flex-col justify-between ${orderViewTab === 'active' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-blue-300'}`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active POs</span>
            <ShoppingBag className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-slate-900">{kpis.totalActivePOs}</span>
            <span className="text-[10px] text-blue-600 block font-medium">Click to view active</span>
          </div>
        </div>

        {/* Closed POs (Historical Archive from Excel) */}
        <div 
          onClick={() => { setOrderViewTab('closed'); setTablePage(1); }}
          className={`bg-white p-3.5 rounded-xl border transition-all cursor-pointer card-shadow flex flex-col justify-between ${orderViewTab === 'closed' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-200 hover:border-teal-300'}`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Closed Orders</span>
            <Archive className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-teal-700">{kpis.totalClosedPOs}</span>
            <span className="text-[10px] text-teal-700/80 block font-medium">Click to view archive</span>
          </div>
        </div>

        {/* Active Pending Balance */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Pending</span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-blue-600">{formatWeight(kpis.activePendingQty)}</span>
            <span className="text-[10px] text-slate-400 block">Awaiting arrival</span>
          </div>
        </div>

        {/* Pending Purchase Value */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pending Value</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-slate-900">{formatCurrency(kpis.pendingPurchaseValue)}</span>
            <span className="text-[10px] text-slate-400 block">Committed balance</span>
          </div>
        </div>

        {/* Active Delivered Qty */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Recd</span>
            <PackageCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-emerald-600">{formatWeight(kpis.activeReceivedQty)}</span>
            <span className="text-[10px] text-emerald-700/70 block">
              {kpis.activeOrderedQty ? Math.round((kpis.activeReceivedQty / kpis.activeOrderedQty) * 100) : 0}% fulfilled
            </span>
          </div>
        </div>

        {/* Historical Landed Qty (Closed Order Sheet) */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Historical Landed</span>
            <Layers className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-indigo-900">{formatWeight(kpis.closedReceivedQty)}</span>
            <span className="text-[10px] text-slate-400 block">Settled contracts</span>
          </div>
        </div>

        {/* Overdue Items (Active) */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Overdue</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-rose-600">{kpis.overdueItems}</span>
            <span className="text-[10px] text-rose-600/70 block font-medium">Items past delivery</span>
          </div>
        </div>

        {/* Expected Soon */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Next 30 Days</span>
            <Calendar className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-amber-600">{kpis.ordersExpectedSoon}</span>
            <span className="text-[10px] text-slate-400 block">Deliveries imminent</span>
          </div>
        </div>
      </div>

      {/* Primary Dashboard Hub: Purchase Orders & Closed Orders Archive Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        {/* Table Top Controls & Navigation Tabs */}
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Tabs */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => { setOrderViewTab('active'); setTablePage(1); }}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  orderViewTab === 'active'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Orders ({kpis.totalActivePOs})
              </button>
              <button
                type="button"
                onClick={() => { setOrderViewTab('closed'); setTablePage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                  orderViewTab === 'closed'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Archive className="h-3.5 w-3.5 text-teal-600" />
                Closed Orders Archive ({kpis.totalClosedPOs})
              </button>
              <button
                type="button"
                onClick={() => { setOrderViewTab('all'); setTablePage(1); }}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  orderViewTab === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Orders ({kpis.totalPOs})
              </button>
            </div>
          </div>

          {/* Quick Search & Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Search */}
            <div className="relative min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => { setOrderSearch(e.target.value); setTablePage(1); }}
                placeholder={orderViewTab === 'closed' ? "Search 376 closed orders..." : "Search PO, supplier, grade..."}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
              />
              {orderSearch && (
                <button 
                  onClick={() => setOrderSearch('')} 
                  className="absolute right-2.5 top-2.5 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Supplier Filter */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={supplierFilter}
                onChange={(e) => { setSupplierFilter(e.target.value); setTablePage(1); }}
                className="bg-transparent text-slate-700 font-medium focus:outline-none text-xs"
              >
                <option value="all">All Suppliers ({suppliers.length})</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter (when on All Orders) */}
            {orderViewTab === 'all' && (
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setTablePage(1); }}
                  className="bg-transparent text-slate-700 font-medium focus:outline-none text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Partially Received">Partially Received</option>
                  <option value="Received">Received</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            )}

            {/* Export Button */}
            <button
              onClick={handleExportOrders}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </button>

            {/* Direct Link to PO List or Report */}
            {orderViewTab === 'closed' ? (
              <Link
                href="/reports?tab=closed"
                className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 rounded-lg text-xs font-semibold transition-colors"
              >
                Closed Report <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : (
              <Link
                href="/purchasing/purchase-orders"
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
              >
                PO Management <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Tab Context Banner */}
        {orderViewTab === 'closed' && (
          <div className="px-4 py-2.5 bg-teal-50/70 border-b border-teal-100 flex items-center justify-between text-xs text-teal-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <span>
                <strong>Closed Orders Historical Archive:</strong> Showing historical purchase orders imported directly from the <strong>&ldquo;Closed Order&rdquo;</strong> sheet in your Excel workbook. All 7,044 associated physical receipts, lot records, and invoices are fully preserved.
              </span>
            </div>
            <span className="font-bold text-teal-800 whitespace-nowrap ml-4">
              Total 376 Closed POs
            </span>
          </div>
        )}

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-header">PO Number</th>
                <th className="table-header">Date</th>
                <th className="table-header">Supplier / Overseas Mill</th>
                <th className="table-header">Material Specs / Items</th>
                <th className="table-header">Port / Dest</th>
                <th className="table-header text-right">Contracted Qty</th>
                <th className="table-header text-right">Landed / Recd</th>
                <th className="table-header text-right">Balance Qty</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    No purchase orders match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((po) => {
                  const isClosed = po.is_closed || po.status === 'Closed';
                  const firstItem = po.items?.[0];
                  const itemSummary = firstItem 
                    ? `${firstItem.grade_code} ${firstItem.section_name}${po.items && po.items.length > 1 ? ` (+${po.items.length - 1} more)` : ''}`
                    : '—';

                  return (
                    <tr key={po.id || po.po_number} className="hover:bg-slate-50/80 transition-colors">
                      {/* PO Number */}
                      <td className="table-cell font-bold text-blue-600">
                        <Link 
                          href={`/purchasing/purchase-orders/${po.po_number}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          PO {po.po_number}
                          {isClosed && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-normal bg-teal-100 text-teal-800 border border-teal-200">
                              Closed
                            </span>
                          )}
                        </Link>
                      </td>

                      {/* Date */}
                      <td className="table-cell text-slate-600 whitespace-nowrap">
                        {formatDate(po.order_date)}
                      </td>

                      {/* Supplier */}
                      <td className="table-cell">
                        <div className="font-semibold text-slate-800 truncate max-w-[180px]">
                          {po.supplier_name || '—'}
                        </div>
                        {po.supplier_country && (
                          <span className="text-[10px] text-slate-400">{po.supplier_country}</span>
                        )}
                      </td>

                      {/* Material Specs */}
                      <td className="table-cell text-slate-700">
                        <div className="truncate max-w-[200px]" title={itemSummary}>
                          {itemSummary}
                        </div>
                        {po.items && po.items.length > 0 && (
                          <span className="text-[10px] text-slate-400">
                            {po.items.length} line item{po.items.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </td>

                      {/* Destination / Port */}
                      <td className="table-cell font-mono text-slate-600">
                        {po.destination || 'N.S.'}
                      </td>

                      {/* Ordered Qty */}
                      <td className="table-cell text-right font-semibold text-slate-900">
                        {formatWeight(po.total_ordered_qty || 0)}
                      </td>

                      {/* Received Qty */}
                      <td className="table-cell text-right font-bold text-emerald-600">
                        {formatWeight(po.total_received_qty || 0)}
                      </td>

                      {/* Balance Qty */}
                      <td className="table-cell text-right font-medium">
                        {isClosed ? (
                          <span className="text-slate-400 font-mono text-[11px]">
                            {(po.total_balance_qty || 0) === 0 ? '0 KG' : `${formatWeight(po.total_balance_qty || 0)} (settled)`}
                          </span>
                        ) : (
                          <span className={`font-bold ${(po.total_balance_qty || 0) < 0 ? 'text-purple-600' : (po.total_balance_qty || 0) > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                            {formatWeight(po.total_balance_qty || 0)}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="table-cell text-center">
                        {isClosed ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            Closed / Settled
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(po.status)}`}>
                            {po.status}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="table-cell text-center">
                        <Link
                          href={`/purchasing/purchase-orders/${po.po_number}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View Details <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination & Summary Bar */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <strong className="text-slate-800">{paginatedOrders.length ? (tablePage - 1) * pageSize + 1 : 0}</strong> to <strong className="text-slate-800">{Math.min(tablePage * pageSize, displayedOrders.length)}</strong> of <strong className="text-slate-800">{displayedOrders.length}</strong> purchase orders
            {orderViewTab === 'closed' && ' in Closed Orders Archive'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTablePage(p => Math.max(1, p - 1))}
              disabled={tablePage === 1}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <span className="text-slate-700 font-semibold px-2">
              Page {tablePage} of {totalPages}
            </span>
            <button
              onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
              disabled={tablePage === totalPages}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Quantity by Supplier (Bar chart visual representation) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Pending Balance by Supplier</h2>
              <p className="text-[11px] text-slate-400">Outstanding material in Kilograms (Active)</p>
            </div>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-3.5">
            {kpis.supplierStats.map((item) => {
              const maxPending = Math.max(...kpis.supplierStats.map(s => s.pending), 1);
              const pct = Math.round((item.pending / maxPending) * 100);
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 truncate max-w-[200px]">{item.name}</span>
                    <span className="font-bold text-slate-900">{formatWeight(item.pending)}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Material Delivery Progress Ratio */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Material Pipeline</h2>
                <p className="text-[11px] text-slate-400">Current active batch fulfillment progress</p>
              </div>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>

            {/* Split Progress Bar */}
            <div className="space-y-3 pt-2">
              <div className="h-6 w-full bg-slate-100 rounded-lg overflow-hidden flex p-0.5 gap-0.5">
                <div 
                  className="bg-emerald-500 rounded text-[10px] font-bold text-white flex items-center justify-center transition-all duration-500"
                  style={{ width: `${kpis.activeOrderedQty ? Math.min(100, Math.round((kpis.activeReceivedQty / kpis.activeOrderedQty) * 100)) : 0}%` }}
                >
                  Recd {kpis.activeOrderedQty ? Math.round((kpis.activeReceivedQty / kpis.activeOrderedQty) * 100) : 0}%
                </div>
                <div 
                  className="bg-blue-500 rounded text-[10px] font-bold text-white flex items-center justify-center transition-all duration-500"
                  style={{ width: `${kpis.activeOrderedQty ? Math.max(0, 100 - Math.round((kpis.activeReceivedQty / kpis.activeOrderedQty) * 100)) : 100}%` }}
                >
                  Pending
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">Delivered (Active)</span>
                  <span className="text-base font-bold text-slate-800">{formatWeight(kpis.activeReceivedQty)}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Across {kpis.supplierStats.length} suppliers</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider block">Remaining In Transit</span>
                  <span className="text-base font-bold text-slate-800">{formatWeight(kpis.activePendingQty)}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Under contract</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg mt-4 text-[11px] text-teal-900">
            <strong>Historical Archive Note:</strong> In addition to active contracts, 376 closed POs totaling 20,683,689 KG have been successfully landed, audited, and archived in the system.
          </div>
        </div>

        {/* Pending Quantity by Grade */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Top Pending Steel Grades</h2>
              <p className="text-[11px] text-slate-400">Open active demand by material specification</p>
            </div>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-2.5">
            {kpis.gradeStats.map((item) => (
              <div key={item.grade} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 text-xs">
                <span className="font-semibold text-slate-800 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {item.grade}
                </span>
                <span className="font-mono font-bold text-slate-700">{formatWeight(item.pending)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Operational Tables: Overdue Orders & Upcoming Deliveries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Orders Alert Table */}
        <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
          <div className="p-4 bg-rose-50/60 border-b border-rose-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              <h2 className="text-xs font-bold uppercase tracking-wider">Critical Overdue Deliveries ({overdueOrders.length})</h2>
            </div>
            <Link href="/reports?tab=overdue" className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1">
              View All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="table-header">PO #</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Spec</th>
                  <th className="table-header">Due Date</th>
                  <th className="table-header">Pending</th>
                  <th className="table-header">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {overdueOrders.slice(0, 5).map((o, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-bold text-blue-600">
                      <Link href={`/purchasing/purchase-orders/${o.po_number}`}>
                        PO {o.po_number}
                      </Link>
                    </td>
                    <td className="table-cell truncate max-w-[130px] font-medium text-slate-700">{o.supplier_name}</td>
                    <td className="table-cell">{o.grade_code} ({o.dimensions})</td>
                    <td className="table-cell text-slate-500">{formatDate(o.expected_date)}</td>
                    <td className="table-cell font-bold text-slate-900">{formatWeight(o.pending_qty)}</td>
                    <td className="table-cell">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                        {o.days_overdue} days
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming Deliveries Table */}
        <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
          <div className="p-4 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700">
              <Calendar className="h-4 w-4" />
              <h2 className="text-xs font-bold uppercase tracking-wider">Upcoming Port Deliveries ({upcomingDeliveries.length})</h2>
            </div>
            <Link href="/purchasing/shipments" className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Track Ports <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="table-header">PO #</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Spec</th>
                  <th className="table-header">Expected</th>
                  <th className="table-header">Pending</th>
                  <th className="table-header">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {upcomingDeliveries.slice(0, 5).map((u, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-bold text-blue-600">
                      <Link href={`/purchasing/purchase-orders/${u.po_number}`}>
                        PO {u.po_number}
                      </Link>
                    </td>
                    <td className="table-cell truncate max-w-[130px] font-medium text-slate-700">{u.supplier_name}</td>
                    <td className="table-cell">{u.grade_code} ({u.dimensions})</td>
                    <td className="table-cell text-slate-500">{formatDate(u.expected_date)}</td>
                    <td className="table-cell font-bold text-slate-900">{formatWeight(u.pending_qty)}</td>
                    <td className="table-cell">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                        {u.days_left === 0 ? 'Today' : `${u.days_left} days`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Physical Receipts Feed */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-emerald-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recent Physical Warehouse Receipts</h2>
          </div>
          <Link href="/purchasing/receipts" className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            View Complete Log ({allReceipts.length.toLocaleString()}) <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-header">Receipt #</th>
                <th className="table-header">PO Number</th>
                <th className="table-header">Date</th>
                <th className="table-header">Supplier Commercial Invoice</th>
                <th className="table-header">Assigned Lot #</th>
                <th className="table-header">Quantity Received</th>
                <th className="table-header">Raw Excel Formula</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {recentReceipts.map((rc) => (
                <tr key={rc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-mono font-bold text-slate-800">{rc.receipt_number}</td>
                  <td className="table-cell font-semibold text-blue-600">
                    <Link href={`/purchasing/purchase-orders/${rc.po_number}`}>
                      PO {rc.po_number}
                    </Link>
                  </td>
                  <td className="table-cell text-slate-600">{formatDate(rc.receipt_date)}</td>
                  <td className="table-cell font-mono text-slate-700">{rc.supplier_invoice_number || '—'}</td>
                  <td className="table-cell">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200">
                      {rc.lot_number || 'UNASSIGNED'}
                    </span>
                  </td>
                  <td className="table-cell font-bold text-emerald-600 text-sm">
                    {formatWeight(rc.received_quantity)}
                  </td>
                  <td className="table-cell text-[11px] font-mono text-slate-400">
                    {rc.raw_formula ? (
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded border text-slate-600">
                        {rc.raw_formula}
                      </span>
                    ) : '—'}
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
