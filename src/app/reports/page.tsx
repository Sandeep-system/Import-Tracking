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
  ArrowRight,
  Database,
  FileSpreadsheet,
  Copy,
  Check,
  ExternalLink,
  Server,
  RefreshCw,
  FileText,
  Sparkles
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

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const generatePowerBIDatasets = () => {
    const stock = dataStore.getIncomingStock();
    const pos = dataStore.getPurchaseOrders();

    const stockRows = stock.map(item => ({
      'Make': item.make || '',
      'Supplier': item.supplier || item.supplier_name || '',
      'LOT': item.lot_number || '',
      'Grade': item.grade || item.grade_code || '',
      'Condition': item.condition || '',
      'DIA/W': item.dia_w ?? (item as any).width_diameter ?? '',
      'T': item.t ?? (item as any).thickness ?? '',
      'L': item.l ?? (item as any).length ?? '',
      'pc': item.pieces ?? '',
      'Weight': item.weight ?? 0,
      'customer': item.customer || 'SE',
      'Port': item.port || '',
      'Date of Shipment': item.date_of_shipment ? String(item.date_of_shipment).split('T')[0] : '',
      'ETA (sea port)': item.eta_seaport ? String(item.eta_seaport).split('T')[0] : '',
      'RECEIVED': item.received_status || (item.date_of_shipment ? 'In Transit' : 'Ready to Ship'),
      'HEAT NO': item.heat_no || (item as any).heat_number || '',
      'SEC WEIGHT': (item as any).sec_weight || '',
      'DEL TERMS': item.delivery_terms || '',
      'PRICE': item.price ?? '',
      'CURRENCY': item.currency || 'USD',
      'SIMS': item.sims || '',
      'PAYMENT TERMS': item.payment_terms || '',
      'HSN Code': item.hsn_code || '',
      'Status': item.received_status || 'In Transit',
      'Linked PO': item.linked_po_number || 'Direct Cargo',
      'Container No': item.container_no || '',
      'Port of Loading': item.port_of_loading || '',
      'System ID': item.id || '',
      'System Source': item.source_sheet || 'INCOMING SE'
    }));

    const pendingRows: any[] = [];
    for (const po of pos) {
      const items = po.items && po.items.length > 0 ? po.items : [null];
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const lineNumber = item?.line_number || idx + 1;
        const orderedQty = item ? (item.ordered_quantity ?? 0) : (po.total_ordered_qty ?? 0);
        const receivedQty = item ? (item.received_quantity ?? 0) : (po.total_received_qty ?? 0);
        const balanceQty = item ? (item.balance_quantity ?? (orderedQty - receivedQty)) : (po.total_balance_qty ?? (orderedQty - receivedQty));
        const actionablePending = item ? (item.actionable_pending_qty ?? balanceQty) : (po.total_actionable_pending_qty ?? balanceQty);

        pendingRows.push({
          'Close': po.is_closed ? 'y' : '',
          'ORDER NO.': po.po_number,
          'ORDER DATE': po.order_date ? String(po.order_date).split('T')[0] : '',
          'REFRENCE': po.reference_person || po.reference || '',
          'SUPPLIER': po.supplier_name || '',
          'ORIGIN': po.origin || (po as any).origin_make_name || '',
          'ITEM NO.': lineNumber,
          'GRADE': item?.grade_code || '',
          'Grade for Documentation': item?.grade_doc || item?.grade_code || '',
          'SECTION': item?.section_name || 'Round',
          'DIA/W': item?.diameter_width ?? '',
          'T': item?.thickness ?? '',
          'LENGTH': item?.length ?? '',
          'TREATMENT': item?.treatment || '',
          'surface condition': item?.condition_name || '',
          'OR. QTY.': orderedQty,
          'RECD. QTY.': receivedQty,
          'BAL QTY.': balanceQty,
          'PRICE': item?.purchase_price ?? '',
          'CURRENCY': item?.currency || po.currency || 'USD',
          'O/C NO': po.oc_number || '',
          'DATE OF O-C-': po.oc_date ? String(po.oc_date).split('T')[0] : '',
          'TERMS': item?.delivery_terms || po.delivery_terms || '',
          'CONTRACT DELIVERY DATE': po.contract_delivery_date ? String(po.contract_delivery_date).split('T')[0] : '',
          'DELIVERY': item?.expected_delivery_date ? String(item.expected_delivery_date).split('T')[0] : (po.expected_delivery_date ? String(po.expected_delivery_date).split('T')[0] : ''),
          'PAYMENT': item?.payment_terms || po.payment_terms || '',
          'DESTINATION': item?.destination_port || po.destination || '',
          'Inv. No': item?.receipts?.[0]?.supplier_invoice_number || (po as any).receipts?.[0]?.supplier_invoice_number || '',
          'Inv. Date': item?.receipts?.[0]?.supplier_invoice_date ? String(item.receipts[0].supplier_invoice_date).split('T')[0] : '',
          'LOT No.': item?.lot_number || '',
          'CUSTOMER': po.customer_name || 'SE',
          'S .P.': (po as any).sales_person || '',
          'REMARKS': item?.remarks || po.remarks || '',
          'Actionable Pending Qty': actionablePending,
          'Physical Short Qty': item?.physical_short_qty ?? po.total_physical_short_qty ?? 0,
          'Carried Forward Qty': item?.carried_forward_qty ?? po.total_carried_forward_qty ?? 0,
          'Waived Qty': item?.waived_qty ?? po.total_waived_qty ?? 0,
          'System Status': item?.status || po.status || 'Open',
          'Is Overdue': po.is_overdue ? 'YES' : 'NO',
          'Days Overdue': po.days_overdue ?? 0
        });
      }
    }

    return { stockRows, pendingRows };
  };

  const exportPowerBICombined = () => {
    const { stockRows, pendingRows } = generatePowerBIDatasets();
    const wb = XLSX.utils.book_new();
    const wsStock = XLSX.utils.json_to_sheet(stockRows);
    const wsPending = XLSX.utils.json_to_sheet(pendingRows);
    XLSX.utils.book_append_sheet(wb, wsStock, 'INCOMING SE');
    XLSX.utils.book_append_sheet(wb, wsPending, 'Pending Order');
    XLSX.writeFile(wb, `PowerBI_System_Dataset_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPowerBIStock = (format: 'xlsx' | 'csv' = 'xlsx') => {
    const { stockRows } = generatePowerBIDatasets();
    const ws = XLSX.utils.json_to_sheet(stockRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'INCOMING SE');
    if (format === 'csv') {
      XLSX.writeFile(wb, `PowerBI_INCOMING_SE_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, `PowerBI_INCOMING_SE_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const exportPowerBIPending = (format: 'xlsx' | 'csv' = 'xlsx') => {
    const { pendingRows } = generatePowerBIDatasets();
    const ws = XLSX.utils.json_to_sheet(pendingRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending Order');
    if (format === 'csv') {
      XLSX.writeFile(wb, `PowerBI_IMPORT_PENDING_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, `PowerBI_IMPORT_PENDING_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
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
          { id: 'closed', label: 'Closed Orders', count: closedOrders.length, icon: CheckCircle2 },
          { id: 'powerbi', label: 'Power BI Integration', count: 'Direct', icon: BarChart3 }
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

        {/* TAB 8: POWER BI INTEGRATION */}
        {activeTab === 'powerbi' && (
          <div className="p-6 space-y-6">
            {/* Header Card */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-xl p-6 shadow-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 text-[11px] font-semibold">
                    <Sparkles className="h-3 w-3 text-amber-300" />
                    <span>Power BI Dashboard Ready</span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Connect Power BI to Import Tracking System</h2>
                  <p className="text-xs text-blue-200 max-w-2xl leading-relaxed">
                    Connect your existing Power BI reports to live system data without breaking your existing visuals, measures, or DAX calculations. All original column names from <code className="bg-white/10 px-1 py-0.5 rounded font-mono">INCOMING SE</code> and <code className="bg-white/10 px-1 py-0.5 rounded font-mono">Pending Order</code> are 100% preserved.
                  </p>
                </div>
                <div>
                  <button
                    onClick={exportPowerBICombined}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Combined Power BI Pack (.xlsx)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Integration Methods Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Method 1: Drop-in File Swap */}
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 flex flex-col justify-between hover:border-blue-300 transition-colors">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600">Option 1 • Instant (Recommended)</span>
                      <h3 className="text-sm font-bold text-slate-900">Direct Excel / CSV Swap</h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Replace or update your existing workbook data sources with identical column headers. Power BI refreshes in 1-click with zero DAX errors.
                  </p>
                  
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                      <span>INCOMING SE Sheet</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => exportPowerBIStock('xlsx')}
                          className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded text-[10px] font-bold text-slate-600 transition-colors"
                        >
                          .XLSX
                        </button>
                        <button
                          onClick={() => exportPowerBIStock('csv')}
                          className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded text-[10px] font-bold text-slate-600 transition-colors"
                        >
                          .CSV
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                      <span>Pending Order Sheet</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => exportPowerBIPending('xlsx')}
                          className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded text-[10px] font-bold text-slate-600 transition-colors"
                        >
                          .XLSX
                        </button>
                        <button
                          onClick={() => exportPowerBIPending('csv')}
                          className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded text-[10px] font-bold text-slate-600 transition-colors"
                        >
                          .CSV
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80">
                  <button
                    onClick={exportPowerBICombined}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Unified File</span>
                  </button>
                </div>
              </div>

              {/* Method 2: Supabase PostgreSQL */}
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 flex flex-col justify-between hover:border-blue-300 transition-colors">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                      <Database className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">Option 2 • Cloud Sync</span>
                      <h3 className="text-sm font-bold text-slate-900">Direct PostgreSQL Database</h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Connect Power BI directly to the live Supabase cloud PostgreSQL database for automated scheduled refreshes in Power BI Service without opening Excel.
                  </p>

                  <div className="bg-slate-100 rounded-lg p-3 space-y-1.5 font-mono text-[11px] text-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Connector:</span>
                      <span className="font-bold">PostgreSQL database</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Host:</span>
                      <span className="font-bold">aws-0-ap-south-1.pooler.supabase.com:6543</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Database:</span>
                      <span className="font-bold">postgres</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Username:</span>
                      <span className="font-bold text-[10px]">postgres.qghgxaridrhqglcdwjxc</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80">
                  <button
                    onClick={() => copyToClipboard('aws-0-ap-south-1.pooler.supabase.com', 'host')}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedKey === 'host' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'host' ? 'Copied Host!' : 'Copy Database Host'}</span>
                  </button>
                </div>
              </div>

              {/* Method 3: Automated CLI Script */}
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 flex flex-col justify-between hover:border-blue-300 transition-colors">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                      <Server className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-purple-600">Option 3 • Automated</span>
                      <h3 className="text-sm font-bold text-slate-900">CLI Automated Export</h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Execute our automated export script from the command line or a scheduled batch file to overwrite your Power BI files automatically anytime.
                  </p>

                  <div className="bg-slate-900 text-slate-200 rounded-lg p-3 font-mono text-[11px] space-y-1">
                    <span className="text-slate-400"># Run anytime from project root:</span>
                    <div className="text-emerald-400 font-bold">npm run export:powerbi</div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-normal">
                    Generates <code className="bg-slate-100 px-1 rounded font-mono">PowerBI_System_Dataset.xlsx</code> in the project folder automatically.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80">
                  <button
                    onClick={() => copyToClipboard('npm run export:powerbi', 'cmd')}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedKey === 'cmd' ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'cmd' ? 'Copied Command!' : 'Copy CLI Command'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Step-by-Step Guide for Power BI Desktop */}
            <div className="border border-slate-200 rounded-xl p-6 bg-white space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-600" />
                <span>How to Switch Your Existing Power BI Dashboard in 3 Minutes</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                  <div className="font-bold text-blue-700 flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">1</span>
                    <span>Download System Dataset</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Click <strong>Download Combined Power BI Pack (.xlsx)</strong> above and save it to your dashboard folder.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                  <div className="font-bold text-blue-700 flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">2</span>
                    <span>Open Power BI Desktop</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Open your current dashboard .pbix file. In the top ribbon, click <strong>Transform Data</strong> &gt; <strong>Data Source Settings</strong>.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                  <div className="font-bold text-blue-700 flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">3</span>
                    <span>Change Data Source</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Select your old file, click <strong>Change Source...</strong>, and browse to select the new <strong>PowerBI_System_Dataset.xlsx</strong>.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                  <div className="font-bold text-blue-700 flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">4</span>
                    <span>Refresh & Verify</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Click <strong>Close & Apply</strong>. Power BI updates instantly with zero broken formulas or missing column errors!
                  </p>
                </div>
              </div>
            </div>

            {/* Column Comparison & New Calculated Fields Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Schema Compatibility & New Enriched Metrics</h4>
                  <p className="text-[11px] text-slate-500">Every legacy column is preserved verbatim, plus advanced operational tracking fields are added automatically.</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">100% Backwards Compatible</span>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="space-y-3">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                    <span>INCOMING SE Sheet Columns</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-[11px] space-y-2 border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-700">Preserved Legacy Headers:</span>
                      <p className="text-slate-500 mt-0.5">Make, Supplier, LOT, Grade, Condition, DIA/W, T, L, pc, Weight, customer, Port, Date of Shipment, ETA (sea port), RECEIVED, HEAT NO, SEC WEIGHT, DEL TERMS, PRICE, CURRENCY, SIMS, PAYMENT TERMS, HSN Code</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="font-semibold text-emerald-700">New System Tracking Fields:</span>
                      <p className="text-slate-600 mt-0.5 font-medium">Status (Ready to Ship / In Transit / Received), Linked PO Number, Container No, Port of Loading, System ID</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                    <span>Pending Order Sheet Columns</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-[11px] space-y-2 border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-700">Preserved Legacy Headers:</span>
                      <p className="text-slate-500 mt-0.5">Close, ORDER NO., ORDER DATE, REFRENCE, SUPPLIER, ORIGIN, ITEM NO., GRADE, Grade for Documentation, SECTION, DIA/W, T, LENGTH, TREATMENT, surface condition, OR. QTY., RECD. QTY., BAL QTY., PRICE, CURRENCY, O/C NO, DATE OF O-C-, TERMS, CONTRACT DELIVERY DATE, DELIVERY, PAYMENT, DESTINATION, Inv. No, Inv. Date, LOT No., CUSTOMER, S .P., REMARKS</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="font-semibold text-emerald-700">New Balance & Shortage Fields:</span>
                      <p className="text-slate-600 mt-0.5 font-medium">Actionable Pending Qty (excluding waived/carried forward), Physical Short Qty, Carried Forward Qty, Waived Qty, System Status, Is Overdue, Days Overdue</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
