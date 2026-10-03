'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Anchor, 
  Search, 
  MapPin, 
  Truck, 
  Calendar, 
  ShoppingBag, 
  Ship, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  PackageCheck, 
  Filter, 
  Download, 
  X, 
  ExternalLink, 
  Building2, 
  Layers, 
  Info,
  Check,
  Package
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { IncomingStockItem, PurchaseOrder } from '@/types';
import { formatDate, formatWeight, getEtaStatus, cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

function ShipmentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dataVersion, setDataVersion] = useState(0);

  // Tab State: 'shipments' | 'ports' | 'orders'
  const initialTab = (searchParams.get('tab') as 'shipments' | 'ports' | 'orders') || 'shipments';
  const [activeTab, setActiveTab] = useState<'shipments' | 'ports' | 'orders'>(initialTab);

  // Filters
  const initialSearch = searchParams.get('search') || '';
  const initialPort = searchParams.get('port') || 'ALL';
  const [search, setSearch] = useState(initialSearch);
  const [selectedPort, setSelectedPort] = useState(initialPort);
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [selectedTerms, setSelectedTerms] = useState('ALL');

  // Inspection & Receive Modals
  const [inspectingItem, setInspectingItem] = useState<IncomingStockItem | null>(null);
  const [receivingItem, setReceivingItem] = useState<IncomingStockItem | null>(null);
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [warehouseLocation, setWarehouseLocation] = useState('Nhava Sheva Yard');
  const [isReceivingSuccess, setIsReceivingSuccess] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'shipments' || tabParam === 'ports' || tabParam === 'orders') {
      setActiveTab(tabParam);
    }
    const portParam = searchParams.get('port');
    if (portParam) {
      setSelectedPort(portParam);
    }
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearch(searchParam);
    }
  }, [searchParams]);

  // Data Fetching
  const summary = useMemo(() => dataStore.getIncomingStockSummary(), [dataVersion]);
  
  const inTransitItems = useMemo(() => {
    return dataStore.getIncomingStock({
      status: 'IN_TRANSIT',
      search,
      port: selectedPort === 'ALL' ? undefined : selectedPort,
      supplier: selectedSupplier === 'ALL' ? undefined : selectedSupplier,
    });
  }, [search, selectedPort, selectedSupplier, dataVersion]);

  // Further filter by terms
  const filteredShipments = useMemo(() => {
    if (selectedTerms === 'ALL') return inTransitItems;
    return inTransitItems.filter(i => (i.delivery_terms || '').toUpperCase() === selectedTerms.toUpperCase());
  }, [inTransitItems, selectedTerms]);

  // Unique ports and suppliers for dropdowns
  const allIncoming = useMemo(() => dataStore.getIncomingStock(), [dataVersion]);
  const uniquePorts = useMemo(() => {
    const set = new Set(allIncoming.map(i => i.port).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allIncoming]);

  const uniqueSuppliers = useMemo(() => {
    const set = new Set(allIncoming.map(i => i.supplier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allIncoming]);

  const uniqueTerms = useMemo(() => {
    const set = new Set(allIncoming.map(i => (i.delivery_terms || '').toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [allIncoming]);

  // Active POs for Orders Tab
  const activePOs = useMemo(() => {
    return dataStore.getPurchaseOrders().filter(p => !p.is_closed);
  }, [dataVersion]);

  // Mark Received Handler
  const handleConfirmReceive = () => {
    if (!receivingItem) return;
    const res = dataStore.markIncomingStockReceived(receivingItem.id, {
      receipt_date: receiptDate,
      location: warehouseLocation
    });

    if (res.success) {
      setIsReceivingSuccess(true);
      setTimeout(() => {
        setIsReceivingSuccess(false);
        setReceivingItem(null);
        setDataVersion(v => v + 1);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('app:data-updated'));
        }
      }, 1000);
    }
  };

  // Export to Excel
  const handleExport = () => {
    if (activeTab === 'ports') {
      const portRows = summary.portStats.map(p => ({
        'Sea Port': p.port,
        'Active Shipments': p.count,
        'Unique Lots': p.uniqueLots || p.count,
        'Total Cargo Weight (KG)': p.weight,
        'Arrivals Next 14 Days': p.imminentCount || 0,
        'Overdue Arrivals': p.overdueCount || 0
      }));
      const ws = XLSX.utils.json_to_sheet(portRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Port Logistics');
      XLSX.writeFile(wb, `Port_Logistics_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const exportRows = filteredShipments.map(i => ({
        'Lot Number': i.lot_number,
        'Linked PO': i.linked_po_number || 'Direct Shipment',
        'Make / Mill': i.make,
        'Supplier': i.supplier,
        'Steel Grade': i.grade,
        'Condition': i.condition || '',
        'Dimensions': [i.dia_w ? `DIA ${i.dia_w}` : '', i.t ? `T${i.t}` : '', i.l ? `L${i.l}` : ''].filter(Boolean).join(' x '),
        'Weight (KG)': i.weight,
        'Port of Discharge': i.port || 'N.S.',
        'Date of Shipment': i.date_of_shipment || '',
        'Sea Port ETA': i.eta_seaport || '',
        'Heat Number': i.heat_no || '',
        'SIMS': i.sims || '',
        'Delivery Terms': i.delivery_terms || '',
        'Payment Terms': i.payment_terms || '',
        'Customer': i.customer || ''
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inbound Shipments');
      XLSX.writeFile(wb, `Inbound_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Anchor className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Shipments & Port Logistics Hub</h1>
              <p className="text-xs text-slate-500">
                Track live vessel shipments, discharge ports, and customs clearance linked with Import Tracking
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/purchasing/incoming-stock"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
          >
            <Ship className="h-3.5 w-3.5 text-blue-600" />
            <span>Open Tracking Board</span>
          </Link>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export View</span>
          </button>
        </div>
      </div>

      {/* Linked Logistics Hero Banner */}
      <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white/10 rounded-xl text-blue-200 backdrop-blur-sm">
            <Ship className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Live Import Maritime Tracking</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30 animate-pulse">
                Synced with Tracking (INCOMING SE)
              </span>
            </div>
            <div className="text-base font-extrabold text-white mt-1 flex items-center gap-3">
              <span>{formatWeight(summary.totalInTransitWeight)} in transit</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-blue-200">{summary.totalInTransitItems} active shipments</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-emerald-300">{summary.uniqueTransitLots} cargo lots</span>
            </div>
            <p className="text-[11px] text-blue-200/80 mt-1 flex items-center gap-2">
              <MapPin className="h-3 w-3 text-red-400" />
              <span>Primary Port of Discharge: <strong>Nhava Sheva (N.S.)</strong> & major Indian container terminals</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('ports')}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm",
              activeTab === 'ports'
                ? "bg-amber-500 text-white"
                : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
            )}
          >
            Inspect Ports Analysis →
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">In-Transit Sea Cargo</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Ship className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-extrabold text-blue-700">
            {formatWeight(summary.totalInTransitWeight)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{summary.totalInTransitItems} cargo line items</span>
            <span className="font-semibold text-slate-700">{summary.uniqueTransitLots} lots</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Imminent Port Arrivals</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-extrabold text-emerald-600">
            {summary.imminentArrivals} Shipments
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Reaching sea port within next 14 days
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Primary Discharge Port</span>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-extrabold text-indigo-700">
            {summary.portStats[0]?.port || 'Nhava Sheva (N.S.)'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.portStats[0] ? `${formatWeight(summary.portStats[0].weight)} (${summary.portStats[0].count} items)` : 'No active port'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Port Terminals</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Anchor className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-900">
            {summary.portStats.length} Sea Ports
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {uniquePorts.slice(0, 3).join(', ') || 'N.S., Mundra, Chennai'}
          </div>
        </div>
      </div>

      {/* Main Container with 3 Linked Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 px-4 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('shipments')}
              className={cn(
                "px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'shipments'
                  ? "border-blue-600 text-blue-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Ship className="h-3.5 w-3.5" />
              <span>Active Shipments</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-extrabold">
                {summary.totalInTransitItems}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ports')}
              className={cn(
                "px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'ports'
                  ? "border-indigo-600 text-indigo-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Anchor className="h-3.5 w-3.5" />
              <span>Ports & Logistics Tab</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-extrabold">
                {summary.portStats.length} Ports
              </span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={cn(
                "px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'orders'
                  ? "border-slate-800 text-slate-900 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>PO In-Transit Contracts</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-extrabold">
                {activePOs.length}
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 pb-2 sm:pb-0 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            <span>Marking cargo received syncs with Purchase Orders and moves to Received Stock</span>
          </div>
        </div>

        {/* TAB 1: ACTIVE INBOUND SHIPMENTS */}
        {activeTab === 'shipments' && (
          <div>
            {/* Filter Toolbar */}
            <div className="p-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search lot, supplier, grade, heat #, SIMS, PO..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Port Filter */}
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Ports ({uniquePorts.length})</option>
                  {uniquePorts.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                {/* Supplier Filter */}
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 max-w-[180px]"
                >
                  <option value="ALL">All Suppliers ({uniqueSuppliers.length})</option>
                  {uniqueSuppliers.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {/* Delivery Terms Filter */}
                <select
                  value={selectedTerms}
                  onChange={(e) => setSelectedTerms(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Terms ({uniqueTerms.length})</option>
                  {uniqueTerms.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                {(search || selectedPort !== 'ALL' || selectedSupplier !== 'ALL' || selectedTerms !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setSelectedPort('ALL');
                      setSelectedSupplier('ALL');
                      setSelectedTerms('ALL');
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="text-slate-500 font-medium">
                Showing <strong className="text-slate-900">{filteredShipments.length}</strong> active tracking items
              </div>
            </div>

            {/* Shipments Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="table-header">Lot Number</th>
                    <th className="table-header">Linked PO</th>
                    <th className="table-header">Supplier / Mill</th>
                    <th className="table-header">Steel Grade</th>
                    <th className="table-header">Dimensions (W x T x L)</th>
                    <th className="table-header text-right">Weight (KG)</th>
                    <th className="table-header">Discharge Port</th>
                    <th className="table-header">Shipment Date</th>
                    <th className="table-header">Port ETA & Countdown</th>
                    <th className="table-header">Heat / SIMS</th>
                    <th className="table-header">Terms</th>
                    <th className="table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-400">
                        <Ship className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">No active shipments matching your filters.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Try resetting filters or mark a purchase order item as Shipped.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.map((item) => {
                      const etaInfo = getEtaStatus(item.eta_seaport);
                      const dimStr = [item.dia_w ? `DIA ${item.dia_w}` : '', item.t ? `T${item.t}` : '', item.l ? `L${item.l}` : ''].filter(Boolean).join(' x ');

                      return (
                        <tr 
                          key={item.id}
                          onClick={() => setInspectingItem(item)}
                          className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                        >
                          <td className="table-cell">
                            <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm">
                              {item.lot_number}
                            </span>
                          </td>
                          <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                            {item.linked_po_number ? (
                              <Link
                                href={`/purchasing/purchase-orders/${item.linked_po_number}`}
                                className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                              >
                                <span>PO {item.linked_po_number}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </Link>
                            ) : (
                              <span className="text-slate-400 font-medium">Direct Cargo</span>
                            )}
                          </td>
                          <td className="table-cell">
                            <span className="font-semibold text-slate-800 block truncate max-w-[150px]">{item.supplier}</span>
                            {item.make && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-[150px]">Mill: {item.make}</span>
                            )}
                          </td>
                          <td className="table-cell font-bold text-slate-900">{item.grade}</td>
                          <td className="table-cell font-mono text-slate-700">{dimStr || '—'}</td>
                          <td className="table-cell text-right font-mono font-bold text-blue-700">
                            {formatWeight(item.weight)}
                          </td>
                          <td className="table-cell">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                              <MapPin className="h-3 w-3 text-red-500" />
                              {item.port || 'N.S.'}
                            </span>
                          </td>
                          <td className="table-cell text-slate-600 font-medium">
                            {formatDate(item.date_of_shipment)}
                          </td>
                          <td className="table-cell">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-800 block">{formatDate(item.eta_seaport)}</span>
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] border ${etaInfo.color}`}>
                                {etaInfo.text}
                              </span>
                            </div>
                          </td>
                          <td className="table-cell">
                            <div className="font-mono text-[11px]">
                              {item.heat_no && <span className="block font-semibold text-slate-700">HT: {item.heat_no}</span>}
                              {item.sims && <span className="text-[10px] text-slate-400 block">SIMS: {item.sims}</span>}
                              {!item.heat_no && !item.sims && <span className="text-slate-400">—</span>}
                            </div>
                          </td>
                          <td className="table-cell">
                            <span className="font-semibold text-slate-800 block">{item.delivery_terms || 'FOB'}</span>
                            {item.payment_terms && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-[100px]">{item.payment_terms}</span>
                            )}
                          </td>
                          <td className="table-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setReceivingItem(item);
                                setWarehouseLocation(item.port?.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                              }}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-sm transition-colors flex items-center gap-1 ml-auto"
                              title="Receive cargo arrival into warehouse inventory"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Receive</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PORTS & DISCHARGE TERMINALS (PORT TAB) */}
        {activeTab === 'ports' && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Sea-Port Logistics & Container Discharge Analysis</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Consolidated view of cargo en route to maritime terminals. Select any port to inspect incoming shipments.
              </p>
            </div>

            {/* Ports Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.portStats.map((portData) => {
                const isSelected = selectedPort === portData.port;
                return (
                  <div
                    key={portData.port}
                    onClick={() => setSelectedPort(isSelected ? 'ALL' : portData.port)}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer card-shadow flex flex-col justify-between space-y-3",
                      isSelected
                        ? "border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/20"
                        : "border-slate-200 bg-white hover:border-blue-300"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                          <Anchor className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-xs">{portData.port}</h3>
                          <span className="text-[10px] text-slate-400 font-medium">Sea Port Terminal</span>
                        </div>
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      )}>
                        {isSelected ? 'Active Filter' : 'Select'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Total Cargo Weight</span>
                        <strong className="text-blue-700 text-sm">{formatWeight(portData.weight)}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Shipments & Lots</span>
                        <strong className="text-slate-800">{portData.count} items ({portData.uniqueLots || portData.count} lots)</strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                      {portData.imminentCount ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {portData.imminentCount} arriving &lt; 14d
                        </span>
                      ) : (
                        <span>No arrivals &lt; 14d</span>
                      )}

                      {portData.overdueCount ? (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {portData.overdueCount} overdue
                        </span>
                      ) : (
                        <span className="text-slate-400">On Schedule ✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Port Detail Banner & Reset */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-500" />
                <span>
                  Currently filtering by Port: <strong className="text-slate-900 font-bold">{selectedPort}</strong>
                  {selectedPort !== 'ALL' && ` (${filteredShipments.length} cargo items)`}
                </span>
              </div>
              {selectedPort !== 'ALL' && (
                <button
                  onClick={() => setSelectedPort('ALL')}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-semibold text-xs transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  <span>Show All Ports</span>
                </button>
              )}
            </div>

            {/* Port Cargo Shipments Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="table-header">Lot Number</th>
                    <th className="table-header">PO Number</th>
                    <th className="table-header">Supplier</th>
                    <th className="table-header">Steel Grade</th>
                    <th className="table-header text-right">Weight (KG)</th>
                    <th className="table-header">Date of Shipment</th>
                    <th className="table-header">Sea Port ETA</th>
                    <th className="table-header">Arrival Status</th>
                    <th className="table-header">Heat / SIMS</th>
                    <th className="table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No shipments found for port {selectedPort}.
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.map((item) => {
                      const etaInfo = getEtaStatus(item.eta_seaport);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="table-cell font-mono font-bold text-slate-900">{item.lot_number}</td>
                          <td className="table-cell">
                            {item.linked_po_number ? (
                              <Link
                                href={`/purchasing/purchase-orders/${item.linked_po_number}`}
                                className="font-bold text-blue-600 hover:underline"
                              >
                                PO {item.linked_po_number}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="table-cell font-medium text-slate-800">{item.supplier}</td>
                          <td className="table-cell font-bold text-slate-900">{item.grade}</td>
                          <td className="table-cell text-right font-mono font-bold text-blue-700">
                            {formatWeight(item.weight)}
                          </td>
                          <td className="table-cell text-slate-600">{formatDate(item.date_of_shipment)}</td>
                          <td className="table-cell font-semibold text-slate-800">{formatDate(item.eta_seaport)}</td>
                          <td className="table-cell">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${etaInfo.color}`}>
                              {etaInfo.text}
                            </span>
                          </td>
                          <td className="table-cell font-mono text-[11px] text-slate-600">
                            {item.heat_no ? `HT: ${item.heat_no}` : item.sims ? `SIMS: ${item.sims}` : '—'}
                          </td>
                          <td className="table-cell text-right">
                            <button
                              onClick={() => {
                                setReceivingItem(item);
                                setWarehouseLocation(item.port?.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors ml-auto flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Receive</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: PO IN-TRANSIT CONTRACTS */}
        {activeTab === 'orders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">PO Number</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Destination Port</th>
                  <th className="table-header">Delivery Terms</th>
                  <th className="table-header">Order Confirmation #</th>
                  <th className="table-header">Expected Port Arrival</th>
                  <th className="table-header text-right">Pending Cargo (KG)</th>
                  <th className="table-header text-center">Status</th>
                  <th className="table-header text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activePOs.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <td className="table-cell font-bold text-blue-600">
                      <Link href={`/purchasing/purchase-orders/${po.po_number}`} className="hover:underline flex items-center gap-1">
                        <ShoppingBag className="h-3 w-3" />
                        <span>PO {po.po_number}</span>
                      </Link>
                    </td>
                    <td className="table-cell font-medium text-slate-800">{po.supplier_name}</td>
                    <td className="table-cell">
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <MapPin className="h-3 w-3 text-red-500" />
                        {po.destination || 'N.S.'}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-slate-600">{po.delivery_terms || 'FOB'}</td>
                    <td className="table-cell font-mono text-slate-700">{po.oc_number || '—'}</td>
                    <td className="table-cell text-slate-600">{formatDate(po.expected_delivery_date)}</td>
                    <td className="table-cell text-right font-bold text-blue-700">{formatWeight(po.total_balance_qty)}</td>
                    <td className="table-cell text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {po.status}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <Link
                        href={`/purchasing/purchase-orders/${po.po_number}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Open Contract →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Item Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5 text-blue-600">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Ship className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Shipment Item: Lot {inspectingItem.lot_number}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {inspectingItem.grade} • {inspectingItem.supplier}
                  </p>
                </div>
              </div>
              <button onClick={() => setInspectingItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Make / Mill</span>
                <span className="font-bold text-slate-800">{inspectingItem.make || 'Standard'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Cargo Weight</span>
                <span className="font-mono font-bold text-blue-700 text-sm">{formatWeight(inspectingItem.weight)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Port of Discharge</span>
                <span className="font-semibold text-slate-800">{inspectingItem.port || 'N.S.'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Vessel ETA</span>
                <span className="font-semibold text-slate-800">{formatDate(inspectingItem.eta_seaport)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Heat Number</span>
                <span className="font-mono font-bold text-slate-800">{inspectingItem.heat_no || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">SIMS Registration</span>
                <span className="font-mono text-slate-700">{inspectingItem.sims || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Delivery Terms</span>
                <span className="font-semibold text-slate-800">{inspectingItem.delivery_terms || 'FOB'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Payment Terms</span>
                <span className="font-semibold text-slate-800">{inspectingItem.payment_terms || '—'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const it = inspectingItem;
                  setInspectingItem(null);
                  setReceivingItem(it);
                  setWarehouseLocation(it.port?.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                Receive into Yard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Receive Modal */}
      {receivingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-600 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Confirm Port Arrival & Cargo Receipt
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lot: {receivingItem.lot_number} • {receivingItem.grade} • Port: {receivingItem.port || 'N.S.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReceivingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              {isReceivingSuccess ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3 animate-in fade-in">
                  <Check className="h-5 w-5 text-emerald-600" />
                  <span className="font-bold">Cargo successfully checked into warehouse inventory and marked Received!</span>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-800 font-semibold">Material Grade:</span>
                      <span className="font-bold text-slate-900">{receivingItem.grade}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-800 font-semibold">Cargo Weight:</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">{formatWeight(receivingItem.weight)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-800 font-semibold">Supplier:</span>
                      <span className="text-slate-800 font-semibold">{receivingItem.supplier}</span>
                    </div>
                    {receivingItem.linked_po_number && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-emerald-800 font-semibold">Linked Purchase Order:</span>
                        <span className="font-bold text-blue-700">PO {receivingItem.linked_po_number}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">Receipt Date *</label>
                      <input
                        type="date"
                        required
                        value={receiptDate}
                        onChange={(e) => setReceiptDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-800 mb-1">Warehouse / Yard Location</label>
                      <input
                        type="text"
                        value={warehouseLocation}
                        onChange={(e) => setWarehouseLocation(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[11px] leading-relaxed">
                    Confirming moves the item in Incoming Stock to <strong>Received Stock (INCOMING CLOSE)</strong>, updates the linked PO line item to <strong>Received</strong>, and registers inventory lots.
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setReceivingItem(null)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmReceive}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm Cargo Arrival</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShipmentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading Shipments & Ports Hub...</div>}>
      <ShipmentsContent />
    </Suspense>
  );
}
