'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { 
  Compass, 
  Search, 
  Download, 
  RefreshCw, 
  Filter, 
  Edit3, 
  Check, 
  X, 
  ExternalLink, 
  ArrowUpDown, 
  Ship, 
  Truck, 
  Clock, 
  CheckCircle2, 
  Calendar, 
  DollarSign, 
  Percent, 
  Box, 
  Building2, 
  Info,
  ChevronDown
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { PurchaseOrder, PurchaseOrderItem, IncomingStockItem } from '@/types';
import { formatDate, formatWeight, cn, normalizeDateStr } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import * as XLSX from 'xlsx';

// --- Exchange Rates State & Public Live Rate Helper ---
interface ExchangeRates {
  USD: number;
  EUR: number;
  JPY: number;
  GBP: number;
  INR: number;
  lastUpdated: string;
}

const DEFAULT_RATES: ExchangeRates = {
  USD: 84.45,
  EUR: 91.80,
  JPY: 0.55,
  GBP: 109.50,
  INR: 1.0,
  lastUpdated: 'Default Benchmark'
};

function getRate(rates: ExchangeRates, currency?: string): number {
  if (!currency) return rates.USD || 84.45;
  const c = currency.toUpperCase().trim();
  if (c === 'EUR') return Number(rates.EUR) || 91.80;
  if (c === 'JPY') return Number(rates.JPY) || 0.55;
  if (c === 'GBP') return Number(rates.GBP) || 109.50;
  if (c === 'INR') return 1.0;
  return Number(rates.USD) || 84.45;
}

// --- Duty Percentage Business Rules ---
// 1. Grade is machine, manual lifter: 28%
// 2. Grade is inserts, blades: 31%
// 3. Grade is nickel alloy: 18%
// 4. Other than above, check Country / Origin:
//    - Japan: 18%
//    - China, Europe: 28%
//    - Default fallback: 28%
function calculateDefaultDutyPct(grade?: string | null, countryOrOrigin?: string | null): number {
  const g = (grade || '').toLowerCase().trim();
  const c = (countryOrOrigin || '').toLowerCase().trim();

  // Rule 1: Specific product categories / grades
  if (g.includes('machine') || g.includes('lifter') || g.includes('manual lifter')) {
    return 28;
  }
  if (g.includes('insert') || g.includes('blade')) {
    return 31;
  }
  if (g.includes('nickel') || g.includes('inconel') || g.includes('monel') || g.includes('hastelloy')) {
    return 18;
  }

  // Rule 2: Country / Origin
  if (c.includes('japan')) {
    return 18;
  }
  if (
    c.includes('china') || 
    c.includes('europe') || 
    c.includes('germany') || 
    c.includes('italy') || 
    c.includes('sweden') || 
    c.includes('slovenia') || 
    c.includes('austria') || 
    c.includes('france') || 
    c.includes('acroni') || 
    c.includes('buderus')
  ) {
    return 28;
  }

  // Default fallback
  return 28;
}

// Active Lot Row Model
interface ActiveLotRow {
  key: string;
  lot_number: string;
  payment_terms: string;
  supplier: string;
  consignee: string;
  grade: string;
  etd: string;
  eta: string;
  weight_kg: number;
  weight_mt: number;
  container_type: string;
  container_count: number;
  currency: string;
  invoice_amount: number;
  inr_value: number;
  duty_pct: number;
  duty_amount_inr: number;
  total_amount_inr: number;
  delivery_terms: string;
  port_of_loading: string;
  place_of_delivery: string;
  forwarder: string;
  sims: string;
  status: 'Open' | 'Ready to Ship' | 'In Transit';
  origin_country?: string;
  linked_pos: string[];
  item_count: number;
}

function ShipmentStatusContent() {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';

  const [dataVersion, setDataVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'ALL' | 'IN_TRANSIT' | 'READY' | 'OPEN'>('ALL');

  // Live Exchange Rates
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // Quick Edit Drawer / Modal state
  const [editingLot, setEditingLot] = useState<ActiveLotRow | null>(null);
  const [editDutyPct, setEditDutyPct] = useState<string>('28');
  const [editContainerType, setEditContainerType] = useState<string>('20ft');
  const [editContainerCount, setEditContainerCount] = useState<string>('1');
  const [editInvoiceAmount, setEditInvoiceAmount] = useState<string>('');
  const [editForwarder, setEditForwarder] = useState<string>('');
  const [editSims, setEditSims] = useState<string>('');
  const [editPT, setEditPT] = useState<string>('');
  const [editTER, setEditTER] = useState<string>('');
  const [editPOL, setEditPOL] = useState<string>('');
  const [editPOD, setEditPOD] = useState<string>('');
  const [editETD, setEditETD] = useState<string>('');
  const [editETA, setEditETA] = useState<string>('');

  // Fetch Live Rates
  const fetchLiveRates = async () => {
    setIsFetchingRates(true);
    setRateError(null);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (json && json.rates && json.rates.INR) {
        const inrPerUsd = json.rates.INR;
        const eurPerUsd = json.rates.EUR || 0.92;
        const jpyPerUsd = json.rates.JPY || 153.0;
        const gbpPerUsd = json.rates.GBP || 0.77;

        setRates({
          USD: inrPerUsd,
          EUR: inrPerUsd / eurPerUsd,
          JPY: inrPerUsd / jpyPerUsd,
          GBP: inrPerUsd / gbpPerUsd,
          INR: 1.0,
          lastUpdated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        });
      }
    } catch (err: any) {
      console.warn('Live rate fetch failed, using benchmark default rates:', err.message);
      setRateError('Live rate offline, using benchmark rates');
    } finally {
      setIsFetchingRates(false);
    }
  };

  useEffect(() => {
    fetchLiveRates();
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  // Load all Active Lots from DataStore
  const allActiveLots = useMemo(() => {
    const rawIncoming = (dataStore.getIncomingStock() || []).filter(
      i => i.received_status !== 'RECEIVED' && i.source_sheet !== 'INCOMING CLOSE'
    );
    const activePOs = (dataStore.getPurchaseOrders() || []).filter(p => !p.is_closed);

    // Map: lotNumber -> group
    const map = new Map<string, {
      lot_number: string;
      items: {
        item_id: string;
        po_number?: string;
        supplier: string;
        consignee: string;
        grade: string;
        weight: number;
        etd?: string | null;
        eta?: string | null;
        pt?: string | null;
        ter?: string | null;
        pol?: string | null;
        pod?: string | null;
        forwarder?: string | null;
        sims?: string | null;
        currency: string;
        price?: number | null;
        invoice_amount?: number | null;
        container_type?: string | null;
        container_count?: number | null;
        customs_duty_pct?: number | null;
        origin_country?: string | null;
        status: 'Open' | 'Ready to Ship' | 'In Transit';
      }[];
    }>();

    // 1. Ingest from Incoming Stock
    for (const inc of rawIncoming) {
      const lotNo = (inc.lot_number || '').trim();
      if (!lotNo) continue;
      const key = lotNo.toLowerCase();

      // Find matching PO
      const matchedPo = activePOs.find(p => p.po_number === inc.linked_po_number);
      const matchedItem = matchedPo?.items?.find(i => 
        i.lot_number?.trim().toLowerCase() === key || i.grade_code === inc.grade
      );

      let status: 'Open' | 'Ready to Ship' | 'In Transit' = 'In Transit';
      if (inc.received_status === 'READY') {
        status = 'Ready to Ship';
      } else if (inc.received_status === 'IN_TRANSIT') {
        status = 'In Transit';
      }

      if (!map.has(key)) {
        map.set(key, { lot_number: lotNo, items: [] });
      }

      map.get(key)!.items.push({
        item_id: inc.id,
        po_number: inc.linked_po_number || matchedPo?.po_number,
        supplier: inc.supplier || matchedPo?.supplier_name || 'Unknown Supplier',
        consignee: inc.customer || matchedPo?.customer_name || 'SE',
        grade: inc.grade || (inc as any).grade_code || 'Standard Grade',
        weight: Number(inc.weight) || 0,
        etd: inc.date_of_shipment || matchedItem?.date_of_shipment || null,
        eta: inc.eta_seaport || matchedItem?.eta_seaport || matchedPo?.expected_delivery_date || null,
        pt: inc.payment_terms || matchedItem?.payment_terms || matchedPo?.payment_terms || 'DP at sight',
        ter: inc.delivery_terms || matchedItem?.delivery_terms || matchedPo?.delivery_terms || 'FOB',
        pol: inc.port_of_loading || matchedItem?.port_of_loading || null,
        pod: inc.port || matchedItem?.destination_port || matchedPo?.destination || 'N.S.',
        forwarder: inc.forwarder_name || matchedItem?.forwarder_name || null,
        sims: inc.sims || matchedItem?.sims || null,
        currency: inc.currency || matchedItem?.currency || matchedPo?.currency || 'USD',
        price: inc.price || matchedItem?.purchase_price || null,
        invoice_amount: inc.invoice_amount ?? matchedItem?.invoice_amount ?? null,
        container_type: inc.container_type || matchedItem?.container_type || null,
        container_count: inc.container_count ?? matchedItem?.container_count ?? null,
        customs_duty_pct: inc.customs_duty_pct ?? matchedItem?.customs_duty_pct ?? null,
        origin_country: inc.make || matchedPo?.origin || matchedPo?.origin_make_name || null,
        status: status
      });
    }

    // 2. Ingest from Active PO items (that have lot assigned but not yet in incomingStock)
    for (const po of activePOs) {
      if (!po.items) continue;
      for (const item of po.items) {
        if (item.status === 'Received' || item.status === 'Closed — Fully Received') continue;
        const lotNo = (item.lot_number || item.receipts?.[0]?.lot_number || '').trim();
        if (!lotNo) continue;
        const key = lotNo.toLowerCase();

        // Check if already captured from incomingStock
        const group = map.get(key);
        if (group && group.items.some(it => it.po_number === po.po_number)) {
          continue;
        }

        let status: 'Open' | 'Ready to Ship' | 'In Transit' = 'Open';
        if (item.status === 'In Transit') status = 'In Transit';
        else if (item.status === 'Ready to Ship') status = 'Ready to Ship';

        if (!map.has(key)) {
          map.set(key, { lot_number: lotNo, items: [] });
        }

        map.get(key)!.items.push({
          item_id: item.id,
          po_number: po.po_number,
          supplier: po.supplier_name || 'Unknown Supplier',
          consignee: po.customer_name || 'SE',
          grade: item.grade_code,
          weight: Number(item.ready_quantity || item.received_quantity || item.ordered_quantity || 0),
          etd: item.date_of_shipment || null,
          eta: item.eta_seaport || po.expected_delivery_date || null,
          pt: item.payment_terms || po.payment_terms || 'DP at sight',
          ter: item.delivery_terms || po.delivery_terms || 'FOB',
          pol: item.port_of_loading || null,
          pod: item.destination_port || po.destination || 'N.S.',
          forwarder: item.forwarder_name || null,
          sims: item.sims || null,
          currency: item.currency || po.currency || 'USD',
          price: item.purchase_price,
          invoice_amount: item.invoice_amount ?? null,
          container_type: item.container_type || null,
          container_count: item.container_count ?? null,
          customs_duty_pct: item.customs_duty_pct ?? null,
          origin_country: po.origin || po.origin_make_name || null,
          status: status
        });
      }
    }

    // Transform into final ActiveLotRow records
    const rows: ActiveLotRow[] = [];

    for (const [key, group] of map.entries()) {
      if (group.items.length === 0) continue;

      const first = group.items[0];
      const totalWeightKg = group.items.reduce((sum, i) => sum + (i.weight || 0), 0);
      const totalWeightMt = totalWeightKg / 1000;

      // Unique grades in lot
      const uniqueGrades = Array.from(new Set(group.items.map(i => i.grade).filter(Boolean))).join(', ');
      const uniquePos = Array.from(new Set(group.items.map(i => i.po_number).filter(Boolean))) as string[];

      // Currency
      const currency = first.currency || 'USD';
      const rate = getRate(rates, currency);

      // Invoice Amount: sum of item invoice amounts, or calculate price * weight
      let totalInvAmount = group.items.reduce((sum, i) => sum + (Number(i.invoice_amount) || 0), 0);
      if (totalInvAmount === 0) {
        // Fallback: estimate from purchase price * (weight in MT or KG)
        totalInvAmount = group.items.reduce((sum, i) => {
          if (i.price && i.weight) {
            // If price > 50 it's likely per MT, if price < 50 it's likely per KG
            const unitPrice = i.price > 100 ? (i.price / 1000) : i.price;
            return sum + (unitPrice * i.weight);
          }
          return sum;
        }, 0);
      }

      // INR Value
      const inrValue = Math.round(totalInvAmount * rate);

      // Duty %: Check if user manually saved duty pct, else calculate via rule matrix
      const savedDuty = group.items.find(i => i.customs_duty_pct != null)?.customs_duty_pct;
      const dutyPct = savedDuty != null 
        ? savedDuty 
        : calculateDefaultDutyPct(uniqueGrades, first.origin_country);

      const dutyAmountInr = Math.round(inrValue * (dutyPct / 100));
      const totalAmountInr = inrValue + dutyAmountInr;

      // Container type & count
      const containerType = group.items.find(i => i.container_type)?.container_type || '20ft';
      const containerCount = group.items.reduce((max, i) => Math.max(max, i.container_count || 1), 1);

      // Status
      let lotStatus: 'Open' | 'Ready to Ship' | 'In Transit' = 'Open';
      if (group.items.some(i => i.status === 'In Transit')) {
        lotStatus = 'In Transit';
      } else if (group.items.some(i => i.status === 'Ready to Ship')) {
        lotStatus = 'Ready to Ship';
      }

      rows.push({
        key,
        lot_number: group.lot_number,
        payment_terms: first.pt || 'DP at sight',
        supplier: first.supplier || 'Standard Supplier',
        consignee: first.consignee || 'SE',
        grade: uniqueGrades,
        etd: first.etd || '',
        eta: first.eta || '',
        weight_kg: totalWeightKg,
        weight_mt: totalWeightMt,
        container_type: containerType,
        container_count: containerCount,
        currency,
        invoice_amount: totalInvAmount,
        inr_value: inrValue,
        duty_pct: dutyPct,
        duty_amount_inr: dutyAmountInr,
        total_amount_inr: totalAmountInr,
        delivery_terms: first.ter || 'FOB',
        port_of_loading: first.pol || '—',
        place_of_delivery: first.pod || 'Nhava Sheva (N.S.)',
        forwarder: first.forwarder || '—',
        sims: first.sims || 'Not Required',
        status: lotStatus,
        origin_country: first.origin_country || undefined,
        linked_pos: uniquePos,
        item_count: group.items.length
      });
    }

    // Sort by Lot Number or ETD
    return rows.sort((a, b) => {
      const aLot = parseInt(a.lot_number) || 0;
      const bLot = parseInt(b.lot_number) || 0;
      if (aLot && bLot) return bLot - aLot;
      return a.lot_number.localeCompare(b.lot_number);
    });
  }, [dataVersion, rates]);

  // Filtered Rows
  const filteredRows = useMemo(() => {
    return allActiveLots.filter(row => {
      // Stage Filter
      if (stageFilter === 'IN_TRANSIT' && row.status !== 'In Transit') return false;
      if (stageFilter === 'READY' && row.status !== 'Ready to Ship') return false;
      if (stageFilter === 'OPEN' && row.status !== 'Open') return false;

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        row.lot_number.toLowerCase().includes(q) ||
        row.supplier.toLowerCase().includes(q) ||
        row.consignee.toLowerCase().includes(q) ||
        row.grade.toLowerCase().includes(q) ||
        row.forwarder.toLowerCase().includes(q) ||
        row.port_of_loading.toLowerCase().includes(q) ||
        row.place_of_delivery.toLowerCase().includes(q) ||
        row.linked_pos.some(p => p.toLowerCase().includes(q))
      );
    });
  }, [allActiveLots, stageFilter, searchQuery]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const count = filteredRows.length;
    const totalWeightKg = filteredRows.reduce((acc, r) => acc + r.weight_kg, 0);
    const totalWeightMt = totalWeightKg / 1000;
    const totalInrValue = filteredRows.reduce((acc, r) => acc + r.inr_value, 0);
    const totalDutyInr = filteredRows.reduce((acc, r) => acc + r.duty_amount_inr, 0);
    const grandTotalInr = filteredRows.reduce((acc, r) => acc + r.total_amount_inr, 0);

    return {
      count,
      totalWeightKg,
      totalWeightMt,
      totalInrValue,
      totalDutyInr,
      grandTotalInr
    };
  }, [filteredRows]);

  // Open Edit Modal
  const handleOpenEdit = (row: ActiveLotRow) => {
    if (isViewer) return;
    setEditingLot(row);
    setEditDutyPct(String(row.duty_pct));
    setEditContainerType(row.container_type || '20ft');
    setEditContainerCount(String(row.container_count || 1));
    setEditInvoiceAmount(row.invoice_amount ? String(row.invoice_amount) : '');
    setEditForwarder(row.forwarder !== '—' ? row.forwarder : '');
    setEditSims(row.sims);
    setEditPT(row.payment_terms);
    setEditTER(row.delivery_terms);
    setEditPOL(row.port_of_loading !== '—' ? row.port_of_loading : '');
    setEditPOD(row.place_of_delivery);
    setEditETD(row.etd);
    setEditETA(row.eta);
  };

  // Save Quick Edit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLot) return;

    dataStore.updateLotShipmentDetails({
      lotNumber: editingLot.lot_number,
      customsDutyPct: parseFloat(editDutyPct) || 28,
      containerType: editContainerType,
      containerCount: parseInt(editContainerCount) || 1,
      invoiceAmount: editInvoiceAmount ? parseFloat(editInvoiceAmount) : undefined,
      forwarderName: editForwarder.trim() || undefined,
      sims: editSims,
      paymentTerms: editPT.trim() || undefined,
      deliveryTerms: editTER.trim() || undefined,
      portOfLoading: editPOL.trim() || undefined,
      destinationPort: editPOD.trim() || undefined,
      dateOfShipment: editETD || undefined,
      etaSeaport: editETA || undefined
    });

    setEditingLot(null);
    setDataVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:data-updated'));
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredRows.map((r, idx) => ({
      'S.No': idx + 1,
      'Lot no.': r.lot_number,
      'PT': r.payment_terms,
      'Supplier': r.supplier,
      'Consignee': r.consignee,
      'Grade': r.grade,
      'ETD': r.etd ? formatDate(r.etd) : '—',
      'ETA': r.eta ? formatDate(r.eta) : '—',
      'Qty (MT)': Number(r.weight_mt.toFixed(3)),
      'Qty (KG)': Math.round(r.weight_kg),
      'Cntr': r.container_type,
      'no. of container': r.container_count,
      'currency': r.currency,
      'amount': Number(r.invoice_amount.toFixed(2)),
      'inr value': r.inr_value,
      'Duty %': `${r.duty_pct}%`,
      'Duty Amount (INR)': r.duty_amount_inr,
      'total amount inr': r.total_amount_inr,
      'ter': r.delivery_terms,
      'pol': r.port_of_loading,
      'place of delivery': r.place_of_delivery,
      'Forwarder': r.forwarder,
      'SIMS': r.sims,
      'Status': r.status,
      'Linked PO(s)': r.linked_pos.map(p => `PO ${p}`).join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Active Shipment Status');
    const fileName = `Active_Shipment_Status_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Active Shipment Status</h1>
              <p className="text-xs text-slate-500">
                Active import lots, ETD/ETA voyages, container specifications, and landed customs valuation
              </p>
            </div>
          </div>
        </div>

        {/* Live Currency Ticker & Excel Export Button */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Currency Conversion Badge */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700">Live Rates:</span>
            <span className="font-mono font-bold text-slate-900">1 USD = ₹{rates.USD.toFixed(2)}</span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-slate-600">1 EUR = ₹{rates.EUR.toFixed(2)}</span>
            <button
              type="button"
              onClick={fetchLiveRates}
              disabled={isFetchingRates}
              title="Refresh live exchange rates"
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-200/60 rounded-md transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetchingRates && "animate-spin text-blue-600")} />
            </button>
          </div>

          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Export to Excel</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Lots</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{summaryMetrics.count}</span>
          <span className="text-[11px] text-slate-500">Unreceived cargo</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Cargo Qty</span>
          <span className="text-2xl font-bold text-blue-700 mt-1 block font-mono">
            {summaryMetrics.totalWeightMt.toFixed(2)} <span className="text-xs font-semibold text-slate-500">MT</span>
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            {Math.round(summaryMetrics.totalWeightKg).toLocaleString()} KG
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoice (INR)</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block font-mono">
            ₹{(summaryMetrics.totalInrValue / 100000).toFixed(2)} <span className="text-xs font-semibold text-slate-500">L</span>
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            ₹{summaryMetrics.totalInrValue.toLocaleString()}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Est. Customs Duty</span>
          <span className="text-2xl font-bold text-amber-700 mt-1 block font-mono">
            ₹{(summaryMetrics.totalDutyInr / 100000).toFixed(2)} <span className="text-xs font-semibold text-amber-600">L</span>
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            ₹{summaryMetrics.totalDutyInr.toLocaleString()}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Total Landed INR</span>
          <span className="text-2xl font-bold text-emerald-800 mt-1 block font-mono">
            ₹{(summaryMetrics.grandTotalInr / 100000).toFixed(2)} <span className="text-xs font-semibold text-emerald-600">L</span>
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            ₹{summaryMetrics.grandTotalInr.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80">
        {/* Stage Filter Buttons */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setStageFilter('ALL')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0",
              stageFilter === 'ALL'
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            All Active ({allActiveLots.length})
          </button>
          <button
            type="button"
            onClick={() => setStageFilter('IN_TRANSIT')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1",
              stageFilter === 'IN_TRANSIT'
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            <Ship className="h-3 w-3" />
            <span>In Transit ({allActiveLots.filter(l => l.status === 'In Transit').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStageFilter('READY')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1",
              stageFilter === 'READY'
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            <Clock className="h-3 w-3" />
            <span>Ready to Ship ({allActiveLots.filter(l => l.status === 'Ready to Ship').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStageFilter('OPEN')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1",
              stageFilter === 'OPEN'
                ? "bg-slate-700 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            <Box className="h-3 w-3" />
            <span>Open ({allActiveLots.filter(l => l.status === 'Open').length})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lot, supplier, grade, forwarder..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main 20-Column Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap select-none">
                <th className="py-3 px-3 border-r border-slate-800">Action</th>
                <th className="py-3 px-3 border-r border-slate-800">Lot no.</th>
                <th className="py-3 px-3 border-r border-slate-800">PT</th>
                <th className="py-3 px-3 border-r border-slate-800">Supplier</th>
                <th className="py-3 px-3 border-r border-slate-800">Consignee</th>
                <th className="py-3 px-3 border-r border-slate-800">Grade</th>
                <th className="py-3 px-3 border-r border-slate-800">ETD</th>
                <th className="py-3 px-3 border-r border-slate-800">ETA</th>
                <th className="py-3 px-3 text-right border-r border-slate-800">Qty (MT)</th>
                <th className="py-3 px-3 border-r border-slate-800">Cntr</th>
                <th className="py-3 px-3 text-center border-r border-slate-800">No. of Cntr</th>
                <th className="py-3 px-3 text-center border-r border-slate-800">Currency</th>
                <th className="py-3 px-3 text-right border-r border-slate-800">Amount</th>
                <th className="py-3 px-3 text-right border-r border-slate-800">INR Value</th>
                <th className="py-3 px-3 text-center border-r border-slate-800">Duty %</th>
                <th className="py-3 px-3 text-right border-r border-slate-800 bg-emerald-950/80 text-emerald-300">
                  Total Amount INR
                </th>
                <th className="py-3 px-3 border-r border-slate-800">TER</th>
                <th className="py-3 px-3 border-r border-slate-800">POL</th>
                <th className="py-3 px-3 border-r border-slate-800">Place of Delivery</th>
                <th className="py-3 px-3 border-r border-slate-800">Forwarder</th>
                <th className="py-3 px-3">SIMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={21} className="py-12 text-center text-slate-400">
                    <Compass className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No active shipments matching criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting the stage filter or search keyword.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => {
                  return (
                    <tr 
                      key={`${r.key}-${idx}`} 
                      className="hover:bg-blue-50/40 transition-colors whitespace-nowrap text-xs group"
                    >
                      {/* Action */}
                      <td className="py-2.5 px-3 border-r border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(r)}
                          disabled={isViewer}
                          title="Quick edit lot parameters"
                          className="px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white rounded text-[11px] font-bold text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                      </td>

                      {/* 1. Lot no. */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 border-r border-slate-100">
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                          {r.lot_number}
                        </span>
                        {r.linked_pos.length > 0 && (
                          <span className="block text-[10px] text-blue-600 font-sans font-semibold mt-0.5">
                            {r.linked_pos.map(p => `PO ${p}`).join(', ')}
                          </span>
                        )}
                      </td>

                      {/* 2. PT (Payment Terms) */}
                      <td className="py-2.5 px-3 text-slate-700 font-medium border-r border-slate-100">
                        {r.payment_terms}
                      </td>

                      {/* 3. Supplier */}
                      <td className="py-2.5 px-3 font-semibold text-slate-800 max-w-[180px] truncate border-r border-slate-100" title={r.supplier}>
                        {r.supplier}
                      </td>

                      {/* 4. Consignee (Customer) */}
                      <td className="py-2.5 px-3 border-r border-slate-100">
                        <span className="font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200 text-[11px]">
                          {r.consignee}
                        </span>
                      </td>

                      {/* 5. Grade */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 border-r border-slate-100">
                        {r.grade}
                      </td>

                      {/* 6. ETD (Date of Shipment) */}
                      <td className="py-2.5 px-3 font-medium text-slate-700 border-r border-slate-100">
                        {r.etd ? formatDate(r.etd) : <span className="text-slate-400">—</span>}
                      </td>

                      {/* 7. ETA */}
                      <td className="py-2.5 px-3 border-r border-slate-100">
                        {r.eta ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{formatDate(r.eta)}</span>
                            {r.status === 'In Transit' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                In Transit
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 8. Qty */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700 border-r border-slate-100">
                        {r.weight_mt.toFixed(3)} MT
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {Math.round(r.weight_kg).toLocaleString()} KG
                        </span>
                      </td>

                      {/* 9. Cntr (Container Type) */}
                      <td className="py-2.5 px-3 border-r border-slate-100">
                        <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold text-[11px]">
                          {r.container_type}
                        </span>
                      </td>

                      {/* 10. No. of container */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 border-r border-slate-100">
                        {r.container_count}
                      </td>

                      {/* 11. Currency */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600 border-r border-slate-100">
                        {r.currency}
                      </td>

                      {/* 12. Amount (Invoice Amount) */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 border-r border-slate-100">
                        {r.currency === 'USD' ? '$' : r.currency === 'EUR' ? '€' : ''}
                        {Number(r.invoice_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 13. INR Value */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-100">
                        ₹{r.inr_value.toLocaleString()}
                      </td>

                      {/* 14. Duty % */}
                      <td className="py-2.5 px-3 text-center border-r border-slate-100">
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold font-mono text-[11px]">
                          {r.duty_pct}%
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5 font-mono">
                          ₹{r.duty_amount_inr.toLocaleString()}
                        </span>
                      </td>

                      {/* 15. Total Amount INR */}
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-800 bg-emerald-50/50 border-r border-slate-100">
                        ₹{r.total_amount_inr.toLocaleString()}
                      </td>

                      {/* 16. TER (Delivery Terms) */}
                      <td className="py-2.5 px-3 font-semibold text-slate-700 border-r border-slate-100">
                        {r.delivery_terms}
                      </td>

                      {/* 17. POL (Port of Load) */}
                      <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100">
                        {r.port_of_loading}
                      </td>

                      {/* 18. Place of Delivery */}
                      <td className="py-2.5 px-3 text-slate-800 font-medium border-r border-slate-100">
                        {r.place_of_delivery}
                      </td>

                      {/* 19. Forwarder */}
                      <td className="py-2.5 px-3 font-medium text-slate-800 border-r border-slate-100 max-w-[150px] truncate" title={r.forwarder}>
                        {r.forwarder}
                      </td>

                      {/* 20. SIMS */}
                      <td className="py-2.5 px-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          r.sims === 'Done' ? "bg-emerald-100 text-emerald-800" :
                          r.sims === 'Not Required' ? "bg-slate-100 text-slate-600" :
                          "bg-blue-100 text-blue-800"
                        )}>
                          {r.sims}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-slate-200 text-xs font-bold border-t-2 border-slate-800">
                  <td colSpan={8} className="py-3 px-3 text-right uppercase tracking-wider">
                    Total Summary ({filteredRows.length} Lots):
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-blue-300">
                    {summaryMetrics.totalWeightMt.toFixed(3)} MT
                  </td>
                  <td colSpan={3} className="py-3 px-3 text-center">
                    —
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    —
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-100">
                    ₹{summaryMetrics.totalInrValue.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-amber-300">
                    ₹{summaryMetrics.totalDutyInr.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-300 bg-emerald-950">
                    ₹{summaryMetrics.grandTotalInr.toLocaleString()}
                  </td>
                  <td colSpan={5} className="py-3 px-3 text-slate-400">
                    —
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Quick Edit Drawer / Modal */}
      {editingLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Edit Lot Parameters — Lot #{editingLot.lot_number}</h3>
                  <p className="text-xs text-slate-400">
                    {editingLot.grade} • {editingLot.supplier} • {editingLot.weight_mt.toFixed(2)} MT
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLot(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Container Specs & Count */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Container Type (Cntr)</label>
                  <select
                    value={editContainerType}
                    onChange={(e) => setEditContainerType(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="20ft">20ft Heavy / GP</option>
                    <option value="40ft">40ft GP</option>
                    <option value="40HC">40ft High Cube (40HC)</option>
                    <option value="LCL">LCL (Less than Container)</option>
                    <option value="Breakbulk">Breakbulk / Loose</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. of Containers</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editContainerCount}
                    onChange={(e) => setEditContainerCount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Duty % & Invoice Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Customs Duty %
                    <span className="text-[10px] text-slate-400 ml-1 font-normal">(Rule calculated)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editDutyPct}
                      onChange={(e) => setEditDutyPct(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Machines: 28% • Inserts/Blades: 31% • Japan: 18% • Europe/China: 28%
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Invoice Amount ({editingLot.currency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 45000"
                    value={editInvoiceAmount}
                    onChange={(e) => setEditInvoiceAmount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    INR Value: ₹{(Math.round((parseFloat(editInvoiceAmount) || 0) * getRate(rates, editingLot.currency))).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Logistics & Shipping */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Freight Forwarder</label>
                  <input
                    type="text"
                    placeholder="e.g. Kuehne+Nagel, DHL, Expeditors"
                    value={editForwarder}
                    onChange={(e) => setEditForwarder(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SIMS Status</label>
                  <select
                    value={editSims}
                    onChange={(e) => setEditSims(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Done">Done</option>
                    <option value="Not Required">Not Required</option>
                  </select>
                </div>
              </div>

              {/* Commercial Terms */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Terms (PT)</label>
                  <input
                    type="text"
                    value={editPT}
                    onChange={(e) => setEditPT(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Delivery Terms (TER)</label>
                  <input
                    type="text"
                    value={editTER}
                    onChange={(e) => setEditTER(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Ports */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Port of Loading (POL)</label>
                  <input
                    type="text"
                    placeholder="e.g. Shanghai / Koper"
                    value={editPOL}
                    onChange={(e) => setEditPOL(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Place of Delivery (POD)</label>
                  <input
                    type="text"
                    placeholder="e.g. Nhava Sheva (N.S.)"
                    value={editPOD}
                    onChange={(e) => setEditPOD(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Voyage Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ETD (Date of Shipment)</label>
                  <input
                    type="date"
                    value={editETD}
                    onChange={(e) => setEditETD(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ETA (Sea Port Arrival)</label>
                  <input
                    type="date"
                    value={editETA}
                    onChange={(e) => setEditETA(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingLot(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Check className="h-4 w-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShipmentStatusPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[500px] flex items-center justify-center text-slate-500 text-sm">
        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading Active Shipment Status...
      </div>
    }>
      <ShipmentStatusContent />
    </Suspense>
  );
}
