'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  Ship, 
  Search, 
  Download, 
  UploadCloud, 
  Filter, 
  MapPin, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  PackageCheck, 
  ArrowRight, 
  Layers, 
  ExternalLink, 
  X, 
  Truck, 
  Building2, 
  Check, 
  RefreshCw,
  FileSpreadsheet,
  Info,
  Anchor
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { dataStore } from '@/lib/dataStore';
import { IncomingStockItem, PurchaseOrder } from '@/types';
import { formatWeight, formatDate, cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

export default function IncomingStockPage() {
  const { isViewer } = useAuth();
  const [dataVersion, setDataVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<'IN_TRANSIT' | 'READY' | 'RECEIVED' | 'PORTS'>('IN_TRANSIT');
  
  // Filters
  const [search, setSearch] = useState('');
  const [selectedPort, setSelectedPort] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [selectedTerms, setSelectedTerms] = useState('ALL');
  const [poLinkFilter, setPoLinkFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');

  // Detail Modal & Receipt Modal
  const [inspectingItem, setInspectingItem] = useState<IncomingStockItem | null>(null);
  const [receivingItem, setReceivingItem] = useState<IncomingStockItem | null>(null);
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [warehouseLocation, setWarehouseLocation] = useState('Main Yard (Port Arrival)');
  const [isReceivingSuccess, setIsReceivingSuccess] = useState(false);

  // Sync / Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadStats, setUploadStats] = useState<{ added: number; updated: number } | null>(null);

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  // Fetch summary
  const summary = useMemo(() => dataStore.getIncomingStockSummary(), [dataVersion]);

  // Fetch items based on tab & filters
  const items = useMemo(() => {
    return dataStore.getIncomingStock({
      status: activeTab === 'PORTS' ? 'IN_TRANSIT' : activeTab,
      search,
      port: selectedPort,
      supplier: selectedSupplier,
    });
  }, [activeTab, search, selectedPort, selectedSupplier, dataVersion]);

  // Filter further by terms & po link status
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedTerms !== 'ALL' && (item.delivery_terms || '').toUpperCase() !== selectedTerms) {
        return false;
      }
      if (poLinkFilter === 'LINKED' && !item.linked_po_number) {
        return false;
      }
      if (poLinkFilter === 'UNLINKED' && item.linked_po_number) {
        return false;
      }
      return true;
    });
  }, [items, selectedTerms, poLinkFilter]);

  // Filter options
  const uniquePorts = useMemo(() => {
    const all = dataStore.getIncomingStock();
    const set = new Set(all.map(i => i.port).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [dataVersion]);

  const uniqueSuppliers = useMemo(() => {
    const all = dataStore.getIncomingStock();
    const set = new Set(all.map(i => i.supplier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [dataVersion]);

  const uniqueTerms = useMemo(() => {
    const all = dataStore.getIncomingStock();
    const set = new Set(all.map(i => (i.delivery_terms || '').toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [dataVersion]);

  // Helpers for ETA calculations
  const getEtaStatus = (etaStr?: string | null) => {
    if (!etaStr) return { text: 'ETA Unspecified', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    const eta = new Date(etaStr);
    if (isNaN(eta.getTime())) return { text: etaStr, color: 'bg-slate-100 text-slate-600 border-slate-200' };
    
    const now = new Date();
    // Normalize to date comparison
    now.setHours(0, 0, 0, 0);
    const etaDate = new Date(eta);
    etaDate.setHours(0, 0, 0, 0);

    const diffMs = etaDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { 
        text: `Port Arrival Overdue (${Math.abs(diffDays)}d ago)`, 
        color: 'bg-rose-50 text-rose-700 border-rose-200' 
      };
    } else if (diffDays === 0) {
      return { 
        text: 'Arriving Today at Port', 
        color: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' 
      };
    } else if (diffDays <= 7) {
      return { 
        text: `Arriving in ${diffDays} days`, 
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' 
      };
    } else if (diffDays <= 20) {
      return { 
        text: `At Sea (${diffDays} days)`, 
        color: 'bg-blue-50 text-blue-700 border-blue-200' 
      };
    } else {
      return { 
        text: `En Route (${diffDays} days)`, 
        color: 'bg-slate-50 text-slate-600 border-slate-200' 
      };
    }
  };

  // Export to Excel
  const handleExport = () => {
    if (activeTab === 'PORTS') {
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
      return;
    }

    const exportRows = filteredItems.map(i => ({
      'Lot Number': i.lot_number,
      'Linked PO': i.linked_po_number || 'Direct Cargo',
      'Make / Mill': i.make,
      'Supplier': i.supplier || (i as any).supplier_name || '',
      'Steel Grade': i.grade || (i as any).grade_code || '',
      'Condition': i.condition || '',
      'DIA / Width (mm)': i.dia_w ?? (i as any).width_diameter ?? '',
      'Thickness (mm)': i.t ?? (i as any).thickness ?? '',
      'Length (mm)': i.l ?? (i as any).length ?? '',
      'Pieces': i.pieces || '',
      'Weight (KG)': i.weight,
      'Customer': i.customer || '',
      'Port of Discharge': i.port || '',
      'Shipment Date': i.date_of_shipment || '',
      'Sea Port ETA': i.eta_seaport || '',
      'Status': i.received_status,
      'Heat Number': i.heat_no || (i as any).heat_number || '',
      'Delivery Terms': i.delivery_terms || '',
      'Price': i.price || '',
      'Currency': i.currency || '',
      'Payment Terms': i.payment_terms || '',
      'HSN Code': i.hsn_code || '',
      'SIMS': i.sims || '',
      'BIS': i.bis || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    const sheetName = activeTab === 'IN_TRANSIT' ? 'In-Transit Stock' : 'Received Stock';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `Incoming_Stock_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Mark Received handler
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
      }, 1200);
    }
  };

  // Handle Excel Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const importedItems: IncomingStockItem[] = [];

        // Check for 'INCOMING SE'
        if (workbook.SheetNames.includes('INCOMING SE')) {
          const ws = workbook.Sheets['INCOMING SE'];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          for (let r = 2; r < rows.length; r++) {
            const row = rows[r];
            if (!row || !row[2]) continue; // col 2 is LOT
              const rawShip = row[12];
              let shipDateStr: string | null = null;
              if (rawShip) {
                if (typeof rawShip === 'number') {
                  const d = new Date(Math.round((rawShip - 25569) * 86400 * 1000));
                  if (!isNaN(d.getTime())) shipDateStr = d.toISOString().split('T')[0];
                } else {
                  shipDateStr = String(rawShip).trim() || null;
                }
              }
              const nowStr = new Date().toISOString().split('T')[0];
              const isReady = !shipDateStr || shipDateStr > nowStr;

              importedItems.push({
                id: `inc-se-up-${r}-${Date.now()}`,
                make: String(row[0] || '').trim(),
                supplier: String(row[1] || '').trim(),
                lot_number: String(row[2]).trim(),
                grade: String(row[3] || '').trim(),
                condition: String(row[4] || '').trim(),
                dia_w: row[5] || null,
                t: row[6] || null,
                l: row[7] || null,
                pieces: row[8] || null,
                weight: Number(row[9]) || 0,
                customer: String(row[10] || '').trim(),
                port: String(row[11] || '').trim(),
                date_of_shipment: shipDateStr,
                eta_seaport: row[13] ? String(row[13]) : null,
                received_status: isReady ? 'READY' : 'IN_TRANSIT',
              heat_no: row[15] ? String(row[15]).trim() : null,
              sec_weight: Number(row[16]) || null,
              delivery_terms: String(row[17] || '').trim(),
              price: Number(row[18]) || null,
              currency: String(row[19] || '').trim(),
              sims: String(row[20] || '').trim(),
              payment_terms: String(row[21] || '').trim(),
              hsn_code: row[22] ? String(row[22]).trim() : null,
              source_sheet: 'INCOMING SE'
            });
          }
        }

        if (importedItems.length > 0) {
          const stats = dataStore.importIncomingStock(importedItems);
          setUploadStats(stats);
        } else {
          alert('Could not find INCOMING SE sheet in the uploaded file.');
        }
      } catch (err: any) {
        alert('Error parsing Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Ship className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Incoming Stock & In-Transit Logistics</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time sea-port tracking for in-transit shipments (<span className="font-semibold text-slate-700">INCOMING SE</span>) and received stock archive (<span className="font-semibold text-slate-700">INCOMING CLOSE</span>) linked to Purchase Orders & Lots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/purchasing/shipments?tab=ports"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 card-shadow transition-colors"
            title="Open Shipments & Port Logistics Tracking Hub"
          >
            <Anchor className="h-3.5 w-3.5 text-indigo-600" />
            <span>Shipments & Port Hub</span>
          </Link>

          {!isViewer && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
            >
              <UploadCloud className="h-3.5 w-3.5 text-blue-600" />
              <span>Sync / Upload Excel</span>
            </button>
          )}

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export View</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">In-Transit Weight</span>
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
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Imminent Arrivals</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-extrabold text-emerald-600">
            {summary.imminentArrivals} Items
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Arriving at port within next 14 days
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
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Received Cargo Archive</span>
            <div className="p-1.5 bg-slate-50 text-slate-600 rounded-lg">
              <PackageCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-800">
            {formatWeight(summary.totalReceivedWeight)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{summary.totalReceivedItems.toLocaleString()} verified records</span>
            <span className="font-semibold text-slate-700">{summary.uniqueReceivedLots} lots</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        {/* Tab Headers */}
        <div className="border-b border-slate-200 px-4 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('IN_TRANSIT')}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'IN_TRANSIT'
                  ? "border-blue-600 text-blue-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Ship className="h-3.5 w-3.5" />
              <span>In-Transit Stock (INCOMING SE)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-extrabold">
                {summary.totalInTransitItems}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('READY')}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'READY'
                  ? "border-amber-600 text-amber-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Ready to Ship (Waiting Departure)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-extrabold">
                {(summary as any).totalReadyItems || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('RECEIVED')}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'RECEIVED'
                  ? "border-emerald-600 text-emerald-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <PackageCheck className="h-3.5 w-3.5" />
              <span>Received Stock Archive (INCOMING CLOSE)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold">
                {summary.totalReceivedItems}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('PORTS')}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'PORTS'
                  ? "border-indigo-600 text-indigo-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Anchor className="h-3.5 w-3.5" />
              <span>Port Terminals & Sea Cargo</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-extrabold">
                {summary.portStats.length} Ports
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 pb-2 sm:pb-0 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            <span>Click any lot to inspect full shipping metallurgy and linked PO details</span>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'PORTS' ? (
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-indigo-600" />
                  <span>Sea Port Terminals & Maritime Cargo Tracking</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time cargo tracking linked to sea port terminals, customs discharge, and arrival countdowns.
                </p>
              </div>

              <Link
                href="/purchasing/shipments?tab=ports"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto"
              >
                <span>Open Full Shipments & Port Hub</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Ports Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.portStats.map((portData) => (
                <div
                  key={portData.port}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 card-shadow flex flex-col justify-between space-y-3 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                        <Anchor className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-xs">{portData.port}</h3>
                        <span className="text-[10px] text-slate-400 font-medium">Maritime Discharge Terminal</span>
                      </div>
                    </div>

                    <Link
                      href={`/purchasing/shipments?tab=ports&port=${encodeURIComponent(portData.port)}`}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                      title="Open port view in hub"
                    >
                      Port Hub ↗
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Total Cargo Weight</span>
                      <strong className="text-blue-700 text-sm">{formatWeight(portData.weight)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Cargo Line Items</span>
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

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedPort(portData.port);
                        setActiveTab('IN_TRANSIT');
                      }}
                      className="flex-1 py-1 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] text-center transition-colors"
                    >
                      View In-Transit Cargo
                    </button>
                    <Link
                      href={`/purchasing/shipments?tab=ports&port=${encodeURIComponent(portData.port)}`}
                      className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] text-center transition-colors"
                    >
                      Hub
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Port Cargo Overview Table */}
            <div className="mt-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Port Volume & Discharge Logistics Comparison
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="table-header">Discharge Terminal</th>
                      <th className="table-header text-right">In-Transit Weight</th>
                      <th className="table-header text-center">Active Shipments</th>
                      <th className="table-header text-center">Cargo Lots</th>
                      <th className="table-header text-center">Next 14 Days</th>
                      <th className="table-header text-center">Overdue Status</th>
                      <th className="table-header text-right">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.portStats.map((portData) => (
                      <tr key={portData.port} className="hover:bg-slate-50 transition-colors">
                        <td className="table-cell">
                          <div className="flex items-center gap-2 font-bold text-slate-900">
                            <Anchor className="h-4 w-4 text-indigo-600 shrink-0" />
                            <span>{portData.port}</span>
                          </div>
                        </td>
                        <td className="table-cell text-right font-extrabold text-blue-700">
                          {formatWeight(portData.weight)}
                        </td>
                        <td className="table-cell text-center font-semibold text-slate-800">
                          {portData.count} items
                        </td>
                        <td className="table-cell text-center font-mono font-bold text-slate-700">
                          {portData.uniqueLots || portData.count} lots
                        </td>
                        <td className="table-cell text-center">
                          {portData.imminentCount ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {portData.imminentCount} arriving soon
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="table-cell text-center">
                          {portData.overdueCount ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              {portData.overdueCount} overdue
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-semibold text-[11px]">Normal ✓</span>
                          )}
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedPort(portData.port);
                                setActiveTab('IN_TRANSIT');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                            >
                              Filter Tracking
                            </button>
                            <Link
                              href={`/purchasing/shipments?tab=ports&port=${encodeURIComponent(portData.port)}`}
                              className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                            >
                              Port Hub ↗
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <>
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
                placeholder="Search lot, supplier, grade, heat #, PO..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
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
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Suppliers ({uniqueSuppliers.length})</option>
              {uniqueSuppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Delivery Terms */}
            {uniqueTerms.length > 0 && (
              <select
                value={selectedTerms}
                onChange={(e) => setSelectedTerms(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="ALL">All Terms</option>
                {uniqueTerms.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}

            {/* PO Link filter */}
            <select
              value={poLinkFilter}
              onChange={(e) => setPoLinkFilter(e.target.value as any)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Linkage</option>
              <option value="LINKED">Linked to POs</option>
              <option value="UNLINKED">Direct / Machinery</option>
            </select>
          </div>

          <div className="text-slate-500 text-[11px]">
            Showing <strong className="text-slate-800">{filteredItems.length}</strong> items
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
          <table className="w-full text-left border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="table-header">Lot Number</th>
                <th className="table-header">Linked PO</th>
                <th className="table-header">Make & Supplier</th>
                <th className="table-header">Steel Grade & Condition</th>
                <th className="table-header text-right">Dimensions (mm) & Pcs</th>
                <th className="table-header text-right">Weight (KG)</th>
                <th className="table-header">Port & Terms</th>
                <th className="table-header">Shipment & Sea Port ETA</th>
                <th className="table-header">Heat / SIMS / Terms</th>
                <th className="table-header text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Ship className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-medium text-slate-600">No incoming stock records found</p>
                    <p className="text-[11px] mt-1">Try clearing search filters or uploading an updated file</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const etaInfo = getEtaStatus(item.eta_seaport);
                  const isTransit = item.received_status === 'IN_TRANSIT';

                  return (
                    <tr 
                      key={`${item.id || 'inc'}-${idx}`} 
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setInspectingItem(item)}
                    >
                      {/* Lot Number */}
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {item.lot_number}
                          </span>
                        </div>
                      </td>

                      {/* Linked PO */}
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        {item.linked_po_number ? (
                          <Link 
                            href={`/purchasing/purchase-orders/${item.linked_po_number}`}
                            className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <span>PO {item.linked_po_number}</span>
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Direct / Mach.</span>
                        )}
                      </td>

                      {/* Make & Supplier */}
                      <td className="table-cell">
                        <div className="font-semibold text-slate-800 truncate max-w-[190px]" title={item.supplier || (item as any).supplier_name}>
                          {item.supplier || (item as any).supplier_name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Make: <span className="font-medium text-slate-700">{item.make || 'Standard'}</span>
                        </div>
                      </td>

                      {/* Grade & Condition */}
                      <td className="table-cell">
                        <div className="font-bold text-slate-900">{item.grade || (item as any).grade_code || '—'}</div>
                        {item.condition && (
                          <div className="text-[10px] text-slate-500 uppercase tracking-tight">
                            {item.condition}
                          </div>
                        )}
                      </td>

                      {/* Dimensions & Pieces */}
                      <td className="table-cell text-right">
                        <div className="font-mono text-slate-700">
                          {[(item.dia_w ?? (item as any).width_diameter) ? `W${item.dia_w ?? (item as any).width_diameter}` : '', (item.t ?? (item as any).thickness) ? `T${item.t ?? (item as any).thickness}` : '', (item.l ?? (item as any).length) ? `L${item.l ?? (item as any).length}` : ''].filter(Boolean).join(' × ') || '—'}
                        </div>
                        {item.pieces && (
                          <div className="text-[10px] text-slate-500 font-medium">
                            {item.pieces} {typeof item.pieces === 'number' ? 'pcs' : ''}
                          </div>
                        )}
                      </td>

                      {/* Weight */}
                      <td className="table-cell text-right font-bold text-slate-900">
                        <span className={isTransit ? 'text-blue-700 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                          {formatWeight(item.weight)}
                        </span>
                      </td>

                      {/* Port & Terms */}
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/purchasing/shipments?tab=ports&port=${encodeURIComponent(item.port || '')}`}
                          className="flex items-center gap-1 font-semibold text-slate-800 hover:text-blue-600 transition-colors group/port"
                          title={`Track sea port arrivals at ${item.port || 'terminal'}`}
                        >
                          <MapPin className="h-3 w-3 text-red-500 shrink-0 group-hover/port:scale-110 transition-transform" />
                          <span className="group-hover/port:underline">{item.port || 'N.S.'}</span>
                        </Link>
                        {item.delivery_terms && (
                          <div className="text-[10px] font-mono text-slate-500 uppercase">
                            {item.delivery_terms}
                          </div>
                        )}
                      </td>

                      {/* Shipment & ETA */}
                      <td className="table-cell">
                        {isTransit ? (
                          <div className="space-y-1">
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] border block text-center", etaInfo.color)}>
                              {etaInfo.text}
                            </span>
                            <div className="text-[10px] text-slate-400 text-center">
                              ETA: {formatDate(item.eta_seaport)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold block text-center">
                              Stock Landed / Received
                            </span>
                            <div className="text-[10px] text-slate-400 text-center mt-0.5">
                              Shipped: {formatDate(item.date_of_shipment)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Heat / SIMS / Terms */}
                      <td className="table-cell">
                        {item.heat_no && (
                          <div className="text-[11px] font-mono font-semibold text-slate-800">
                            Heat: {item.heat_no}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.sims && item.sims !== 'NA' && (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                              item.sims === 'Done'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : item.sims === 'Not Required'
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200 font-mono'
                            }`}>
                              SIMS: {item.sims}
                            </span>
                          )}
                          {item.payment_terms && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {item.payment_terms}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                        {isTransit ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {!isViewer && (
                              <button
                                onClick={() => setReceivingItem(item)}
                                className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors shadow-2xs"
                                title="Confirm physical arrival into warehouse/yard"
                              >
                                Receive
                              </button>
                            )}
                            <Link
                              href={`/purchasing/shipments?tab=ports&search=${encodeURIComponent(item.lot_number)}`}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="Track in Shipments & Port Hub"
                            >
                              <Anchor className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        ) : (
                          <button
                            onClick={() => setInspectingItem(item)}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                          >
                            Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>

      {/* INSPECTION DRAWER / MODAL */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Ship className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Incoming Shipment Spec — Lot {inspectingItem.lot_number}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Source: {inspectingItem.source_sheet} • Status: {inspectingItem.received_status}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setInspectingItem(null)} 
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Linked PO alert */}
              {inspectingItem.linked_po_number ? (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Linked Purchase Order</span>
                    <span className="font-extrabold text-sm text-blue-900">PO #{inspectingItem.linked_po_number}</span>
                  </div>
                  <Link
                    href={`/purchasing/purchase-orders/${inspectingItem.linked_po_number}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors"
                  >
                    <span>View Purchase Order</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
                  This item is direct import equipment / machinery or unlinked stock lot.
                </div>
              )}

              {/* Grid Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Grade</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.grade || (inspectingItem as any).grade_code || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Condition</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.condition || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Make / Mill</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.make || 'Standard'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Cargo Weight</span>
                  <div className="font-bold text-blue-700 text-xs mt-0.5">{formatWeight(inspectingItem.weight)}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Pieces</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.pieces || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Dimensions (DIA/W × T × L)</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">
                    {[(inspectingItem.dia_w ?? (inspectingItem as any).width_diameter) ? `W${inspectingItem.dia_w ?? (inspectingItem as any).width_diameter}` : '', (inspectingItem.t ?? (inspectingItem as any).thickness) ? `T${inspectingItem.t ?? (inspectingItem as any).thickness}` : '', (inspectingItem.l ?? (inspectingItem as any).length) ? `L${inspectingItem.l ?? (inspectingItem as any).length}` : ''].filter(Boolean).join(' × ') || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Port of Discharge</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.port || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Sea Port ETA</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{formatDate(inspectingItem.eta_seaport)}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Shipment Date</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{formatDate(inspectingItem.date_of_shipment)}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Heat Number</span>
                  <div className="font-bold font-mono text-slate-900 text-xs mt-0.5">{inspectingItem.heat_no || (inspectingItem as any).heat_number || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Delivery Terms</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.delivery_terms || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Payment Terms</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.payment_terms || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">HSN Code</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">{inspectingItem.hsn_code || '—'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">SIMS Filing</span>
                  <div className="mt-0.5">
                    {inspectingItem.sims ? (
                      inspectingItem.sims === 'Done' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Done</span>
                      ) : inspectingItem.sims === 'Not Required' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Not Required</span>
                      ) : (
                        <span className="font-mono font-bold text-slate-900 text-xs">{inspectingItem.sims}</span>
                      )
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Price & Currency</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">
                    {inspectingItem.price ? `${inspectingItem.price} ${inspectingItem.currency || ''}` : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Supplier: {inspectingItem.supplier}</span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/purchasing/shipments?tab=ports&search=${encodeURIComponent(inspectingItem.lot_number)}`}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1"
                  title="Track in Shipments & Port Hub"
                >
                  <Anchor className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Port Hub</span>
                </Link>
                <button
                  onClick={() => setInspectingItem(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
                {!isViewer && inspectingItem.received_status === 'IN_TRANSIT' && (
                  <button
                    onClick={() => {
                      const itm = inspectingItem;
                      setInspectingItem(null);
                      setReceivingItem(itm);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
                  >
                    Receive at Yard
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MARK AS RECEIVED MODAL */}
      {receivingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <PackageCheck className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Record Physical Receipt at Yard</h3>
              </div>
              <button onClick={() => setReceivingItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {isReceivingSuccess ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
                <h4 className="font-bold text-base text-slate-900">Physical Stock Received!</h4>
                <p className="text-xs text-slate-500">
                  Lot {receivingItem.lot_number} ({formatWeight(receivingItem.weight)}) has been added to warehouse inventory and linked to PO {receivingItem.linked_po_number || 'ledger'}.
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Lot Number:</span>
                    <span className="font-bold text-slate-900">{receivingItem.lot_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Grade & Make:</span>
                    <span className="font-semibold text-slate-800">{receivingItem.grade || (receivingItem as any).grade_code} ({receivingItem.make || 'Standard'})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cargo Weight:</span>
                    <span className="font-extrabold text-blue-700">{formatWeight(receivingItem.weight)}</span>
                  </div>
                  {receivingItem.linked_po_number && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Target PO:</span>
                      <span className="font-bold text-blue-600">PO {receivingItem.linked_po_number}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Receipt Date</label>
                    <input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Warehouse Yard Location</label>
                    <input
                      type="text"
                      value={warehouseLocation}
                      onChange={(e) => setWarehouseLocation(e.target.value)}
                      placeholder="e.g. Main Yard (Bay A), Port Terminal..."
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setReceivingItem(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmReceive}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors"
                  >
                    Confirm & Move to Received
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* UPLOAD / SYNC EXCEL MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Sync INCOMING STOCK.xlsx</h3>
              </div>
              <button onClick={() => { setIsUploadModalOpen(false); setUploadStats(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-500 leading-relaxed">
                Upload your updated <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">INCOMING STOCK.xlsx</code> workbook.
                The system will automatically read sheets <strong className="text-slate-800">INCOMING SE</strong> and match lots to active POs and receipts.
              </p>

              {uploadStats ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                  <div className="font-bold text-emerald-900">Sync Complete!</div>
                  <div className="text-[11px] text-emerald-700">
                    Added {uploadStats.added} new records • Updated {uploadStats.updated} existing items
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50">
                  <UploadCloud className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <label className="cursor-pointer font-bold text-blue-600 hover:text-blue-700 block text-xs">
                    <span>Choose INCOMING STOCK.xlsx file</span>
                    <input 
                      type="file" 
                      accept=".xlsx, .xls" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mt-1">Accepts .xlsx format with sheet &apos;INCOMING SE&apos;</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { setIsUploadModalOpen(false); setUploadStats(null); }}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs"
                >
                  {uploadStats ? 'Done' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
