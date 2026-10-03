'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  Truck, 
  Search, 
  Download, 
  Layers, 
  History, 
  ArrowLeftRight, 
  X,
  Building2,
  PackageCheck,
  PackageOpen,
  Ship,
  MapPin,
  ExternalLink,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { Lot, InventoryTransaction } from '@/types';
import { formatWeight, formatDate, getStatusBadgeClass } from '@/lib/utils';
import * as XLSX from 'xlsx';

function LotsContent() {
  const searchParams = useSearchParams();

  const [dataVersion, setDataVersion] = useState(0);

  // Filters initialized from URL parameters if available
  const initialSearch = searchParams.get('q') || searchParams.get('search') || searchParams.get('lot') || '';
  const initialGrade = searchParams.get('grade') || 'ALL';
  const initialSection = searchParams.get('section') || 'ALL';
  const initialSupplier = searchParams.get('supplier') || 'ALL';
  const initialStatus = searchParams.get('status') || 'ALL';

  const [search, setSearch] = useState(initialSearch);
  const [selectedGrade, setSelectedGrade] = useState(initialGrade);
  const [selectedSection, setSelectedSection] = useState(initialSection);
  const [selectedSupplier, setSelectedSupplier] = useState(initialSupplier);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [dateFilter, setDateFilter] = useState('ALL');
  const [customDate, setCustomDate] = useState('');

  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [lotHistory, setLotHistory] = useState<InventoryTransaction[]>([]);

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  // Update filters if URL query params change
  useEffect(() => {
    const g = searchParams.get('grade');
    if (g) setSelectedGrade(g);
    const s = searchParams.get('section');
    if (s) setSelectedSection(s);
    const sup = searchParams.get('supplier');
    if (sup) setSelectedSupplier(sup);
    const st = searchParams.get('status');
    if (st) setSelectedStatus(st);
    const q = searchParams.get('q') || searchParams.get('search') || searchParams.get('lot');
    if (q) setSearch(q);
  }, [searchParams]);

  const allLots = useMemo(() => dataStore.getLots(), [dataVersion]);

  // Derived metadata map for each lot: Material, Arriving Date, and Payment Terms
  const lotMetaMap = useMemo(() => {
    const map: Record<string, { material: string; arrivingDate: string; paymentTerms: string }> = {};
    const allPOs = dataStore.getPurchaseOrders();
    const allIncoming = dataStore.getIncomingStock();
    const allReceipts = dataStore.getReceipts();

    for (const lot of allLots) {
      let material = lot.section_name ? `${lot.section_name} Tool Steel` : 'Tool & Die Steel';
      let arrivingDate = '';
      let paymentTerms = 'DP at sight';

      // 1. Look up from incoming stock
      const inc = allIncoming.find(i => i.lot_number === lot.lot_number);
      if (inc) {
        if (inc.eta_seaport) arrivingDate = inc.eta_seaport;
        else if (inc.date_of_shipment) arrivingDate = inc.date_of_shipment;

        if (inc.payment_terms) paymentTerms = inc.payment_terms;
        if (inc.condition || inc.make) {
          material = [inc.make, inc.condition].filter(Boolean).join(' • ') || inc.grade || material;
        }
      }

      // 2. Look up from PO and items
      if (lot.po_number) {
        const po = allPOs.find(p => p.po_number === lot.po_number);
        if (po) {
          if (po.payment_terms && (!paymentTerms || paymentTerms === 'DP at sight')) {
            paymentTerms = po.payment_terms;
          }
          if (!arrivingDate && po.expected_delivery_date) {
            arrivingDate = po.expected_delivery_date;
          }
          const item = po.items?.find(it => it.lot_number === lot.lot_number || it.id === lot.purchase_order_item_id);
          if (item) {
            if (item.eta_seaport) arrivingDate = item.eta_seaport;
            else if (item.date_of_shipment && !arrivingDate) arrivingDate = item.date_of_shipment;
            else if (item.expected_delivery_date && !arrivingDate) arrivingDate = item.expected_delivery_date;

            if (item.payment_terms) paymentTerms = item.payment_terms;
            const matParts = [item.condition_name, item.treatment].filter(Boolean);
            if (matParts.length > 0) {
              material = matParts.join(' • ');
            }
          }
        }
      }

      if (!arrivingDate) {
        const rc = allReceipts.find(r => r.lot_number === lot.lot_number || r.lot_id === lot.id);
        if (rc?.receipt_date) arrivingDate = rc.receipt_date;
        else if (lot.created_at) arrivingDate = lot.created_at.split('T')[0];
      }

      map[lot.id] = {
        material,
        arrivingDate,
        paymentTerms
      };
    }
    return map;
  }, [allLots, dataVersion]);

  // Dropdown Options
  const uniqueGrades = useMemo(() => {
    const set = new Set(allLots.map(l => l.grade_code).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allLots]);

  const uniqueSections = useMemo(() => {
    const set = new Set(allLots.map(l => l.section_name).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allLots]);

  const uniqueSuppliers = useMemo(() => {
    const set = new Set(allLots.map(l => l.supplier_name).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allLots]);

  // Filter and sort lots
  const filteredLots = useMemo(() => {
    return allLots
      .filter(l => {
        const meta = lotMetaMap[l.id];

        // Text search
        if (search) {
          const q = search.toLowerCase();
          const matchesLot = (l.lot_number || '').toLowerCase().includes(q);
          const matchesGrade = (l.grade_code || '').toLowerCase().includes(q);
          const matchesSupplier = (l.supplier_name || '').toLowerCase().includes(q);
          const matchesPO = (l.po_number || '').toLowerCase().includes(q);
          const matchesDim = (l.dimensions_display || '').toLowerCase().includes(q);
          const matchesLoc = (l.warehouse_location || '').toLowerCase().includes(q);
          const matchesMat = (meta?.material || '').toLowerCase().includes(q);
          const matchesTerms = (meta?.paymentTerms || '').toLowerCase().includes(q);
          if (!matchesLot && !matchesGrade && !matchesSupplier && !matchesPO && !matchesDim && !matchesLoc && !matchesMat && !matchesTerms) {
            return false;
          }
        }

        // Grade filter
        if (selectedGrade !== 'ALL' && l.grade_code !== selectedGrade) {
          return false;
        }

        // Section filter
        if (selectedSection !== 'ALL' && l.section_name !== selectedSection) {
          return false;
        }

        // Supplier filter
        if (selectedSupplier !== 'ALL' && l.supplier_name !== selectedSupplier) {
          return false;
        }

        // Status filter
        if (selectedStatus !== 'ALL') {
          if (selectedStatus === 'IN_STOCK' && (l.available_qty || 0) <= 0) return false;
          if (selectedStatus === 'DEPLETED' && (l.available_qty || 0) > 0) return false;
          if (selectedStatus !== 'IN_STOCK' && selectedStatus !== 'DEPLETED' && l.status !== selectedStatus) {
            return false;
          }
        }

        // Date filter
        if (dateFilter !== 'ALL' || customDate) {
          const arrDateStr = meta?.arrivingDate;
          if (!arrDateStr) return false;

          if (customDate && !arrDateStr.includes(customDate)) {
            return false;
          }

          if (dateFilter !== 'ALL') {
            const arrDate = new Date(arrDateStr);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((arrDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (dateFilter === 'NEXT_7_DAYS' && (diffDays < 0 || diffDays > 7)) return false;
            if (dateFilter === 'NEXT_14_DAYS' && (diffDays < 0 || diffDays > 14)) return false;
            if (dateFilter === 'NEXT_30_DAYS' && (diffDays < 0 || diffDays > 30)) return false;
            if (dateFilter === 'OVERDUE' && diffDays >= 0) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const lotA = (a.lot_number || '').trim();
        const lotB = (b.lot_number || '').trim();
        const numA = parseFloat(lotA);
        const numB = parseFloat(lotB);
        let diff = 0;
        if (!isNaN(numA) && !isNaN(numB) && String(numA) === lotA && String(numB) === lotB) {
          diff = numB - numA;
        } else {
          diff = lotB.localeCompare(lotA, undefined, { numeric: true, sensitivity: 'base' });
        }
        return sortDir === 'desc' ? diff : -diff;
      });
  }, [allLots, search, selectedGrade, selectedSection, selectedSupplier, selectedStatus, dateFilter, customDate, sortDir, lotMetaMap]);

  // Auto-inspect lot if lot parameter was passed and matching lot exists
  useEffect(() => {
    const lotParam = searchParams.get('lot');
    if (lotParam && !selectedLot) {
      const match = allLots.find(l => l.lot_number.toLowerCase() === lotParam.toLowerCase());
      if (match) {
        handleInspectLot(match);
      }
    }
  }, [searchParams, allLots]);

  const hasActiveFilters = 
    search !== '' || 
    selectedGrade !== 'ALL' || 
    selectedSection !== 'ALL' || 
    selectedSupplier !== 'ALL' || 
    selectedStatus !== 'ALL' ||
    dateFilter !== 'ALL' ||
    customDate !== '';

  const handleResetFilters = () => {
    setSearch('');
    setSelectedGrade('ALL');
    setSelectedSection('ALL');
    setSelectedSupplier('ALL');
    setSelectedStatus('ALL');
    setDateFilter('ALL');
    setCustomDate('');
  };

  const handleInspectLot = (lot: Lot) => {
    setSelectedLot(lot);
    const history = dataStore.getLotHistory(lot.id);
    setLotHistory(history);
  };

  const handleExport = () => {
    const exportData = filteredLots.map(l => {
      const meta = lotMetaMap[l.id];
      return {
        'Lot Number': l.lot_number,
        'Material': meta?.material || l.section_name || 'Tool Steel',
        'Steel Grade': l.grade_code,
        'Section': l.section_name,
        'Dimensions': l.dimensions_display,
        'Landed Weight (KG)': l.total_received_qty,
        'Available Weight (KG)': l.available_qty,
        'Arriving Date': meta?.arrivingDate || '',
        'Payment Terms': meta?.paymentTerms || 'DP at sight',
        'PO Number': l.po_number || 'Direct',
        'Supplier': l.supplier_name,
        'Warehouse Location': l.warehouse_location,
        'Status': l.status
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lots Inventory');
    XLSX.writeFile(wb, `Lot_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
              <Truck className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Lot-Based Warehouse Inventory</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track landed lots, physical warehouse locations, allocations, and stock movement ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inventory/stock"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
          >
            <Layers className="h-3.5 w-3.5 text-blue-600" />
            <span>Stock by Spec</span>
          </Link>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lot #, grade, supplier, PO..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Grade Filter */}
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Grades ({uniqueGrades.length})</option>
            {uniqueGrades.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* Section Filter */}
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Sections ({uniqueSections.length})</option>
            {uniqueSections.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Supplier Filter */}
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Suppliers ({uniqueSuppliers.length})</option>
            {uniqueSuppliers.map(sup => (
              <option key={sup} value={sup}>{sup}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_STOCK">In Stock (&gt; 0 KG)</option>
            <option value="DEPLETED">Depleted (0 KG)</option>
            <option value="LOW_STOCK">Low Stock</option>
          </select>

          {/* Arriving Date Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="py-1 px-2 bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Arrival Dates</option>
              <option value="NEXT_7_DAYS">Arriving &le; 7 Days</option>
              <option value="NEXT_14_DAYS">Arriving &le; 14 Days</option>
              <option value="NEXT_30_DAYS">Arriving &le; 30 Days</option>
              <option value="OVERDUE">Arrival Overdue</option>
            </select>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="py-1 px-1.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700 focus:outline-none"
              title="Filter by specific arrival date"
            />
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* KPI Counter */}
        <div className="flex items-center gap-3 text-slate-600">
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded text-slate-700 font-medium transition-colors flex items-center gap-1"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="h-3 w-3 text-slate-500" />
            <span>Order: <strong className="text-slate-900">{sortDir === 'desc' ? 'Highest → Lowest' : 'Lowest → Highest'}</strong></span>
          </button>
          <span>Filtered Lots: <strong className="text-slate-900">{filteredLots.length}</strong></span>
          <span>•</span>
          <span>
            Yard Stock: <strong className="text-emerald-600">
              {formatWeight(filteredLots.reduce((acc, l) => acc + (l.available_qty || 0), 0))}
            </strong>
          </span>
        </div>
      </div>

      {/* Lots Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr>
                <th 
                  className="table-header cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                  title="Click to toggle sorting order"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Lot Number</span>
                    <span className="text-[10px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.5 rounded border border-blue-200">
                      {sortDir === 'desc' ? 'Highest → Lowest ↓' : 'Lowest → Highest ↑'}
                    </span>
                  </div>
                </th>
                <th className="table-header">Material</th>
                <th className="table-header">Grade</th>
                <th className="table-header">Section</th>
                <th className="table-header">Dimensions</th>
                <th className="table-header text-right">Available / Landed Qty</th>
                <th className="table-header">Arriving Date</th>
                <th className="table-header">Payment Terms</th>
                <th className="table-header">PO & Supplier</th>
                <th className="table-header">Warehouse Location</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-right">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredLots.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <Truck className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No lots found matching your filter criteria.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try resetting your filters or adjusting your search term.</p>
                  </td>
                </tr>
              ) : (
                filteredLots.map((lot) => {
                  const meta = lotMetaMap[lot.id];
                  return (
                    <tr 
                      key={lot.id} 
                      onClick={() => handleInspectLot(lot)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="table-cell">
                        <span className="px-2.5 py-1 rounded font-mono font-bold text-xs bg-slate-900 text-white shadow-sm">
                          {lot.lot_number}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="font-semibold text-slate-800 block text-xs truncate max-w-[130px]" title={meta?.material}>
                          {meta?.material || 'Tool Steel'}
                        </span>
                      </td>
                      <td className="table-cell font-bold text-slate-900">{lot.grade_code}</td>
                      <td className="table-cell text-slate-600">{lot.section_name}</td>
                      <td className="table-cell font-mono text-slate-600 text-[11px]">{lot.dimensions_display || '—'}</td>
                      <td className="table-cell text-right">
                        <strong className="text-emerald-600 block font-mono text-xs">{formatWeight(lot.available_qty)}</strong>
                        <span className="text-[10px] text-slate-400 font-medium">Recd: {formatWeight(lot.total_received_qty)}</span>
                      </td>
                      <td className="table-cell">
                        <span className="font-medium text-slate-800 text-xs block whitespace-nowrap">
                          {formatDate(meta?.arrivingDate)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold text-[10px] border border-blue-200/60 whitespace-nowrap">
                          {meta?.paymentTerms || 'DP at sight'}
                        </span>
                      </td>
                      <td className="table-cell">
                        {lot.po_number ? (
                          <Link 
                            href={`/purchasing/purchase-orders/${lot.po_number}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-bold text-blue-600 hover:underline block"
                          >
                            PO {lot.po_number}
                          </Link>
                        ) : (
                          <span className="text-slate-400 block">—</span>
                        )}
                        <span className="text-[10px] text-slate-500 block truncate max-w-[120px]" title={lot.supplier_name || ''}>
                          {lot.supplier_name || 'Overseas Supplier'}
                        </span>
                      </td>
                      <td className="table-cell text-slate-600">{lot.warehouse_location || 'Main Yard'}</td>
                      <td className="table-cell text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(lot.status)}`}>
                          {lot.status}
                        </span>
                      </td>
                      <td className="table-cell text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectLot(lot);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto"
                        >
                          <History className="h-3.5 w-3.5" />
                          <span>Ledger</span>
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

      {/* Lot Movement Ledger Modal */}
      {selectedLot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-600 text-white">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Lot Movement History: {selectedLot.lot_number}</h2>
                  <p className="text-xs text-slate-400">Inventory transactions and material traceability</p>
                </div>
              </div>
              <button onClick={() => setSelectedLot(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-700">
              {/* Lot Summary Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Steel Spec</span>
                  <span className="font-bold text-slate-900">{selectedLot.grade_code} ({selectedLot.section_name})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Source PO</span>
                  <span className="font-bold text-blue-600">PO {selectedLot.po_number || 'Direct'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Landed</span>
                  <span className="font-bold text-slate-900">{formatWeight(selectedLot.total_received_qty)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Current Balance</span>
                  <span className="font-bold text-emerald-600">{formatWeight(selectedLot.available_qty)}</span>
                </div>
              </div>

              {/* Linked Incoming Stock / Logistics Details */}
              {(() => {
                const incItems = dataStore.getIncomingStockByLot(selectedLot.lot_number);
                if (incItems.length === 0) return null;
                const first = incItems[0];
                return (
                  <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                        <Ship className="h-4 w-4 text-blue-600" />
                        <span>Port Logistics & Sea Transit Specs (INCOMING STOCK.xlsx)</span>
                      </div>
                      <Link 
                        href="/purchasing/incoming-stock"
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <span>View In-Transit Board</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Port & Terms</span>
                        <span className="font-semibold text-slate-800">{first.port || 'N.S.'} ({first.delivery_terms || 'FOB'})</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Sea Port ETA</span>
                        <span className="font-semibold text-slate-800">{formatDate(first.eta_seaport)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Payment Terms</span>
                        <span className="font-semibold text-slate-800">{first.payment_terms || (selectedLot ? lotMetaMap[selectedLot.id]?.paymentTerms : '') || 'DP at sight'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Transit Status</span>
                        <span className={`inline-block px-1.5 py-0.2 rounded font-bold text-[10px] ${first.received_status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                          {first.received_status === 'RECEIVED' ? 'Received at Yard' : 'In-Transit'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Ledger Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-blue-600" />
                  <span>Audit Movement Ledger</span>
                </h3>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="table-header">Date</th>
                        <th className="table-header">Type</th>
                        <th className="table-header">Reference</th>
                        <th className="table-header text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {lotHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400">
                            No ledger movements recorded for this lot yet.
                          </td>
                        </tr>
                      ) : (
                        lotHistory.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50">
                            <td className="table-cell text-slate-600">{formatDate(tx.transaction_date)}</td>
                            <td className="table-cell">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {tx.transaction_type}
                              </span>
                            </td>
                            <td className="table-cell font-medium text-slate-700">{tx.reference_display || tx.remarks}</td>
                            <td className={`table-cell text-right font-bold text-sm ${tx.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {tx.quantity >= 0 ? `+${formatWeight(tx.quantity)}` : formatWeight(tx.quantity)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-3 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLot(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LotsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading Lot Directory...</div>}>
      <LotsContent />
    </Suspense>
  );
}
