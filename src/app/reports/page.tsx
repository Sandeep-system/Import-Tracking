'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  BarChart3, 
  Download, 
  Clock, 
  AlertTriangle, 
  PackageCheck, 
  Layers, 
  Building2, 
  Truck,
  CheckCircle2,
  Scale,
  History,
  ArrowRight
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight, formatDate, getStatusBadgeClass } from '@/lib/utils';
import * as XLSX from 'xlsx';

function ReportsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setTick(t => t + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const allPOs = dataStore.getPurchaseOrders();
  const lots = dataStore.getLots();
  const suppliers = dataStore.getSuppliers();
  const allResolutions = dataStore.getBalanceResolutions();

  // Extract Overdue & Over-Received Items
  const overdueItems: any[] = [];
  const overReceivedItems: any[] = [];
  const pendingOrders = allPOs.filter(p => !p.is_closed && !p.status?.startsWith('Closed') && ((p.total_actionable_pending_qty ?? p.total_balance_qty ?? 0) > 0));
  const closedOrders = allPOs.filter(p => p.is_closed || p.status?.startsWith('Closed'));

  for (const po of allPOs) {
    for (const item of (po.items || [])) {
      if (item.is_overdue) {
        overdueItems.push({
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          grade_code: item.grade_code,
          dimensions: `${item.diameter_width || '—'}${item.thickness ? 'x' + item.thickness : ''} mm`,
          ordered_qty: item.ordered_quantity,
          received_qty: item.received_quantity,
          pending_qty: item.actionable_pending_qty ?? item.balance_quantity ?? 0,
          expected_date: item.expected_delivery_date || po.expected_delivery_date,
          days_overdue: item.days_overdue
        });
      }
      if (item.status === 'Over Received') {
        overReceivedItems.push({
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          grade_code: item.grade_code,
          dimensions: `${item.diameter_width || '—'}${item.thickness ? 'x' + item.thickness : ''} mm`,
          ordered_qty: item.ordered_quantity,
          received_qty: item.received_quantity,
          over_qty: Math.abs(item.balance_quantity || 0),
          receipt_count: item.receipt_count
        });
      }
    }
  }

  // Supplier Shortage & Fulfillment Performance Aggregation
  const supplierShortageMap: Record<string, {
    supplier_name: string;
    total_pos: number;
    total_ordered: number;
    total_received: number;
    total_short: number;
    total_carried_forward: number;
    total_waived: number;
    total_actionable: number;
  }> = {};

  for (const po of allPOs) {
    const sName = po.supplier_name || 'Generic Supplier';
    if (!supplierShortageMap[sName]) {
      supplierShortageMap[sName] = {
        supplier_name: sName,
        total_pos: 0,
        total_ordered: 0,
        total_received: 0,
        total_short: 0,
        total_carried_forward: 0,
        total_waived: 0,
        total_actionable: 0,
      };
    }
    supplierShortageMap[sName].total_pos += 1;
    supplierShortageMap[sName].total_ordered += (po.total_ordered_qty || 0);
    supplierShortageMap[sName].total_received += (po.total_received_qty || 0);
    supplierShortageMap[sName].total_short += (po.total_physical_short_qty || 0);
    supplierShortageMap[sName].total_carried_forward += (po.total_carried_forward_qty || 0);
    supplierShortageMap[sName].total_waived += (po.total_waived_qty || 0);
    supplierShortageMap[sName].total_actionable += (po.total_actionable_pending_qty ?? po.total_balance_qty ?? 0);
  }

  const supplierShortageList = Object.values(supplierShortageMap).sort((a, b) => b.total_short - a.total_short);

  const exportCurrentReport = () => {
    let data: any[] = [];
    let reportName = 'Report';

    if (activeTab === 'pending') {
      reportName = 'Pending_Orders_Report';
      data = pendingOrders.map(p => ({
        'PO Number': p.po_number,
        'Order Date': p.order_date,
        'Supplier': p.supplier_name,
        'Ordered Qty (KG)': p.total_ordered_qty,
        'Received Qty (KG)': p.total_received_qty,
        'Physical Short (KG)': p.total_physical_short_qty || 0,
        'Carried Forward (KG)': p.total_carried_forward_qty || 0,
        'Waived (KG)': p.total_waived_qty || 0,
        'Pending Qty (KG)': p.total_actionable_pending_qty ?? p.total_balance_qty ?? 0,
        'Expected Delivery': p.expected_delivery_date,
        'Status': p.status
      }));
    } else if (activeTab === 'supplier_shortage') {
      reportName = 'Supplier_Shortage_Performance_Report';
      data = supplierShortageList.map(s => {
        const fulfillRate = s.total_ordered > 0 ? ((s.total_received / s.total_ordered) * 100).toFixed(1) : '100.0';
        const shortRate = s.total_ordered > 0 ? ((s.total_short / s.total_ordered) * 100).toFixed(1) : '0.0';
        return {
          'Supplier': s.supplier_name,
          'Total POs': s.total_pos,
          'Ordered Qty (KG)': s.total_ordered,
          'Received Qty (KG)': s.total_received,
          'Physical Short (KG)': s.total_short,
          'Carried Forward (KG)': s.total_carried_forward,
          'Waived (KG)': s.total_waived,
          'Pending Qty (KG)': s.total_actionable,
          'Fulfillment Rate (%)': `${fulfillRate}%`,
          'Shortage Rate (%)': `${shortRate}%`
        };
      });
    } else if (activeTab === 'resolutions') {
      reportName = 'Balance_Resolutions_Audit_Report';
      data = allResolutions.map(r => ({
        'Resolution ID': r.id,
        'Date': r.created_at,
        'Source PO': r.po_number,
        'Item ID': r.po_item_id,
        'Resolution Type': r.resolution_type,
        'Resolved Qty (KG)': r.quantity,
        'Linked Item ID': r.linked_po_item_id || '',
        'Reason': r.reason,
        'Remarks': r.remarks || '',
        'Authorized By': r.created_by,
        'Status': r.status,
        'Reversed At': r.reversed_at || '',
        'Reversed By': r.reversed_by || '',
        'Reversal Reason': r.reversal_reason || ''
      }));
    } else if (activeTab === 'overdue') {
      reportName = 'Overdue_Orders_Report';
      data = overdueItems.map(o => ({
        'PO Number': o.po_number,
        'Supplier': o.supplier_name,
        'Grade': o.grade_code,
        'Dimensions': o.dimensions,
        'Ordered Qty (KG)': o.ordered_qty,
        'Pending Qty (KG)': o.pending_qty,
        'Due Date': o.expected_date,
        'Days Overdue': o.days_overdue
      }));
    } else if (activeTab === 'over_received') {
      reportName = 'Over_Received_Report';
      data = overReceivedItems.map(orItem => ({
        'PO Number': orItem.po_number,
        'Supplier': orItem.supplier_name,
        'Grade': orItem.grade_code,
        'Dimensions': orItem.dimensions,
        'Ordered Qty (KG)': orItem.ordered_qty,
        'Received Qty (KG)': orItem.received_qty,
        'Over Received (KG)': orItem.over_qty
      }));
    } else if (activeTab === 'lots') {
      reportName = 'Lot_Inventory_Report';
      data = lots.map(l => ({
        'Lot Number': l.lot_number,
        'PO Number': l.po_number,
        'Grade': l.grade_code,
        'Dimensions': l.dimensions_display,
        'Received Qty (KG)': l.total_received_qty,
        'Available Qty (KG)': l.available_qty,
        'Location': l.warehouse_location
      }));
    } else if (activeTab === 'closed') {
      reportName = 'Closed_Orders_Report';
      data = closedOrders.map(c => ({
        'PO Number': c.po_number,
        'Order Date': c.order_date,
        'Supplier': c.supplier_name,
        'Total Items': c.total_items,
        'Ordered Qty (KG)': c.total_ordered_qty,
        'Final Landed Qty (KG)': c.total_received_qty,
        'Physical Short (KG)': c.total_physical_short_qty || 0,
        'Carried Forward (KG)': c.total_carried_forward_qty || 0,
        'Waived (KG)': c.total_waived_qty || 0,
        'Status': c.status
      }));
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportName);
    XLSX.writeFile(wb, `${reportName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Executive Business Reports</h1>
          <p className="text-xs text-slate-500">Comprehensive pending, closed, shortage performance, balance resolutions, and lot-wise reports with Excel exports</p>
        </div>

        <button
          onClick={exportCurrentReport}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Current View</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 text-xs font-semibold space-x-2 bg-white px-4 rounded-t-xl card-shadow overflow-x-auto">
        {[
          { id: 'pending', label: 'Pending Orders', count: pendingOrders.length, icon: Clock },
          { id: 'supplier_shortage', label: 'Supplier Shortage Performance', count: supplierShortageList.length, icon: Scale },
          { id: 'resolutions', label: 'Balance Resolutions', count: allResolutions.length, icon: History },
          { id: 'overdue', label: 'Overdue Deliveries', count: overdueItems.length, icon: AlertTriangle },
          { id: 'over_received', label: 'Over-Received Items', count: overReceivedItems.length, icon: Layers },
          { id: 'lots', label: 'Lot-wise Stock', count: lots.length, icon: Truck },
          { id: 'closed', label: 'Closed Orders', count: closedOrders.length, icon: CheckCircle2 }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-3.5 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                isActive ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Report Content Panels */}
      <div className="bg-white rounded-b-xl border border-slate-200 card-shadow overflow-hidden">
        {/* TAB 1: PENDING ORDERS */}
        {activeTab === 'pending' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">PO Number</th>
                  <th className="table-header">Order Date</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header text-right">Ordered Qty</th>
                  <th className="table-header text-right">Received Qty</th>
                  <th className="table-header text-right">Physical Short</th>
                  <th className="table-header text-right">Carried Fwd</th>
                  <th className="table-header text-right">Waived</th>
                  <th className="table-header text-right">Pending Qty</th>
                  <th className="table-header">Expected Date</th>
                  <th className="table-header text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400">
                      No open pending orders found.
                    </td>
                  </tr>
                ) : (
                  pendingOrders.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="table-cell font-bold text-blue-600">
                        <Link href={`/purchasing/purchase-orders/${p.po_number}`}>
                          PO {p.po_number}
                        </Link>
                      </td>
                      <td className="table-cell text-slate-600">{formatDate(p.order_date)}</td>
                      <td className="table-cell font-medium text-slate-800">{p.supplier_name}</td>
                      <td className="table-cell text-right font-medium">{formatWeight(p.total_ordered_qty)}</td>
                      <td className="table-cell text-right text-emerald-600 font-semibold">{formatWeight(p.total_received_qty)}</td>
                      <td className="table-cell text-right font-semibold text-slate-600">{formatWeight(p.total_physical_short_qty || 0)}</td>
                      <td className="table-cell text-right text-blue-600 font-medium">{formatWeight(p.total_carried_forward_qty || 0)}</td>
                      <td className="table-cell text-right text-purple-600 font-medium">{formatWeight(p.total_waived_qty || 0)}</td>
                      <td className="table-cell text-right text-blue-700 font-bold">{formatWeight(p.total_actionable_pending_qty ?? p.total_balance_qty ?? 0)}</td>
                      <td className="table-cell text-slate-600">{formatDate(p.expected_delivery_date)}</td>
                      <td className="table-cell text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(p.status)}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: SUPPLIER SHORTAGE PERFORMANCE */}
        {activeTab === 'supplier_shortage' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">Supplier Name</th>
                  <th className="table-header text-center">Total POs</th>
                  <th className="table-header text-right">Ordered Qty</th>
                  <th className="table-header text-right">Received Qty</th>
                  <th className="table-header text-right">Physical Short</th>
                  <th className="table-header text-right">Carried Forward</th>
                  <th className="table-header text-right">Waived</th>
                  <th className="table-header text-right">Pending Qty</th>
                  <th className="table-header text-center">Fulfillment %</th>
                  <th className="table-header text-center">Shortage %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierShortageList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      No supplier records found.
                    </td>
                  </tr>
                ) : (
                  supplierShortageList.map((s, idx) => {
                    const fulfillRate = s.total_ordered > 0 ? (s.total_received / s.total_ordered) * 100 : 100;
                    const shortRate = s.total_ordered > 0 ? (s.total_short / s.total_ordered) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="table-cell font-semibold text-slate-900">{s.supplier_name}</td>
                        <td className="table-cell text-center font-bold text-slate-600">{s.total_pos}</td>
                        <td className="table-cell text-right font-medium">{formatWeight(s.total_ordered)}</td>
                        <td className="table-cell text-right text-emerald-600 font-semibold">{formatWeight(s.total_received)}</td>
                        <td className="table-cell text-right font-bold text-slate-800">{formatWeight(s.total_short)}</td>
                        <td className="table-cell text-right text-blue-600">{formatWeight(s.total_carried_forward)}</td>
                        <td className="table-cell text-right text-purple-600">{formatWeight(s.total_waived)}</td>
                        <td className="table-cell text-right font-bold text-blue-700">{formatWeight(s.total_actionable)}</td>
                        <td className="table-cell text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            fulfillRate >= 95 ? 'bg-emerald-100 text-emerald-800' :
                            fulfillRate >= 80 ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {fulfillRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            shortRate === 0 ? 'bg-slate-100 text-slate-600' :
                            shortRate <= 5 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {shortRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: BALANCE RESOLUTIONS AUDIT LOG */}
        {activeTab === 'resolutions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Source PO</th>
                  <th className="table-header text-center">Resolution Type</th>
                  <th className="table-header text-right">Resolved Qty</th>
                  <th className="table-header">Reason</th>
                  <th className="table-header">Remarks / Link</th>
                  <th className="table-header">Authorized By</th>
                  <th className="table-header text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allResolutions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No balance resolutions recorded yet.
                    </td>
                  </tr>
                ) : (
                  allResolutions.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-50">
                      <td className="table-cell text-slate-500 whitespace-nowrap">{formatDate(res.created_at)}</td>
                      <td className="table-cell font-bold text-blue-600">
                        <Link href={`/purchasing/purchase-orders/${res.po_number}`} className="hover:underline">
                          PO {res.po_number}
                        </Link>
                      </td>
                      <td className="table-cell text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          res.resolution_type === 'CARRY_FORWARD' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          res.resolution_type === 'WAIVED' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {res.resolution_type === 'CARRY_FORWARD' ? 'Carry Forward' : 'Waived'}
                        </span>
                      </td>
                      <td className="table-cell text-right font-bold text-slate-900">
                        {formatWeight(res.quantity)}
                      </td>
                      <td className="table-cell max-w-[200px]">
                        <span className="font-semibold text-slate-800 block truncate">{res.reason}</span>
                      </td>
                      <td className="table-cell max-w-[220px]">
                        {res.remarks && (
                          <span className="text-slate-600 block truncate text-[11px]">{res.remarks}</span>
                        )}
                        {res.linked_po_item_id && (
                          <span className="text-[10px] font-mono text-blue-600 block">
                            Item: {res.linked_po_item_id.slice(0, 14)}...
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-slate-600">{res.created_by}</td>
                      <td className="table-cell text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          res.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                          res.status === 'REVERSED' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {res.status}
                        </span>
                        {res.status === 'REVERSED' && res.reversed_at && (
                          <span className="block text-[9px] text-slate-400 mt-0.5">{formatDate(res.reversed_at)}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: OVERDUE DELIVERIES */}
        {activeTab === 'overdue' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">PO Number</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Material Spec</th>
                  <th className="table-header">Dimensions</th>
                  <th className="table-header text-right">Ordered</th>
                  <th className="table-header text-right">Pending Qty</th>
                  <th className="table-header">Contract Due Date</th>
                  <th className="table-header text-center">Overdue Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdueItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No overdue deliveries.
                    </td>
                  </tr>
                ) : (
                  overdueItems.map((o, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="table-cell font-bold text-blue-600">PO {o.po_number}</td>
                      <td className="table-cell font-medium text-slate-800">{o.supplier_name}</td>
                      <td className="table-cell font-semibold">{o.grade_code}</td>
                      <td className="table-cell font-mono">{o.dimensions}</td>
                      <td className="table-cell text-right">{formatWeight(o.ordered_qty)}</td>
                      <td className="table-cell text-right font-bold text-slate-900">{formatWeight(o.pending_qty)}</td>
                      <td className="table-cell text-slate-500">{formatDate(o.expected_date)}</td>
                      <td className="table-cell text-center">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          {o.days_overdue} Days Late
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 5: OVER-RECEIVED ITEMS */}
        {activeTab === 'over_received' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">PO Number</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Steel Grade</th>
                  <th className="table-header">Dimensions</th>
                  <th className="table-header text-right">Contracted Qty</th>
                  <th className="table-header text-right">Landed Qty</th>
                  <th className="table-header text-right">Excess Landed</th>
                  <th className="table-header text-center">Status Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overReceivedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No over-received items recorded.
                    </td>
                  </tr>
                ) : (
                  overReceivedItems.map((orItem, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="table-cell font-bold text-blue-600">PO {orItem.po_number}</td>
                      <td className="table-cell font-medium text-slate-800">{orItem.supplier_name}</td>
                      <td className="table-cell font-semibold">{orItem.grade_code}</td>
                      <td className="table-cell font-mono">{orItem.dimensions}</td>
                      <td className="table-cell text-right font-medium">{formatWeight(orItem.ordered_qty)}</td>
                      <td className="table-cell text-right font-bold text-emerald-600">{formatWeight(orItem.received_qty)}</td>
                      <td className="table-cell text-right font-bold text-purple-700">+{formatWeight(orItem.over_qty)}</td>
                      <td className="table-cell text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          Over-Received ({formatWeight(orItem.over_qty)})
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 6: LOTS INVENTORY */}
        {activeTab === 'lots' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">Lot Number</th>
                  <th className="table-header">PO Source</th>
                  <th className="table-header">Steel Grade</th>
                  <th className="table-header">Dimensions</th>
                  <th className="table-header text-right">Total Landed</th>
                  <th className="table-header text-right">Available in Yard</th>
                  <th className="table-header">Warehouse Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No lots inventory found.
                    </td>
                  </tr>
                ) : (
                  lots.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="table-cell font-mono font-bold text-slate-900">{l.lot_number}</td>
                      <td className="table-cell font-semibold text-blue-600">PO {l.po_number}</td>
                      <td className="table-cell font-bold text-slate-800">{l.grade_code}</td>
                      <td className="table-cell font-mono text-slate-600">{l.dimensions_display}</td>
                      <td className="table-cell text-right font-medium">{formatWeight(l.total_received_qty)}</td>
                      <td className="table-cell text-right font-bold text-emerald-600">{formatWeight(l.available_qty)}</td>
                      <td className="table-cell text-slate-600">{l.warehouse_location}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 7: CLOSED ORDERS */}
        {activeTab === 'closed' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">PO Number</th>
                  <th className="table-header">Order Date</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header text-right">Total Items</th>
                  <th className="table-header text-right">Ordered Qty</th>
                  <th className="table-header text-right">Final Landed</th>
                  <th className="table-header text-right">Physical Short</th>
                  <th className="table-header text-right">Carried Fwd</th>
                  <th className="table-header text-right">Waived Qty</th>
                  <th className="table-header text-center">Closure Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      No closed orders found.
                    </td>
                  </tr>
                ) : (
                  closedOrders.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="table-cell font-bold text-slate-700">
                        <Link href={`/purchasing/purchase-orders/${c.po_number}`} className="hover:underline text-blue-600">
                          PO {c.po_number}
                        </Link>
                      </td>
                      <td className="table-cell text-slate-500">{formatDate(c.order_date)}</td>
                      <td className="table-cell font-medium text-slate-800">{c.supplier_name}</td>
                      <td className="table-cell text-right font-semibold">{c.total_items}</td>
                      <td className="table-cell text-right font-medium">{formatWeight(c.total_ordered_qty)}</td>
                      <td className="table-cell text-right font-bold text-slate-900">{formatWeight(c.total_received_qty)}</td>
                      <td className="table-cell text-right text-slate-600">{formatWeight(c.total_physical_short_qty || 0)}</td>
                      <td className="table-cell text-right text-blue-600 font-medium">{formatWeight(c.total_carried_forward_qty || 0)}</td>
                      <td className="table-cell text-right text-purple-600 font-medium">{formatWeight(c.total_waived_qty || 0)}</td>
                      <td className="table-cell text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
