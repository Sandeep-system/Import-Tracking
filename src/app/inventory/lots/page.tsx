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
  Filter,
  Package,
  Boxes,
  CheckCircle2,
  Clock,
  FileSpreadsheet
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { Lot, InventoryTransaction } from '@/types';
import { formatWeight, formatDate, getStatusBadgeClass, cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

function LotsContent() {
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
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
  const [modalTab, setModalTab] = useState<'items' | 'ledger' | 'shipping'>('items');
  const [lotItemSearch, setLotItemSearch] = useState('');

  useEffect(() => {
    setMounted(true);
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

  const allLots = useMemo(() => {
    return dataStore.getLots().filter(l => Boolean(l.lot_number && l.lot_number.trim() && !l.lot_number.startsWith('LOT-undefined')));
  }, [dataVersion]);

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
    setModalTab('items');
    setLotItemSearch('');
    const history = dataStore.getLotHistory(lot.id);
    setLotHistory(history);
  };

  // Items contained in the currently selected lot
  const selectedLotItems = useMemo(() => {
    if (!selectedLot) return [];

    const incItems = dataStore.getIncomingStockByLot(selectedLot.lot_number);
    const allPOs = dataStore.getPurchaseOrders();
    const poItems: Array<{
      id: string;
      source: 'INCOMING' | 'PO';
      grade: string;
      condition?: string | null;
      dimensions: string;
      dia_w?: number | string | null;
      t?: number | string | null;
      l?: number | string | null;
      pieces: number;
      weight: number;
      status: string;
      customer?: string | null;
      eta?: string | null;
      date_of_shipment?: string | null;
      heat_no?: string | null;
      sec_weight?: number | string | null;
      delivery_terms?: string | null;
      price?: number | string | null;
      currency?: string | null;
      sims?: string | null;
      payment_terms?: string | null;
      hsn_code?: string | null;
      port?: string | null;
      make?: string | null;
      supplier?: string | null;
      poNumber?: string | null;
    }> = [];

    if (incItems.length > 0) {
      incItems.forEach((inc, idx) => {
        const dimParts = [
          inc.dia_w ? `DIA ${inc.dia_w}` : '',
          inc.t ? `T${inc.t}` : '',
          inc.l ? `L${inc.l}` : ''
        ].filter(Boolean);

        const dimStr = dimParts.join(' × ');

        poItems.push({
          id: inc.id || `inc-${idx}`,
          source: 'INCOMING',
          grade: inc.grade,
          condition: inc.condition,
          dimensions: dimStr || (selectedLot.dimensions_display || 'Standard Spec'),
          dia_w: inc.dia_w,
          t: inc.t,
          l: inc.l,
          pieces: Number(inc.pieces) || 1,
          weight: Number(inc.weight) || 0,
          status: inc.received_status === 'RECEIVED' ? 'Received at Yard' : (inc.received_status === 'READY' ? 'Ready to Ship' : 'In Transit'),
          customer: inc.customer || 'SE',
          eta: inc.eta_seaport || inc.date_of_shipment,
          date_of_shipment: inc.date_of_shipment,
          heat_no: inc.heat_no,
          sec_weight: inc.sec_weight,
          delivery_terms: inc.delivery_terms || 'FOB',
          price: inc.price,
          currency: inc.currency || 'USD',
          sims: inc.sims,
          payment_terms: inc.payment_terms || 'DP at sight',
          hsn_code: inc.hsn_code,
          port: inc.port || 'N.S.',
          make: inc.make || 'Standard',
          supplier: inc.supplier || selectedLot.supplier_name,
          poNumber: inc.linked_po_number || selectedLot.po_number
        });
      });
    } else {
      // Look up matching items in purchase orders
      for (const po of allPOs) {
        if (!po.items) continue;
        for (const it of po.items) {
          if (
            (it.lot_number && String(it.lot_number).trim() === String(selectedLot.lot_number).trim()) ||
            it.id === selectedLot.purchase_order_item_id
          ) {
            const dimParts = [
              it.diameter_width ? `DIA ${it.diameter_width}` : '',
              it.thickness ? `T${it.thickness}` : '',
              it.length ? `L${it.length}` : ''
            ].filter(Boolean);
            const dimStr = dimParts.join(' × ');

            poItems.push({
              id: it.id,
              source: 'PO',
              grade: it.grade_code,
              condition: it.condition_name || it.treatment || it.section_name,
              dimensions: dimStr || (selectedLot.dimensions_display || 'Standard Spec'),
              dia_w: it.diameter_width,
              t: it.thickness,
              l: it.length,
              pieces: Number(it.pieces) || it.receipt_count || 1,
              weight: Number(it.ready_quantity ?? it.received_quantity ?? it.ordered_quantity) || 0,
              status: it.status === 'Received' ? 'Received at Yard' : (it.status || selectedLot.status || 'Available'),
              customer: po.customer_name || 'SE',
              eta: it.eta_seaport || it.date_of_shipment || po.expected_delivery_date,
              date_of_shipment: it.date_of_shipment,
              heat_no: it.heat_no,
              sec_weight: null,
              delivery_terms: it.delivery_terms || po.delivery_terms || 'FOB',
              price: it.purchase_price,
              currency: it.currency || po.currency || 'USD',
              sims: it.sims,
              payment_terms: it.payment_terms || po.payment_terms || 'DP at sight',
              hsn_code: null,
              port: it.destination_port || po.destination || 'N.S.',
              make: po.origin || po.origin_make_name || 'Standard',
              supplier: po.supplier_name || selectedLot.supplier_name,
              poNumber: po.po_number
            });
          }
        }
      }

      // If still empty, display the lot record itself as a primary item
      if (poItems.length === 0) {
        poItems.push({
          id: `lot-manifest-${selectedLot.id}`,
          source: 'PO',
          grade: selectedLot.grade_code || 'Standard Grade',
          condition: selectedLot.section_name,
          dimensions: selectedLot.dimensions_display || 'Standard Spec',
          dia_w: null,
          t: null,
          l: null,
          pieces: 1,
          weight: selectedLot.total_received_qty || selectedLot.available_qty,
          status: selectedLot.status === 'Available' ? 'Received at Yard' : (selectedLot.status || 'Available'),
          customer: 'SE',
          eta: lotMetaMap[selectedLot.id]?.arrivingDate,
          date_of_shipment: null,
          heat_no: null,
          sec_weight: null,
          delivery_terms: 'FOB',
          price: null,
          currency: 'USD',
          sims: null,
          payment_terms: lotMetaMap[selectedLot.id]?.paymentTerms || 'DP at sight',
          hsn_code: null,
          port: 'N.S.',
          make: 'Standard',
          supplier: selectedLot.supplier_name,
          poNumber: selectedLot.po_number
        });
      }
    }

    return poItems;
  }, [selectedLot, dataVersion, lotMetaMap]);

  const filteredLotItems = useMemo(() => {
    if (!lotItemSearch.trim()) return selectedLotItems;
    const q = lotItemSearch.toLowerCase().trim();
    return selectedLotItems.filter(item => 
      item.grade.toLowerCase().includes(q) ||
      item.dimensions.toLowerCase().includes(q) ||
      (item.condition && item.condition.toLowerCase().includes(q)) ||
      (item.heat_no && item.heat_no.toLowerCase().includes(q)) ||
      (item.make && item.make.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q))
    );
  }, [selectedLotItems, lotItemSearch]);

  const getLotIncomingData = (lot: Lot) => {
    const incItems = dataStore.getIncomingStockByLot(lot.lot_number);
    const allPOs = dataStore.getPurchaseOrders();
    const po = allPOs.find(p => p.po_number === lot.po_number);
    const item = po?.items?.find(it => it.lot_number === lot.lot_number || it.id === lot.purchase_order_item_id);
    const inc = incItems[0];
    const meta = lotMetaMap[lot.id];

    return {
      make: inc?.make || po?.origin || (po as any)?.origin_make_name || 'Standard',
      supplier: lot.supplier_name || inc?.supplier || po?.supplier_name || '—',
      lot_number: lot.lot_number,
      grade: inc?.grade || lot.grade_code || item?.grade_code || '—',
      condition: inc?.condition || item?.condition_name || item?.treatment || lot.section_name || '—',
      dia_w: inc?.dia_w !== undefined && inc?.dia_w !== null ? inc.dia_w : (item?.diameter_width ?? '—'),
      t: inc?.t !== undefined && inc?.t !== null ? inc.t : (item?.thickness ?? '—'),
      l: inc?.l !== undefined && inc?.l !== null ? inc.l : (item?.length ?? '—'),
      pc: inc?.pieces ?? (item?.pieces ?? 1),
      weight: lot.available_qty || inc?.weight || lot.total_received_qty || 0,
      customer: inc?.customer || po?.customer_name || 'SE',
      port: inc?.port || item?.destination_port || po?.destination || 'N.S.',
      date_of_shipment: inc?.date_of_shipment || item?.date_of_shipment || '',
      eta_seaport: inc?.eta_seaport || item?.eta_seaport || meta?.arrivingDate || '',
      received: lot.warehouse_location || inc?.received_status || (lot.available_qty > 0 ? 'Received' : 'In Transit'),
      heat_no: inc?.heat_no || item?.heat_no || '—',
      sec_weight: inc?.sec_weight !== undefined && inc?.sec_weight !== null ? inc.sec_weight : '—',
      del_terms: inc?.delivery_terms || item?.delivery_terms || po?.delivery_terms || 'FOB',
      price: inc?.price !== undefined && inc?.price !== null ? inc.price : (item?.purchase_price ?? '—'),
      currency: inc?.currency || item?.currency || po?.currency || 'USD',
      sims: inc?.sims || item?.sims || '—',
      payment_terms: inc?.payment_terms || meta?.paymentTerms || item?.payment_terms || po?.payment_terms || 'DP at sight',
      hsn_code: inc?.hsn_code || '—'
    };
  };

  const handleExportLotItems = () => {
    if (!selectedLot || selectedLotItems.length === 0) return;
    const exportRows = selectedLotItems.map((item) => ({
      'Make': item.make || 'Standard',
      'Supplier': item.supplier || selectedLot.supplier_name || '—',
      'LOT': selectedLot.lot_number,
      'Grade': item.grade,
      'Condition': item.condition || '—',
      'DIA/W': (item as any).dia_w ?? '',
      'T': (item as any).t ?? '',
      'L': (item as any).l ?? '',
      'pc': item.pieces || 1,
      'Weight': item.weight,
      'customer': (item as any).customer || 'SE',
      'Port': item.port || 'N.S.',
      'Date of Shipment': (item as any).date_of_shipment ? String((item as any).date_of_shipment).split('T')[0] : '',
      'ETA (sea port)': item.eta ? String(item.eta).split('T')[0] : '',
      'RECEIVED': item.status,
      'HEAT NO': item.heat_no || '—',
      'SEC WEIGHT': (item as any).sec_weight ?? '',
      'DEL TERMS': (item as any).delivery_terms || 'FOB',
      'PRICE': (item as any).price ?? '',
      'CURRENCY': (item as any).currency || 'USD',
      'SIMS': item.sims || '—',
      'PAYMENT TERMS': (item as any).payment_terms || 'DP at sight',
      'HSN Code': (item as any).hsn_code || '—'
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `INCOMING SE`);
    XLSX.writeFile(wb, `Lot_${selectedLot.lot_number}_INCOMING_SE_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExport = () => {
    const exportData = filteredLots.map(l => {
      const d = getLotIncomingData(l);
      return {
        'Make': d.make,
        'Supplier': d.supplier,
        'LOT': d.lot_number,
        'Grade': d.grade,
        'Condition': d.condition,
        'DIA/W': d.dia_w,
        'T': d.t,
        'L': d.l,
        'pc': d.pc,
        'Weight': d.weight,
        'customer': d.customer,
        'Port': d.port,
        'Date of Shipment': d.date_of_shipment ? String(d.date_of_shipment).split('T')[0] : '',
        'ETA (sea port)': d.eta_seaport ? String(d.eta_seaport).split('T')[0] : '',
        'RECEIVED': d.received,
        'HEAT NO': d.heat_no,
        'SEC WEIGHT': d.sec_weight,
        'DEL TERMS': d.del_terms,
        'PRICE': d.price,
        'CURRENCY': d.currency,
        'SIMS': d.sims,
        'PAYMENT TERMS': d.payment_terms,
        'HSN Code': d.hsn_code
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'INCOMING SE');
    XLSX.writeFile(wb, `Lot_Directory_INCOMING_SE_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!mounted) {
    return (
      <div className="space-y-5 p-4 animate-pulse" suppressHydrationWarning>
        <div className="h-10 bg-slate-100 rounded-lg w-1/3" />
        <div className="h-20 bg-slate-100 rounded-xl" />
        <div className="h-96 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5" suppressHydrationWarning>
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
        <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
          <table className="w-full text-left border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="table-header">Make</th>
                <th className="table-header">Supplier</th>
                <th 
                  className="table-header cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                  title="Click to toggle sorting order"
                >
                  <div className="flex items-center gap-1.5">
                    <span>LOT</span>
                    <span className="text-[10px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.5 rounded border border-blue-200">
                      {sortDir === 'desc' ? '↓' : '↑'}
                    </span>
                  </div>
                </th>
                <th className="table-header">Grade</th>
                <th className="table-header">Condition</th>
                <th className="table-header text-right">DIA/W</th>
                <th className="table-header text-right">T</th>
                <th className="table-header text-right">L</th>
                <th className="table-header text-right">pc</th>
                <th className="table-header text-right">Weight</th>
                <th className="table-header">customer</th>
                <th className="table-header">Port</th>
                <th className="table-header">Date of Shipment</th>
                <th className="table-header">ETA (sea port)</th>
                <th className="table-header text-center">RECEIVED</th>
                <th className="table-header">HEAT NO</th>
                <th className="table-header text-right">SEC WEIGHT</th>
                <th className="table-header">DEL TERMS</th>
                <th className="table-header text-right">PRICE</th>
                <th className="table-header">CURRENCY</th>
                <th className="table-header text-center">SIMS</th>
                <th className="table-header">PAYMENT TERMS</th>
                <th className="table-header">HSN Code</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredLots.length === 0 ? (
                <tr>
                  <td colSpan={24} className="py-12 text-center text-slate-400">
                    <Truck className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No lots found matching your filter criteria.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try resetting your filters or adjusting your search term.</p>
                  </td>
                </tr>
              ) : (
                filteredLots.map((lot, idx) => {
                  const d = getLotIncomingData(lot);
                  return (
                    <tr 
                      key={`${lot.id}-${idx}`} 
                      onClick={() => handleInspectLot(lot)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="table-cell font-medium text-slate-800">{d.make}</td>
                      <td className="table-cell font-medium text-slate-700 truncate max-w-[130px]" title={d.supplier}>{d.supplier}</td>
                      <td className="table-cell">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-900 text-white shadow-sm">
                          {d.lot_number}
                        </span>
                      </td>
                      <td className="table-cell font-bold text-slate-900">{d.grade}</td>
                      <td className="table-cell text-slate-600">{d.condition}</td>
                      <td className="table-cell text-right font-mono text-slate-700">{d.dia_w}</td>
                      <td className="table-cell text-right font-mono text-slate-700">{d.t}</td>
                      <td className="table-cell text-right font-mono text-slate-700">{d.l}</td>
                      <td className="table-cell text-right font-mono font-bold text-slate-800">{d.pc}</td>
                      <td className="table-cell text-right">
                        <strong className="text-blue-700 block font-mono text-xs">{formatWeight(d.weight)}</strong>
                      </td>
                      <td className="table-cell font-semibold text-slate-800">{d.customer}</td>
                      <td className="table-cell font-medium text-slate-700">{d.port}</td>
                      <td className="table-cell whitespace-nowrap text-slate-600">{formatDate(d.date_of_shipment)}</td>
                      <td className="table-cell whitespace-nowrap font-medium text-slate-800">{formatDate(d.eta_seaport)}</td>
                      <td className="table-cell text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(d.received)}`}>
                          {d.received}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-slate-700">{d.heat_no}</td>
                      <td className="table-cell text-right font-mono text-slate-600">{d.sec_weight}</td>
                      <td className="table-cell font-semibold text-slate-700">{d.del_terms}</td>
                      <td className="table-cell text-right font-mono text-slate-800 font-semibold">{typeof d.price === 'number' ? d.price.toLocaleString() : d.price}</td>
                      <td className="table-cell font-semibold text-slate-600">{d.currency}</td>
                      <td className="table-cell text-center">
                        {d.sims && d.sims !== '—' ? (
                          d.sims === 'Done' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Done</span>
                          ) : d.sims === 'Not Required' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Not Required</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700">{d.sims}</span>
                          )
                        ) : '—'}
                      </td>
                      <td className="table-cell text-slate-700 whitespace-nowrap">{d.payment_terms}</td>
                      <td className="table-cell font-mono text-slate-600">{d.hsn_code}</td>
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

      {/* Specific Lot Manifest, Material Items & Traceability Modal */}
      {selectedLot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden my-4 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Lot Manifest & Items: <span className="font-mono text-amber-300">Lot {selectedLot.lot_number}</span>
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white border border-white/20">
                      {selectedLotItems.length} {selectedLotItems.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedLot.grade_code} • {selectedLot.supplier_name || 'Direct Import'} • PO {selectedLot.po_number || 'Direct'} • {selectedLot.warehouse_location || 'Main Yard'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLot(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick KPIs Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Items / Pieces</span>
                <strong className="text-sm font-extrabold text-slate-900">
                  {selectedLotItems.reduce((acc, it) => acc + (Number(it.pieces) || 1), 0)} PCS
                </strong>
                <span className="text-[10px] text-slate-500 block">({selectedLotItems.length} line items)</span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Cargo Weight</span>
                <strong className="text-sm font-extrabold text-blue-700">
                  {formatWeight(selectedLotItems.reduce((acc, it) => acc + (Number(it.weight) || 0), 0) || selectedLot.total_received_qty)}
                </strong>
                <span className="text-[10px] text-slate-500 block">Landed at yard</span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Available In Stock</span>
                <strong className="text-sm font-extrabold text-emerald-600">
                  {formatWeight(selectedLot.available_qty)}
                </strong>
                <span className="text-[10px] text-slate-500 block">Unallocated balance</span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Lot Status & Location</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(selectedLot.status)}`}>
                    {selectedLot.status}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-600 truncate max-w-[100px]" title={selectedLot.warehouse_location || 'Main Yard'}>
                    {selectedLot.warehouse_location || 'Main Yard'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center justify-between px-6 pt-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalTab('items')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5",
                    modalTab === 'items'
                      ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg font-extrabold"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span>Items in this Lot ({selectedLotItems.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalTab('ledger')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5",
                    modalTab === 'ledger'
                      ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg font-extrabold"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>Movement Ledger ({lotHistory.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalTab('shipping')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5",
                    modalTab === 'shipping'
                      ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg font-extrabold"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  <Ship className="h-3.5 w-3.5" />
                  <span>Shipping & Customs Logistics</span>
                </button>
              </div>

              {modalTab === 'items' && selectedLotItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportLotItems}
                  className="mb-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors"
                  title="Export items packing list to Excel"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Export Packing List</span>
                </button>
              )}
            </div>

            {/* Modal Body Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs text-slate-700">
              
              {/* TAB 1: ITEMS IN THIS LOT */}
              {modalTab === 'items' && (
                <div className="space-y-3">
                  {/* Search within lot items */}
                  {selectedLotItems.length > 3 && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={lotItemSearch}
                          onChange={(e) => setLotItemSearch(e.target.value)}
                          placeholder="Search items by grade, dimensions, heat #, mill..."
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                        />
                        {lotItemSearch && (
                          <button
                            onClick={() => setLotItemSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Showing <strong>{filteredLotItems.length}</strong> of <strong>{selectedLotItems.length}</strong> items
                      </span>
                    </div>
                  )}

                  {/* Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto max-h-[380px]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-100 shadow-2xs">
                          <tr>
                            <th className="table-header">Make</th>
                            <th className="table-header">Supplier</th>
                            <th className="table-header">LOT</th>
                            <th className="table-header">Grade</th>
                            <th className="table-header">Condition</th>
                            <th className="table-header text-right">DIA/W</th>
                            <th className="table-header text-right">T</th>
                            <th className="table-header text-right">L</th>
                            <th className="table-header text-right">pc</th>
                            <th className="table-header text-right">Weight</th>
                            <th className="table-header">customer</th>
                            <th className="table-header">Port</th>
                            <th className="table-header">Date of Shipment</th>
                            <th className="table-header">ETA (sea port)</th>
                            <th className="table-header text-center">RECEIVED</th>
                            <th className="table-header">HEAT NO</th>
                            <th className="table-header text-right">SEC WEIGHT</th>
                            <th className="table-header">DEL TERMS</th>
                            <th className="table-header text-right">PRICE</th>
                            <th className="table-header">CURRENCY</th>
                            <th className="table-header text-center">SIMS</th>
                            <th className="table-header">PAYMENT TERMS</th>
                            <th className="table-header">HSN Code</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredLotItems.length === 0 ? (
                            <tr>
                              <td colSpan={23} className="py-8 text-center text-slate-400">
                                No items found matching &quot;{lotItemSearch}&quot;.
                              </td>
                            </tr>
                          ) : (
                            filteredLotItems.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                                <td className="table-cell font-medium text-slate-800">{item.make || 'Standard'}</td>
                                <td className="table-cell text-slate-700 truncate max-w-[120px]" title={item.supplier || ''}>{item.supplier || '—'}</td>
                                <td className="table-cell font-mono font-bold text-slate-900">{selectedLot.lot_number}</td>
                                <td className="table-cell font-bold text-slate-900">{item.grade}</td>
                                <td className="table-cell text-slate-600">{item.condition || '—'}</td>
                                <td className="table-cell text-right font-mono text-slate-700">{(item as any).dia_w ?? '—'}</td>
                                <td className="table-cell text-right font-mono text-slate-700">{(item as any).t ?? '—'}</td>
                                <td className="table-cell text-right font-mono text-slate-700">{(item as any).l ?? '—'}</td>
                                <td className="table-cell text-right font-mono font-bold text-slate-800">{item.pieces || 1}</td>
                                <td className="table-cell text-right font-mono font-bold text-blue-700">{formatWeight(item.weight)}</td>
                                <td className="table-cell font-semibold text-slate-800">{(item as any).customer || 'SE'}</td>
                                <td className="table-cell text-slate-700">{item.port || 'N.S.'}</td>
                                <td className="table-cell whitespace-nowrap text-slate-600">{formatDate((item as any).date_of_shipment)}</td>
                                <td className="table-cell whitespace-nowrap text-slate-800 font-medium">{formatDate(item.eta)}</td>
                                <td className="table-cell text-center">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                    item.status.includes('Received')
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : item.status.includes('Transit')
                                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                      : "bg-blue-50 text-blue-700 border-blue-200"
                                  )}>
                                    {item.status.includes('Received') ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Ship className="h-3 w-3 text-indigo-600" />}
                                    <span>{item.status}</span>
                                  </span>
                                </td>
                                <td className="table-cell font-mono text-slate-700">{item.heat_no || '—'}</td>
                                <td className="table-cell text-right font-mono text-slate-600">{(item as any).sec_weight ?? '—'}</td>
                                <td className="table-cell font-semibold text-slate-700">{(item as any).delivery_terms || 'FOB'}</td>
                                <td className="table-cell text-right font-mono text-slate-800">{(item as any).price !== undefined && (item as any).price !== null ? (item as any).price : '—'}</td>
                                <td className="table-cell font-semibold text-slate-600">{(item as any).currency || 'USD'}</td>
                                <td className="table-cell text-center">
                                  {item.sims ? (
                                    item.sims === 'Done' ? (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Done</span>
                                    ) : item.sims === 'Not Required' ? (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Not Required</span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700">{item.sims}</span>
                                    )
                                  ) : '—'}
                                </td>
                                <td className="table-cell text-slate-700 whitespace-nowrap">{(item as any).payment_terms || 'DP at sight'}</td>
                                <td className="table-cell font-mono text-slate-600">{(item as any).hsn_code || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                          <tr>
                            <td colSpan={8} className="table-cell font-bold text-slate-700">
                              Total Manifest ({filteredLotItems.length} items)
                            </td>
                            <td className="table-cell text-right font-mono font-bold text-slate-800">
                              {filteredLotItems.reduce((acc, it) => acc + (Number(it.pieces) || 1), 0)}
                            </td>
                            <td className="table-cell text-right font-mono font-extrabold text-blue-700 text-sm">
                              {formatWeight(filteredLotItems.reduce((acc, it) => acc + (it.weight || 0), 0))}
                            </td>
                            <td colSpan={13}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AUDIT MOVEMENT LEDGER */}
              {modalTab === 'ledger' && (
                <div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="table-header">Date</th>
                          <th className="table-header">Transaction Type</th>
                          <th className="table-header">Reference / Remarks</th>
                          <th className="table-header text-right">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {lotHistory.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400">
                              No ledger transactions recorded for this lot yet.
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
              )}

              {/* TAB 3: SHIPPING & CUSTOMS LOGISTICS */}
              {modalTab === 'shipping' && (() => {
                const incItems = dataStore.getIncomingStockByLot(selectedLot.lot_number);
                const first = incItems[0];
                return (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Discharge Port</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 text-red-500" />
                          {first?.port || 'N.S.'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Delivery Terms</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{first?.delivery_terms || 'FOB'}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Payment Terms</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {first?.payment_terms || lotMetaMap[selectedLot.id]?.paymentTerms || 'DP at sight'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Vessel Sea Port ETA</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {first?.eta_seaport ? formatDate(first.eta_seaport) : formatDate(lotMetaMap[selectedLot.id]?.arrivingDate)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Shipment Date</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {first?.date_of_shipment ? formatDate(first.date_of_shipment) : '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Mill / Country of Origin</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{first?.make || 'Standard'}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Customs Clearance</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {first?.received_status === 'RECEIVED' ? 'Cleared & Landed' : 'Pending Port Arrival'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Linked Purchase Order</span>
                        <span className="font-bold text-blue-600 block mt-0.5">
                          {selectedLot.po_number ? (
                            <Link href={`/purchasing/purchase-orders/${selectedLot.po_number}`} className="hover:underline">
                              PO {selectedLot.po_number}
                            </Link>
                          ) : 'Direct Import'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
                      <div className="flex items-center gap-2 text-xs text-blue-900">
                        <Ship className="h-4 w-4 text-blue-600" />
                        <span>This lot is tracked across Maritime In-Transit and Port Logistics hubs.</span>
                      </div>
                      <Link
                        href={`/purchasing/shipments?tab=orders&search=${encodeURIComponent(selectedLot.lot_number)}`}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-2xs inline-flex items-center gap-1 transition-colors"
                      >
                        <span>Open in Shipments Hub</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Lot Number: <strong className="font-mono text-slate-900">{selectedLot.lot_number}</strong>
              </span>

              <button
                type="button"
                onClick={() => setSelectedLot(null)}
                className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-2xs transition-colors"
              >
                Close
              </button>
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
