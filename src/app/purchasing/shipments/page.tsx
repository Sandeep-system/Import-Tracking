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
  Package,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  Boxes
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { IncomingStockItem, PurchaseOrder, PurchaseOrderItem } from '@/types';
import { formatDate, formatWeight, getEtaStatus, getStatusBadgeClass, cn, normalizeDateStr } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import * as XLSX from 'xlsx';

export type ShipmentStage = 'Pending' | 'Ready' | 'In Transit' | 'Received';

export interface UnifiedShipmentItem {
  id: string;
  lot_number: string;
  linked_po_number?: string | null;
  supplier: string;
  make?: string | null;
  grade?: string;
  dimensions?: string;
  weight: number;
  port: string;
  date_of_shipment?: string | null;
  eta_seaport?: string | null;
  heat_no?: string | null;
  sims?: string | null;
  delivery_terms?: string | null;
  payment_terms?: string | null;
  container_no?: string | null;
  port_of_loading?: string | null;
  customer?: string | null;
  status: ShipmentStage;
  rawIncoming?: IncomingStockItem;
  rawPo?: PurchaseOrder;
  rawItem?: PurchaseOrderItem;
}

export interface LotShipmentGroup {
  lot_number: string;
  items: UnifiedShipmentItem[];
  item_count: number;
  total_weight: number;
  total_pieces?: number;
  supplier: string;
  make?: string | null;
  customer?: string | null;
  linked_po_number?: string | null;
  linked_pos?: string[];
  port: string;
  date_of_shipment?: string | null;
  eta_seaport?: string | null;
  delivery_terms?: string | null;
  payment_terms?: string | null;
  container_no?: string | null;
  port_of_loading?: string | null;
  status: ShipmentStage;
}

function ShipmentsContent() {
  const { isViewer } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dataVersion, setDataVersion] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tab State: 'shipments' | 'arrivals' | 'ports' | 'customers' | 'orders'
  const initialTab = (searchParams.get('tab') as 'shipments' | 'arrivals' | 'ports' | 'customers' | 'orders') || 'shipments';
  const [activeTab, setActiveTab] = useState<'shipments' | 'arrivals' | 'ports' | 'customers' | 'orders'>(initialTab);

  // Filters
  const initialSearch = searchParams.get('search') || '';
  const initialPort = searchParams.get('port') || 'ALL';
  const [search, setSearch] = useState(initialSearch);
  const [selectedPort, setSelectedPort] = useState(initialPort);
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedTerms, setSelectedTerms] = useState('ALL');
  const [selectedShipmentStatus, setSelectedShipmentStatus] = useState<string>('ALL');

  // Tab 1: Expanded Lots State
  const [expandedShipmentLots, setExpandedShipmentLots] = useState<string[]>([]);

  // Tab 2: Arrivals Schedule State
  const [arrivalsTimeFilter, setArrivalsTimeFilter] = useState<'ALL' | 'UPCOMING' | 'THIS_WEEK' | 'THIS_MONTH' | 'OVERDUE' | 'UNSCHEDULED' | 'RECEIVED'>('ALL');
  const [arrivalsSearch, setArrivalsSearch] = useState<string>('');
  const [arrivalsPort, setArrivalsPort] = useState<string>('ALL');
  const [collapsedArrivalDates, setCollapsedArrivalDates] = useState<string[]>([]);

  // Tab 3: Lot-Wise Shipment Tracking & View Controls
  const [ordersViewMode, setOrdersViewMode] = useState<'lots' | 'pos'>('lots');
  const [expandedPoIds, setExpandedPoIds] = useState<string[]>([]);
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<string>('ALL');
  const [ordersSearch, setOrdersSearch] = useState<string>('');
  const [receivingPoLot, setReceivingPoLot] = useState<{
    po: PurchaseOrder;
    item: PurchaseOrderItem;
    lotNumber: string;
    port: string;
    grade: string;
    weight: number;
  } | null>(null);

  // Inspection & Receive Modals
  const [inspectingItem, setInspectingItem] = useState<UnifiedShipmentItem | null>(null);
  const [receivingItem, setReceivingItem] = useState<UnifiedShipmentItem | null>(null);
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
    if (tabParam === 'shipments' || tabParam === 'arrivals' || tabParam === 'ports' || tabParam === 'orders') {
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
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setSelectedShipmentStatus(statusParam);
    }
  }, [searchParams]);

  // Data Fetching
  const summary = useMemo(() => dataStore.getIncomingStockSummary(), [dataVersion]);
  const allIncoming = useMemo(() => dataStore.getIncomingStock(), [dataVersion]);

  // Active POs for Orders Tab and Unified Shipments
  const activePOs = useMemo(() => {
    const raw = dataStore.getPurchaseOrders().filter(p => !p.is_closed);
    const seen = new Set<string>();
    return raw.filter(p => {
      const key = `${p.id || ''}:::${p.po_number || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [dataVersion]);

  // Unified Shipments synthesizing incoming stock and contract PO lots across 4 stages: Pending, Ready, In Transit, Received
  const allUnifiedShipments = useMemo(() => {
    const list: UnifiedShipmentItem[] = [];
    const seenUnifiedIds = new Set<string>();
    const matchedPoItemIds = new Set<string>();
    const matchedPoLotKeys = new Set<string>();

    // 1. Process all incomingStock items with an assigned lot number
    for (const inc of allIncoming) {
      if (!inc.lot_number || !inc.lot_number.trim()) continue;
      const cleanIncId = inc.id ? String(inc.id).trim() : '';
      if (cleanIncId && seenUnifiedIds.has(cleanIncId)) continue;
      if (cleanIncId) seenUnifiedIds.add(cleanIncId);

      let matchedPo: PurchaseOrder | undefined;
      let matchedItem: PurchaseOrderItem | undefined;

      const incCleanGrade = (inc.grade || (inc as any).grade_code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      if (inc.linked_po_number) {
        matchedPo = activePOs.find(p => p.po_number === inc.linked_po_number || p.id === inc.linked_po_id);
        if (matchedPo && matchedPo.items) {
          matchedItem = matchedPo.items.find(pi => 
            !matchedPoItemIds.has(pi.id) && (
              (inc.lot_number && pi.lot_number?.trim() === inc.lot_number.trim() &&
               (pi.grade_code?.toLowerCase().replace(/[^a-z0-9]/g, '') === incCleanGrade || !incCleanGrade)) ||
              (inc.id && inc.id.includes(pi.id)) ||
              (inc.lot_number && pi.lot_number?.trim() === inc.lot_number.trim())
            )
          );
        }
      } else if (inc.lot_number) {
        for (const po of activePOs) {
          const pi = po.items?.find(item => 
            !matchedPoItemIds.has(item.id) && 
            item.lot_number?.trim() === inc.lot_number.trim() &&
            (item.grade_code?.toLowerCase().replace(/[^a-z0-9]/g, '') === incCleanGrade || !incCleanGrade)
          );
          if (pi) {
            matchedPo = po;
            matchedItem = pi;
            break;
          }
        }
      }

      if (matchedItem) {
        matchedPoItemIds.add(matchedItem.id);
        if (matchedPo) {
          matchedPoLotKeys.add(`${matchedPo.po_number}-${matchedItem.line_number}`);
          if (matchedItem.lot_number) {
            matchedPoLotKeys.add(matchedItem.lot_number.trim());
          }
        }
      }

      // Determine shipment status
      let stage: ShipmentStage = 'In Transit';
      if (inc.received_status === 'RECEIVED') {
        stage = 'Received';
      } else if (matchedItem) {
        if (matchedItem.status === 'Received' || matchedItem.status === 'Closed — Fully Received') {
          stage = 'Received';
        } else if (matchedItem.status === 'Ready to Ship') {
          stage = 'Ready';
        } else if (matchedItem.status === 'Open') {
          stage = 'Pending';
        } else {
          stage = 'In Transit';
        }
      } else {
        // Unlinked incoming items: Option 2 rule
        const shipDate = inc.date_of_shipment ? normalizeDateStr(inc.date_of_shipment) : null;
        const nowStr = new Date().toISOString().split('T')[0];
        if (inc.received_status === 'READY' || !shipDate || shipDate > nowStr) {
          stage = 'Ready';
        } else {
          stage = 'In Transit';
        }
      }

      const incomingGrade = (inc.grade || (inc as any).grade_code || '').trim();
      const poGrade = (matchedItem?.grade_code || '').trim();
      // If PO is not linked, pick grade from incoming sheet
      const resolvedGrade = (!inc.linked_po_number)
        ? (incomingGrade || poGrade || 'Standard Grade')
        : (poGrade || incomingGrade || 'Standard Grade');

      const diaVal = inc.dia_w ?? (inc as any).width_diameter;
      const tVal = inc.t ?? (inc as any).thickness;
      const lVal = inc.l ?? (inc as any).length;
      const dimStr = [
        diaVal ? `DIA ${diaVal}` : '',
        tVal ? `T${tVal}` : '',
        lVal ? `L${lVal}` : ''
      ].filter(Boolean).join(' × ');

      list.push({
        id: inc.id,
        lot_number: inc.lot_number.trim(),
        linked_po_number: inc.linked_po_number || matchedPo?.po_number || null,
        supplier: inc.supplier || (inc as any).supplier_name || matchedPo?.supplier_name || 'Standard Supplier',
        make: inc.make || matchedPo?.origin || matchedPo?.origin_make_name || null,
        grade: resolvedGrade,
        dimensions: dimStr || (matchedItem ? [matchedItem.diameter_width ? `DIA ${matchedItem.diameter_width}` : '', matchedItem.thickness ? `T${matchedItem.thickness}` : '', matchedItem.length ? `L${matchedItem.length}` : ''].filter(Boolean).join(' × ') : ''),
        weight: Number(inc.weight) || Number(matchedItem?.received_quantity || matchedItem?.ready_quantity || matchedItem?.ordered_quantity || 0),
        port: inc.port || matchedItem?.destination_port || matchedPo?.destination || 'N.S.',
        date_of_shipment: inc.date_of_shipment || matchedItem?.date_of_shipment || null,
        eta_seaport: inc.eta_seaport || matchedItem?.eta_seaport || matchedPo?.expected_delivery_date || null,
        heat_no: inc.heat_no || (inc as any).heat_number || matchedItem?.heat_no || null,
        sims: inc.sims || matchedItem?.sims || null,
        delivery_terms: inc.delivery_terms || matchedItem?.delivery_terms || matchedPo?.delivery_terms || 'FOB',
        payment_terms: inc.payment_terms || matchedItem?.payment_terms || matchedPo?.payment_terms || 'DP at sight',
        container_no: inc.container_no || matchedItem?.container_no || null,
        port_of_loading: inc.port_of_loading || matchedItem?.port_of_loading || null,
        customer: inc.customer || matchedPo?.customer_name || null,
        status: stage,
        rawIncoming: inc,
        rawPo: matchedPo,
        rawItem: matchedItem
      });
    }

    // 2. Process active PO items that have been assigned a lot number from the PO tab
    for (const po of activePOs) {
      if (!po.items) continue;
      for (const item of po.items) {
        if (matchedPoItemIds.has(item.id)) continue;
        // Items will go to the shipment after assigning lot no. or transitioning to Ready/In Transit/Received
        const lotNo = item.lot_number?.trim() 
          || item.receipts?.find(r => r.lot_number?.trim())?.lot_number?.trim()
          || (['Ready to Ship', 'In Transit', 'Received', 'Closed — Fully Received'].includes(item.status || '') ? `LOT-${po.po_number}-${item.line_number}` : '');

        if (!lotNo) continue;
        if (matchedPoLotKeys.has(lotNo)) continue;
        if (matchedPoLotKeys.has(`${po.po_number}-${item.line_number}`)) continue;

        const uid = `po-ship-${po.id}-${item.id || item.line_number}`;
        if (seenUnifiedIds.has(uid)) continue;
        seenUnifiedIds.add(uid);

        let stage: ShipmentStage = 'Pending';
        if (item.status === 'Ready to Ship') {
          stage = 'Ready';
        } else if (item.status === 'In Transit') {
          stage = 'In Transit';
        } else if (item.status === 'Received' || item.status === 'Closed — Fully Received') {
          stage = 'Received';
        } else {
          stage = 'Pending';
        }

        const dimStr = [
          item.diameter_width ? `DIA ${item.diameter_width}` : '',
          item.thickness ? `T${item.thickness}` : '',
          item.length ? `L${item.length}` : ''
        ].filter(Boolean).join(' × ');

        list.push({
          id: `po-ship-${po.id}-${item.id || item.line_number}`,
          lot_number: lotNo,
          linked_po_number: po.po_number,
          supplier: po.supplier_name || 'Standard Supplier',
          make: po.origin || po.origin_make_name || null,
          grade: item.grade_code,
          dimensions: dimStr,
          weight: Number(item.received_quantity || item.ready_quantity || item.ordered_quantity || 0),
          port: item.destination_port || po.destination || 'N.S.',
          date_of_shipment: item.date_of_shipment || null,
          eta_seaport: item.eta_seaport || po.expected_delivery_date || null,
          heat_no: item.heat_no || null,
          sims: item.sims || null,
          delivery_terms: item.delivery_terms || po.delivery_terms || 'FOB',
          payment_terms: item.payment_terms || po.payment_terms || 'DP at sight',
          container_no: item.container_no || null,
          port_of_loading: item.port_of_loading || null,
          customer: po.customer_name || null,
          status: stage,
          rawPo: po,
          rawItem: item
        });
      }
    }

    return list;
  }, [allIncoming, activePOs]);

  // Group all unified shipments by lot number (one entry per 1 lot)
  const allGroupedShipments = useMemo(() => {
    const map = new Map<string, {
      lot_number: string;
      items: UnifiedShipmentItem[];
      supplier: string;
      make?: string | null;
      linked_po_number?: string | null;
      linked_pos: Set<string>;
      port: string;
      date_of_shipment?: string | null;
      eta_seaport?: string | null;
      delivery_terms?: string | null;
      payment_terms?: string | null;
      container_no?: string | null;
      port_of_loading?: string | null;
    }>();

    for (const item of allUnifiedShipments) {
      const key = item.lot_number?.trim() || item.id;
      let group = map.get(key);
      if (!group) {
        group = {
          lot_number: key,
          items: [],
          supplier: item.supplier,
          make: item.make,
          linked_po_number: item.linked_po_number,
          linked_pos: new Set<string>(),
          port: item.port,
          date_of_shipment: item.date_of_shipment,
          eta_seaport: item.eta_seaport,
          delivery_terms: item.delivery_terms,
          payment_terms: item.payment_terms,
          container_no: item.container_no,
          port_of_loading: item.port_of_loading,
        };
        map.set(key, group);
      }
      group.items.push(item);
      if (item.linked_po_number) group.linked_pos.add(item.linked_po_number);
      if (!group.container_no && item.container_no) group.container_no = item.container_no;
      if (!group.port_of_loading && item.port_of_loading) group.port_of_loading = item.port_of_loading;
      if (!group.date_of_shipment && item.date_of_shipment) group.date_of_shipment = item.date_of_shipment;
      if (!group.eta_seaport && item.eta_seaport) group.eta_seaport = item.eta_seaport;
      if (!group.make && item.make) group.make = item.make;

      // Prioritize active PO over closed PO for primary group.linked_po_number
      const isItemPoActive = activePOs.some(p => p.po_number === item.linked_po_number);
      const isCurrentPoActive = activePOs.some(p => p.po_number === group.linked_po_number);
      if (!group.linked_po_number || (!isCurrentPoActive && isItemPoActive)) {
        group.linked_po_number = item.linked_po_number;
      }
    }

    const list: LotShipmentGroup[] = [];
    for (const g of map.values()) {
      const totalWeight = g.items.reduce((acc, it) => acc + (Number(it.weight) || 0), 0);
      let stage: ShipmentStage = 'Pending';
      if (g.items.every(it => it.status === 'Received')) {
        stage = 'Received';
      } else if (g.items.some(it => it.status === 'In Transit')) {
        stage = 'In Transit';
      } else if (g.items.some(it => it.status === 'Ready')) {
        stage = 'Ready';
      } else {
        stage = 'Pending';
      }

      const custName = g.items.find(it => it.customer)?.customer || 'SE';
      const totalPieces = g.items.reduce((acc, it) => acc + (Number(it.rawIncoming?.pieces || it.rawItem?.pieces) || 1), 0);

      list.push({
        lot_number: g.lot_number,
        items: g.items,
        item_count: g.items.length,
        total_weight: totalWeight,
        total_pieces: totalPieces,
        customer: custName,
        supplier: g.supplier,
        make: g.make,
        linked_po_number: g.linked_po_number,
        linked_pos: Array.from(g.linked_pos),
        port: g.port,
        date_of_shipment: g.date_of_shipment,
        eta_seaport: g.eta_seaport,
        delivery_terms: g.delivery_terms,
        payment_terms: g.payment_terms,
        container_no: g.container_no,
        port_of_loading: g.port_of_loading,
        status: stage,
      });
    }

    return list;
  }, [allUnifiedShipments, activePOs]);

  // Counts of unique lots across all 4 shipment stages
  const statusCounts = useMemo(() => {
    let pending = 0;
    let ready = 0;
    let inTransit = 0;
    let received = 0;
    for (const s of allGroupedShipments) {
      if (s.status === 'Pending') pending++;
      else if (s.status === 'Ready') ready++;
      else if (s.status === 'In Transit') inTransit++;
      else if (s.status === 'Received') received++;
    }
    return { pending, ready, inTransit, received, total: allGroupedShipments.length };
  }, [allGroupedShipments]);

  // Filtered shipments grouped by lot based on status, port, supplier, terms, search
  const filteredGroupedShipments = useMemo(() => {
    return allGroupedShipments.filter(group => {
      // Status filter
      if (selectedShipmentStatus !== 'ALL' && group.status.toUpperCase() !== selectedShipmentStatus.toUpperCase()) {
        return false;
      }
      // Port filter
      if (selectedPort !== 'ALL' && (group.port || '').toLowerCase() !== selectedPort.toLowerCase()) {
        return false;
      }
      // Supplier filter
      if (selectedSupplier !== 'ALL' && (group.supplier || '').toLowerCase() !== selectedSupplier.toLowerCase()) {
        return false;
      }
      // Customer filter
      if (selectedCustomer !== 'ALL' && (group.customer || '').toLowerCase() !== selectedCustomer.toLowerCase()) {
        return false;
      }
      // Delivery terms filter
      if (selectedTerms !== 'ALL' && (group.delivery_terms || '').toUpperCase() !== selectedTerms.toUpperCase()) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchLot = group.lot_number.toLowerCase().includes(q);
        const matchPo = (group.linked_po_number || '').toLowerCase().includes(q);
        const matchSupplier = group.supplier.toLowerCase().includes(q);
        const matchCustomer = (group.customer || '').toLowerCase().includes(q);
        const matchPort = (group.port || '').toLowerCase().includes(q);
        const matchStatus = group.status.toLowerCase().includes(q);
        const matchContainer = (group.container_no || '').toLowerCase().includes(q);
        const matchItems = group.items.some(it => 
          (it.grade || '').toLowerCase().includes(q) ||
          (it.dimensions || '').toLowerCase().includes(q) ||
          (it.heat_no || '').toLowerCase().includes(q) ||
          (it.container_no || '').toLowerCase().includes(q) ||
          (it.customer || '').toLowerCase().includes(q)
        );
        if (!matchLot && !matchPo && !matchSupplier && !matchCustomer && !matchPort && !matchStatus && !matchContainer && !matchItems) {
          return false;
        }
      }
      return true;
    });
  }, [allGroupedShipments, selectedShipmentStatus, selectedPort, selectedSupplier, selectedCustomer, selectedTerms, search]);

  // Flattened filtered items for counts and exports
  const filteredShipments = useMemo(() => {
    return filteredGroupedShipments.flatMap(g => g.items);
  }, [filteredGroupedShipments]);

  // --- TAB 2: ARRIVALS SCHEDULE (GROUPED CHRONOLOGICALLY BY ARRIVAL DATE) ---
  const arrivalsByDate = useMemo(() => {
    const map = new Map<string, {
      dateStr: string;
      displayDate: string;
      etaInfo: { text: string; color: string; daysDiff: number | null };
      lots: LotShipmentGroup[];
      totalWeight: number;
    }>();

    for (const lot of allGroupedShipments) {
      const rawDate = normalizeDateStr(lot.eta_seaport);
      const dateKey = rawDate || 'unscheduled';

      let entry = map.get(dateKey);
      if (!entry) {
        const etaInfo = rawDate
          ? getEtaStatus(rawDate)
          : { text: 'ETA Pending', color: 'bg-slate-100 text-slate-600 border-slate-200', daysDiff: null };
        const displayDate = rawDate ? formatDate(rawDate) : 'Unscheduled / Pending Arrival Date';
        entry = {
          dateStr: dateKey,
          displayDate,
          etaInfo,
          lots: [],
          totalWeight: 0,
        };
        map.set(dateKey, entry);
      }
      entry.lots.push(lot);
      entry.totalWeight += lot.total_weight || 0;
    }

    // Sort dates chronologically: earliest arrival date first; 'unscheduled' placed at the end
    const entries = Array.from(map.values());
    entries.sort((a, b) => {
      if (a.dateStr === 'unscheduled') return 1;
      if (b.dateStr === 'unscheduled') return -1;
      return new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime();
    });

    return entries;
  }, [allGroupedShipments]);

  // Overall arrivals statistics for KPI cards & pill counts
  const arrivalsStats = useMemo(() => {
    let upcomingLots = 0;
    let upcomingWeight = 0;
    let thisWeekLots = 0;
    let thisWeekWeight = 0;
    let thisMonthLots = 0;
    let thisMonthWeight = 0;
    let overdueLots = 0;
    let overdueWeight = 0;
    let unscheduledLots = 0;
    let unscheduledWeight = 0;
    let receivedLots = 0;
    let receivedWeight = 0;
    let totalScheduledLots = 0;
    let totalScheduledWeight = 0;
    let totalActiveLots = 0;
    let totalActiveWeight = 0;

    for (const group of arrivalsByDate) {
      const isUnscheduled = group.dateStr === 'unscheduled';
      const days = group.etaInfo.daysDiff;
      for (const lot of group.lots) {
        const wt = lot.total_weight || 0;

        if (lot.status === 'Received') {
          receivedLots++;
          receivedWeight += wt;
          continue;
        }

        totalActiveLots++;
        totalActiveWeight += wt;

        if (isUnscheduled) {
          unscheduledLots++;
          unscheduledWeight += wt;
        } else {
          totalScheduledLots++;
          totalScheduledWeight += wt;

          if (days !== null) {
            if (days < 0) {
              overdueLots++;
              overdueWeight += wt;
            } else {
              upcomingLots++;
              upcomingWeight += wt;
              if (days <= 7) {
                thisWeekLots++;
                thisWeekWeight += wt;
              }
              if (days <= 30) {
                thisMonthLots++;
                thisMonthWeight += wt;
              }
            }
          }
        }
      }
    }

    return {
      totalActiveLots,
      totalActiveWeight,
      upcomingLots,
      upcomingWeight,
      thisWeekLots,
      thisWeekWeight,
      thisMonthLots,
      thisMonthWeight,
      overdueLots,
      overdueWeight,
      unscheduledLots,
      unscheduledWeight,
      receivedLots,
      receivedWeight,
      totalScheduledLots,
      totalScheduledWeight,
      uniqueArrivalDates: arrivalsByDate.filter(g => g.dateStr !== 'unscheduled').length
    };
  }, [arrivalsByDate]);

  // Filtered arrival date groups based on timeline, port, and search
  const filteredArrivalsByDate = useMemo(() => {
    return arrivalsByDate
      .map(group => {
        const matchedLots = group.lots.filter(lot => {
          // Time filter
          if (arrivalsTimeFilter === 'ALL') {
            if (lot.status === 'Received') return false;
          } else if (arrivalsTimeFilter === 'UPCOMING') {
            if (lot.status === 'Received') return false;
            if (group.dateStr === 'unscheduled') return false;
            if (group.etaInfo.daysDiff !== null && group.etaInfo.daysDiff < 0) return false;
          } else if (arrivalsTimeFilter === 'THIS_WEEK') {
            if (lot.status === 'Received') return false;
            if (group.dateStr === 'unscheduled') return false;
            if (group.etaInfo.daysDiff === null || group.etaInfo.daysDiff < 0 || group.etaInfo.daysDiff > 7) return false;
          } else if (arrivalsTimeFilter === 'THIS_MONTH') {
            if (lot.status === 'Received') return false;
            if (group.dateStr === 'unscheduled') return false;
            if (group.etaInfo.daysDiff === null || group.etaInfo.daysDiff < 0 || group.etaInfo.daysDiff > 30) return false;
          } else if (arrivalsTimeFilter === 'OVERDUE') {
            if (lot.status === 'Received') return false;
            if (group.dateStr === 'unscheduled') return false;
            if (group.etaInfo.daysDiff === null || group.etaInfo.daysDiff >= 0) return false;
          } else if (arrivalsTimeFilter === 'UNSCHEDULED') {
            if (lot.status === 'Received') return false;
            if (group.dateStr !== 'unscheduled') return false;
          } else if (arrivalsTimeFilter === 'RECEIVED') {
            if (lot.status !== 'Received') return false;
          }

          // Port filter
          if (arrivalsPort !== 'ALL' && (lot.port || '').toLowerCase() !== arrivalsPort.toLowerCase()) {
            return false;
          }

          // Search filter
          if (arrivalsSearch.trim()) {
            const q = arrivalsSearch.toLowerCase().trim();
            const matchLot = lot.lot_number.toLowerCase().includes(q);
            const matchPo = (lot.linked_po_number || '').toLowerCase().includes(q);
            const matchSupplier = lot.supplier.toLowerCase().includes(q);
            const matchPort = (lot.port || '').toLowerCase().includes(q);
            const matchContainer = (lot.container_no || '').toLowerCase().includes(q);
            const matchDate = group.displayDate.toLowerCase().includes(q) || group.dateStr.includes(q);
            const matchItems = lot.items.some(it => 
              (it.grade || '').toLowerCase().includes(q) ||
              (it.dimensions || '').toLowerCase().includes(q) ||
              (it.heat_no || '').toLowerCase().includes(q)
            );
            if (!matchLot && !matchPo && !matchSupplier && !matchPort && !matchContainer && !matchDate && !matchItems) {
              return false;
            }
          }

          return true;
        });

        if (matchedLots.length === 0) return null;

        const totalWeight = matchedLots.reduce((acc, l) => acc + (l.total_weight || 0), 0);
        return {
          ...group,
          lots: matchedLots,
          totalWeight
        };
      })
      .filter(Boolean) as Array<typeof arrivalsByDate[0]>;
  }, [arrivalsByDate, arrivalsTimeFilter, arrivalsPort, arrivalsSearch]);

  const filteredArrivalsLotsCount = useMemo(() => {
    return filteredArrivalsByDate.reduce((sum, g) => sum + g.lots.length, 0);
  }, [filteredArrivalsByDate]);

  // Unique ports, suppliers, and terms for dropdowns
  const uniquePorts = useMemo(() => {
    const set = new Set(allUnifiedShipments.map(i => i.port).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allUnifiedShipments]);

  const uniqueSuppliers = useMemo(() => {
    const set = new Set(allUnifiedShipments.map(i => i.supplier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allUnifiedShipments]);

  const uniqueTerms = useMemo(() => {
    const set = new Set(allUnifiedShipments.map(i => (i.delivery_terms || '').toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [allUnifiedShipments]);

  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    for (const item of allUnifiedShipments) {
      if (item.customer?.trim()) set.add(item.customer.trim());
    }
    if (set.size === 0) set.add('SE');
    return Array.from(set).sort();
  }, [allUnifiedShipments]);

  const customerStats = useMemo(() => {
    const map = new Map<string, {
      customer: string;
      lots: LotShipmentGroup[];
      items: UnifiedShipmentItem[];
      totalWeight: number;
      totalPieces: number;
      readyWeight: number;
      transitWeight: number;
      receivedWeight: number;
      readyLots: number;
      transitLots: number;
      receivedLots: number;
    }>();

    for (const group of allGroupedShipments) {
      const custName = group.customer || group.items[0]?.customer || 'SE';
      let entry = map.get(custName);
      if (!entry) {
        entry = {
          customer: custName,
          lots: [],
          items: [],
          totalWeight: 0,
          totalPieces: 0,
          readyWeight: 0,
          transitWeight: 0,
          receivedWeight: 0,
          readyLots: 0,
          transitLots: 0,
          receivedLots: 0,
        };
        map.set(custName, entry);
      }
      entry.lots.push(group);
      entry.items.push(...group.items);
      entry.totalWeight += group.total_weight || 0;
      entry.totalPieces += group.total_pieces || group.items.length;
      if (group.status === 'Ready') {
        entry.readyWeight += group.total_weight || 0;
        entry.readyLots++;
      } else if (group.status === 'In Transit') {
        entry.transitWeight += group.total_weight || 0;
        entry.transitLots++;
      } else if (group.status === 'Received') {
        entry.receivedWeight += group.total_weight || 0;
        entry.receivedLots++;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalWeight - a.totalWeight);
  }, [allGroupedShipments]);

  // Status Badge Renderer Helper
  const renderShipmentStatusBadge = (status: ShipmentStage | string) => {
    const norm = String(status).toLowerCase();
    if (norm === 'pending' || norm === 'open') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <Clock className="h-3 w-3 text-slate-500" />
          <span>Pending</span>
        </span>
      );
    }
    if (norm === 'ready' || norm === 'ready to ship') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <PackageCheck className="h-3 w-3 text-blue-600" />
          <span>Ready</span>
        </span>
      );
    }
    if (norm === 'in transit') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Ship className="h-3 w-3 text-indigo-600" />
          <span>In Transit</span>
        </span>
      );
    }
    if (norm === 'received') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          <span>Received</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <span>{status}</span>
      </span>
    );
  };


  // Compute all individual lots across active POs for Lot-Wise Shipment Tracking
  const allPoLots = useMemo(() => {
    const list: Array<{
      id: string;
      poId: string;
      poNumber: string;
      supplierName: string;
      lineNumber: number;
      lotNumber: string;
      hasExplicitLot: boolean;
      gradeCode: string;
      gradeDoc?: string | null;
      sectionName: string;
      dimensions: string;
      orderedQty: number;
      readyQty: number;
      status: string;
      dateOfShipment?: string | null;
      etaSeaport?: string | null;
      heatNo?: string | null;
      sims?: string | null;
      port: string;
      deliveryTerms: string;
      paymentTerms: string;
      containerNo?: string | null;
      portOfLoading?: string | null;
      rawItem: PurchaseOrderItem;
      rawPo: PurchaseOrder;
    }> = [];

    for (const po of activePOs) {
      if (!po.items || po.items.length === 0) continue;
      for (const item of po.items) {
        // Items will go to shipment after assigning lot no. or transitioning to Ready/In Transit/Received
        const lotNo = item.lot_number?.trim()
          || item.receipts?.find(r => r.lot_number?.trim())?.lot_number?.trim()
          || (['Ready to Ship', 'In Transit', 'Received', 'Closed — Fully Received'].includes(item.status || '') ? `LOT-${po.po_number}-${item.line_number}` : '');

        if (!lotNo) continue;

        const dimStr = [
          item.diameter_width ? `DIA ${item.diameter_width}` : '',
          item.thickness ? `T${item.thickness}` : '',
          item.length ? `L${item.length}` : ''
        ].filter(Boolean).join(' × ');

        list.push({
          id: `${po.id}-${item.id || item.line_number}`,
          poId: po.id,
          poNumber: po.po_number,
          supplierName: po.supplier_name || 'Standard Supplier',
          lineNumber: item.line_number,
          lotNumber: lotNo,
          hasExplicitLot: true,
          gradeCode: item.grade_code,
          gradeDoc: item.grade_doc,
          sectionName: item.section_name || 'Steel Section',
          dimensions: dimStr || 'Standard Spec',
          orderedQty: Number(item.ordered_quantity) || 0,
          readyQty: Number(item.received_quantity || item.ready_quantity || 0),
          status: item.status || 'Open',
          dateOfShipment: item.date_of_shipment,
          etaSeaport: item.eta_seaport || po.expected_delivery_date,
          heatNo: item.heat_no,
          sims: item.sims,
          port: item.destination_port || po.destination || 'N.S.',
          deliveryTerms: item.delivery_terms || po.delivery_terms || 'FOB',
          paymentTerms: item.payment_terms || po.payment_terms || 'DP at sight',
          containerNo: item.container_no || null,
          portOfLoading: item.port_of_loading || null,
          rawItem: item,
          rawPo: po
        });
      }
    }
    return list;
  }, [activePOs]);

  const filteredPoLots = useMemo(() => {
    return allPoLots.filter(lot => {
      if (ordersStatusFilter !== 'ALL' && lot.status.toUpperCase() !== ordersStatusFilter.toUpperCase()) {
        return false;
      }
      if (ordersSearch.trim()) {
        const q = ordersSearch.toLowerCase().trim();
        const matchLot = lot.lotNumber.toLowerCase().includes(q);
        const matchPo = lot.poNumber.toLowerCase().includes(q);
        const matchSupplier = lot.supplierName.toLowerCase().includes(q);
        const matchGrade = lot.gradeCode.toLowerCase().includes(q);
        const matchHeat = (lot.heatNo || '').toLowerCase().includes(q);
        const matchSims = (lot.sims || '').toLowerCase().includes(q);
        const matchPort = (lot.port || '').toLowerCase().includes(q);
        if (!matchLot && !matchPo && !matchSupplier && !matchGrade && !matchHeat && !matchSims && !matchPort) {
          return false;
        }
      }
      return true;
    });
  }, [allPoLots, ordersStatusFilter, ordersSearch]);

  const poLotStats = useMemo(() => {
    const total = allPoLots.length;
    const inTransit = allPoLots.filter(l => l.status === 'In Transit').length;
    const readyToShip = allPoLots.filter(l => l.status === 'Ready to Ship').length;
    const open = allPoLots.filter(l => l.status === 'Open').length;
    const received = allPoLots.filter(l => l.status === 'Received').length;
    const totalWeight = allPoLots.reduce((acc, l) => acc + (l.readyQty || l.orderedQty), 0);
    return { total, inTransit, readyToShip, open, received, totalWeight };
  }, [allPoLots]);

  const togglePoExpanded = (poId: string) => {
    setExpandedPoIds(prev =>
      prev.includes(poId) ? prev.filter(id => id !== poId) : [...prev, poId]
    );
  };

  // Mark Received Handler
  const handleConfirmReceive = () => {
    if (receivingItem) {
      if (receivingItem.rawIncoming) {
        dataStore.markIncomingStockReceived(receivingItem.rawIncoming.id, {
          receipt_date: receiptDate,
          location: warehouseLocation
        });
      }
      if (receivingItem.rawPo && receivingItem.rawItem) {
        dataStore.markItemReceived({
          poIdOrNumber: receivingItem.rawPo.id,
          itemId: receivingItem.rawItem.id,
          receiptDate: receiptDate,
          warehouseLocation: warehouseLocation,
        });
      } else if (receivingItem.linked_po_number) {
        const po = dataStore.getPurchaseOrders().find(p => p.po_number === receivingItem.linked_po_number);
        const item = po?.items?.find(it => (receivingItem.lot_number && it.lot_number === receivingItem.lot_number) || receivingItem.id.includes(it.id));
        if (po && item) {
          dataStore.markItemReceived({
            poIdOrNumber: po.id,
            itemId: item.id,
            receiptDate: receiptDate,
            warehouseLocation: warehouseLocation,
          });
        }
      }
      // Also sync matching incoming stock if not already processed via rawIncoming
      if (!receivingItem.rawIncoming) {
        const matchInc = dataStore.getIncomingStock().find(i => 
          (receivingItem.lot_number && i.lot_number === receivingItem.lot_number) ||
          (receivingItem.linked_po_number && i.linked_po_number === receivingItem.linked_po_number)
        );
        if (matchInc) {
          dataStore.markIncomingStockReceived(matchInc.id, {
            receipt_date: receiptDate,
            location: warehouseLocation,
          });
        }
      }

      setIsReceivingSuccess(true);
      setTimeout(() => {
        setIsReceivingSuccess(false);
        setReceivingItem(null);
        setDataVersion(v => v + 1);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('app:data-updated'));
        }
      }, 1000);
    } else if (receivingPoLot) {
      dataStore.markItemReceived({
        poIdOrNumber: receivingPoLot.po.id,
        itemId: receivingPoLot.item.id,
        receiptDate: receiptDate,
        warehouseLocation: warehouseLocation,
      });

      // Synchronize matching incoming stock item if present
      const match = dataStore.getIncomingStock().find(i => 
        i.linked_po_number === receivingPoLot.po.po_number && 
        (i.lot_number === receivingPoLot.lotNumber || i.id.includes(receivingPoLot.item.id))
      );
      if (match) {
        dataStore.markIncomingStockReceived(match.id, {
          receipt_date: receiptDate,
          location: warehouseLocation,
        });
      }

      setIsReceivingSuccess(true);
      setTimeout(() => {
        setIsReceivingSuccess(false);
        setReceivingPoLot(null);
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
    } else if (activeTab === 'orders') {
      const lotRows = filteredPoLots.map(l => ({
        'Lot Number': l.lotNumber,
        'PO Number': `PO ${l.poNumber}`,
        'Supplier': l.supplierName,
        'Shipment Status': l.status,
        'Ordered Qty (KG)': l.orderedQty,
        'Ready / Recd Qty (KG)': l.readyQty,
        'Container Number': l.containerNo || '—',
        'Port of Load (POL)': l.portOfLoading || '—',
        'Date of Shipment': l.dateOfShipment || '—',
        'Sea Port ETA': l.etaSeaport || '—',
        'Discharge Port': l.port,
        'Delivery Terms': l.deliveryTerms,
        'Payment Terms': l.paymentTerms
      }));
      const ws = XLSX.utils.json_to_sheet(lotRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PO Lots Shipment Status');
    } else if (activeTab === 'arrivals') {
      const arrivalRows = filteredArrivalsByDate.flatMap(dateGroup =>
        dateGroup.lots.map(lot => ({
          'Arrival Date (ETA)': dateGroup.dateStr === 'unscheduled' ? 'Unscheduled' : dateGroup.dateStr,
          'Arrival Status': dateGroup.etaInfo.text,
          'Lot Number': lot.lot_number,
          'PO Number': lot.linked_po_number ? `PO ${lot.linked_po_number}` : 'Direct Cargo',
          'Supplier': lot.supplier,
          'Mill / Make': lot.make || 'Standard',
          'Weight (KG)': lot.total_weight,
          'Discharge Port': lot.port,
          'Port of Load (POL)': lot.port_of_loading || '—',
          'Container Number': lot.container_no || '—',
          'Date of Shipment': lot.date_of_shipment || '—',
          'Shipment Status': lot.status,
          'Delivery Terms': lot.delivery_terms || 'FOB',
          'Payment Terms': lot.payment_terms || '—'
        }))
      );
      const ws = XLSX.utils.json_to_sheet(arrivalRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Arrivals Schedule');
      XLSX.writeFile(wb, `Port_Arrivals_Schedule_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else if (activeTab === 'customers') {
      const customerRows = customerStats.flatMap(cs => 
        cs.lots.map(lot => ({
          'Customer': cs.customer,
          'Lot Number': lot.lot_number,
          'PO Number': lot.linked_po_number ? `PO ${lot.linked_po_number}` : 'Direct Cargo',
          'Supplier': lot.supplier,
          'Make / Mill': lot.make || 'Standard',
          'Pieces': lot.total_pieces || lot.items.length,
          'Weight (KG)': lot.total_weight,
          'Discharge Port': lot.port || 'N.S.',
          'Date of Shipment': lot.date_of_shipment ? String(lot.date_of_shipment).split('T')[0] : '—',
          'Sea Port ETA': lot.eta_seaport ? String(lot.eta_seaport).split('T')[0] : '—',
          'SIMS Filing': lot.items[0]?.sims || '—',
          'Status': lot.status
        }))
      );
      const ws = XLSX.utils.json_to_sheet(customerRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Shipments');
      XLSX.writeFile(wb, `Customer_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const exportRows = filteredShipments.map(i => ({
        'Lot Number': i.lot_number,
        'Linked PO': i.linked_po_number ? `PO ${i.linked_po_number}` : 'Direct Cargo',
        'Make / Mill': i.make || 'Standard',
        'Supplier': i.supplier,
        'Shipment Status': i.status,
        'Weight (KG)': i.weight,
        'Container Number': i.container_no || '—',
        'Port of Load (POL)': i.port_of_loading || '—',
        'Port of Discharge': i.port || 'N.S.',
        'Date of Shipment': i.date_of_shipment || '—',
        'Sea Port ETA': i.eta_seaport || '—',
        'Delivery Terms': i.delivery_terms || 'FOB',
        'Payment Terms': i.payment_terms || '—',
        'Customer': i.customer || ''
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inbound Shipments');
      XLSX.writeFile(wb, `Inbound_Shipments_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6 p-4 animate-pulse" suppressHydrationWarning>
        <div className="h-10 bg-slate-100 rounded-lg w-1/3" />
        <div className="h-28 bg-slate-100 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="h-24 bg-slate-100 rounded-xl" />
          <div className="h-24 bg-slate-100 rounded-xl" />
          <div className="h-24 bg-slate-100 rounded-xl" />
          <div className="h-24 bg-slate-100 rounded-xl" />
        </div>
        <div className="h-96 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6" suppressHydrationWarning>
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
              <span>Shipments</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-extrabold">
                {allGroupedShipments.length} Lots
              </span>
            </button>

            <button
              onClick={() => setActiveTab('arrivals')}
              className={cn(
                "px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'arrivals'
                  ? "border-emerald-600 text-emerald-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Calendar className="h-3.5 w-3.5 text-emerald-600" />
              <span>Arrivals Schedule</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold">
                {arrivalsStats.totalActiveLots} Lots
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
              onClick={() => setActiveTab('customers')}
              className={cn(
                "px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-2",
                activeTab === 'customers'
                  ? "border-violet-600 text-violet-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              )}
            >
              <Building2 className="h-3.5 w-3.5 text-violet-600" />
              <span>Customer Name</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-violet-100 text-violet-800 font-extrabold">
                {uniqueCustomers.length} Customers
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
              <span>PO Contracts & Lot Status</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-extrabold">
                {poLotStats.total} Lots ({activePOs.length} POs)
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 pb-2 sm:pb-0 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            <span>Marking cargo received syncs with Purchase Orders and moves to Received Stock</span>
          </div>
        </div>

        {/* TAB 1: SHIPMENTS WITH 4-STAGE STATUS TRACKING */}
        {activeTab === 'shipments' && (
          <div>
            {/* Quick Status Pill Bar */}
            <div className="px-3.5 py-2 bg-slate-50/70 border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
              {(['ALL', 'Pending', 'Ready', 'In Transit', 'Received'] as const).map(st => {
                const isSelected = selectedShipmentStatus === st;
                const count = st === 'ALL' ? allGroupedShipments.length :
                  st === 'Pending' ? statusCounts.pending :
                  st === 'Ready' ? statusCounts.ready :
                  st === 'In Transit' ? statusCounts.inTransit : statusCounts.received;

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedShipmentStatus(st)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap",
                      isSelected
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200"
                    )}
                  >
                    <span>{st === 'ALL' ? 'All Statuses' : st}</span>
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px]",
                      isSelected ? "bg-white/20 text-white font-extrabold" : "bg-slate-100 text-slate-800 font-bold"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

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
                    placeholder="Search lot, supplier, PO, port, status..."
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

                {/* Status Dropdown */}
                <select
                  value={selectedShipmentStatus}
                  onChange={(e) => setSelectedShipmentStatus(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Statuses ({allGroupedShipments.length})</option>
                  <option value="Pending">Pending ({statusCounts.pending})</option>
                  <option value="Ready">Ready ({statusCounts.ready})</option>
                  <option value="In Transit">In Transit ({statusCounts.inTransit})</option>
                  <option value="Received">Received ({statusCounts.received})</option>
                </select>

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

                {/* Customer Filter */}
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 max-w-[170px]"
                >
                  <option value="ALL">All Customers ({uniqueCustomers.length})</option>
                  {uniqueCustomers.map(c => (
                    <option key={c} value={c}>{c}</option>
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

                {(search || selectedShipmentStatus !== 'ALL' || selectedPort !== 'ALL' || selectedSupplier !== 'ALL' || selectedCustomer !== 'ALL' || selectedTerms !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setSelectedShipmentStatus('ALL');
                      setSelectedPort('ALL');
                      setSelectedSupplier('ALL');
                      setSelectedCustomer('ALL');
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
                Showing <strong className="text-slate-900">{filteredGroupedShipments.length}</strong> lots ({filteredShipments.length} items)
              </div>
            </div>

            {/* Shipments Table - Grouped Lot-Wise */}
            <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
              <table className="w-full text-left border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="table-header w-10 text-center"></th>
                    <th className="table-header">Lot Number</th>
                    <th className="table-header">Customer</th>
                    <th className="table-header">Linked PO</th>
                    <th className="table-header">Supplier / Mill</th>
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-right">Total Weight (KG)</th>
                    <th className="table-header">Discharge Port</th>
                    <th className="table-header">Shipment Date</th>
                    <th className="table-header">Port ETA & Countdown</th>
                    <th className="table-header">Terms</th>
                    <th className="table-header text-center">Items</th>
                    <th className="table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGroupedShipments.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        <Ship className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">No shipment lots matching your filters.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Try resetting filters or adjusting search criteria.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredGroupedShipments.map((group, groupIdx) => {
                      const etaInfo = getEtaStatus(group.eta_seaport);
                      const isExpanded = expandedShipmentLots.includes(group.lot_number);

                      return (
                        <React.Fragment key={`${group.lot_number || 'grp'}-${groupIdx}`}>
                          <tr 
                            onClick={() => {
                              setExpandedShipmentLots(prev => 
                                prev.includes(group.lot_number)
                                  ? prev.filter(l => l !== group.lot_number)
                                  : [...prev, group.lot_number]
                              );
                            }}
                            className={cn(
                              "cursor-pointer transition-colors group select-none",
                              isExpanded ? "bg-blue-50/50" : "hover:bg-blue-50/30"
                            )}
                          >
                            <td className="table-cell text-center" onClick={(e) => {
                              e.stopPropagation();
                              setExpandedShipmentLots(prev => 
                                prev.includes(group.lot_number)
                                  ? prev.filter(l => l !== group.lot_number)
                                  : [...prev, group.lot_number]
                              );
                            }}>
                              <div className="flex items-center justify-center">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-blue-600 font-bold" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                                )}
                              </div>
                            </td>
                            <td className="table-cell">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded shadow-2xs">
                                  {group.lot_number}
                                </span>
                              </div>
                              {group.container_no && (
                                <span className="block mt-0.5 text-[10px] font-mono text-amber-800 font-semibold truncate max-w-[130px]" title={`Container: ${group.container_no}`}>
                                  Cont: {group.container_no}
                                </span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="font-semibold text-slate-800 text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                                {group.customer || 'SE'}
                              </span>
                            </td>
                            <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                              {group.linked_pos && group.linked_pos.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {group.linked_pos.map((poNum) => {
                                    const isActive = activePOs.some(p => p.po_number === poNum);
                                    return (
                                      <Link
                                        key={poNum}
                                        href={`/purchasing/purchase-orders/${poNum}`}
                                        className={cn(
                                          "font-bold hover:underline inline-flex items-center gap-1 text-[11px]",
                                          isActive ? "text-blue-600 hover:text-blue-800" : "text-slate-500 hover:text-slate-700"
                                        )}
                                      >
                                        <span>PO {poNum}</span>
                                        {isActive ? (
                                          <span className="text-[9px] bg-blue-50 text-blue-700 px-1 rounded font-semibold border border-blue-200">Active</span>
                                        ) : (
                                          <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded font-normal border border-slate-200">Closed</span>
                                        )}
                                      </Link>
                                    );
                                  })}
                                </div>
                              ) : group.linked_po_number ? (
                                <Link
                                  href={`/purchasing/purchase-orders/${group.linked_po_number}`}
                                  className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                >
                                  <span>PO {group.linked_po_number}</span>
                                  <ExternalLink className="h-3 w-3 opacity-60" />
                                </Link>
                              ) : (
                                <span className="text-slate-400 font-medium">Direct Cargo</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="font-semibold text-slate-800 block truncate max-w-[150px]">{group.supplier}</span>
                              {group.make && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-[150px]">Mill: {group.make}</span>
                              )}
                            </td>
                            <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                              {renderShipmentStatusBadge(group.status)}
                            </td>
                            <td className="table-cell text-right font-mono font-bold text-blue-700">
                              {formatWeight(group.total_weight)}
                            </td>
                            <td className="table-cell">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                                <MapPin className="h-3 w-3 text-red-500" />
                                {group.port || 'N.S.'}
                              </span>
                              {group.port_of_loading && (
                                <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">POL: {group.port_of_loading}</span>
                              )}
                            </td>
                            <td className="table-cell text-slate-600 font-medium">
                              {formatDate(group.date_of_shipment)}
                            </td>
                            <td className="table-cell">
                              {group.eta_seaport ? (
                                <div className="space-y-0.5">
                                  <span className="font-semibold text-slate-800 block">{formatDate(group.eta_seaport)}</span>
                                  <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] border ${etaInfo.color}`}>
                                    {etaInfo.text}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="font-semibold text-slate-800 block">{group.delivery_terms || 'FOB'}</span>
                              {group.payment_terms && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-[100px]">{group.payment_terms}</span>
                              )}
                            </td>
                            <td className="table-cell text-center">
                              <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200">
                                <Boxes className="h-3 w-3" />
                                <span>{group.items.length}</span>
                              </span>
                            </td>
                            <td className="table-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedShipmentLots(prev => 
                                    prev.includes(group.lot_number)
                                      ? prev.filter(l => l !== group.lot_number)
                                      : [...prev, group.lot_number]
                                  );
                                }}
                                className={cn(
                                  "px-2.5 py-1 rounded text-[11px] font-bold transition-all inline-flex items-center gap-1",
                                  isExpanded
                                    ? "bg-slate-200 hover:bg-slate-300 text-slate-800"
                                    : "bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 shadow-2xs"
                                )}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                    <span>Hide Items</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                    <span>View Items ({group.items.length})</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Items Sub-Table */}
                          {isExpanded && (
                            <tr className="bg-blue-50/20">
                              <td colSpan={13} className="p-0 border-b border-slate-200">
                                <div className="p-4 bg-gradient-to-r from-blue-50/60 via-slate-50 to-indigo-50/50 border-l-4 border-l-blue-600 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Boxes className="h-4 w-4 text-blue-600" />
                                      <span className="font-bold text-slate-900 text-xs">
                                        Items in Lot <span className="font-mono bg-slate-900 text-white px-1.5 py-0.5 rounded text-[11px]">{group.lot_number}</span> ({group.items.length} items • {formatWeight(group.total_weight)})
                                      </span>
                                      {group.linked_po_number && (
                                        <span className="text-[11px] text-slate-500">
                                          — Purchase Order #{group.linked_po_number}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 italic">
                                      Click any item row to inspect complete mill & shipping details
                                    </span>
                                  </div>

                                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead>
                                        <tr className="bg-slate-100/90 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                                          <th className="py-2 px-3">Grade Code</th>
                                          <th className="py-2 px-3">Section / Shape</th>
                                          <th className="py-2 px-3">Dimensions</th>
                                          <th className="py-2 px-3 text-right">Weight (KG)</th>
                                          <th className="py-2 px-3">Heat Number</th>
                                          <th className="py-2 px-3">SIMS Reg.</th>
                                          <th className="py-2 px-3">Container No.</th>
                                          <th className="py-2 px-3">Port of Load</th>
                                          <th className="py-2 px-3 text-center">Status</th>
                                          <th className="py-2 px-3 text-right">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {group.items.map((item, idx) => (
                                          <tr 
                                            key={`${item.id || 'item'}-${idx}`}
                                            onClick={() => setInspectingItem(item)}
                                            className="hover:bg-blue-50/60 cursor-pointer transition-colors group/item"
                                          >
                                            <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                                              <span>{item.grade || '—'}</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-slate-600 font-medium">
                                              {item.rawItem?.section_name || item.rawIncoming?.condition || 'Steel'}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                                              {item.dimensions || '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                                              {formatWeight(item.weight)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                                              {item.heat_no ? (
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-semibold">{item.heat_no}</span>
                                              ) : '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-[11px]">
                                              {item.sims ? (
                                                item.sims === 'Done' ? (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Done</span>
                                                ) : item.sims === 'Not Required' ? (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Not Required</span>
                                                ) : (
                                                  <span className="font-mono text-slate-700">{item.sims}</span>
                                                )
                                              ) : '—'}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-amber-800 text-[11px] font-semibold">
                                              {item.container_no ? (
                                                <span className="bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{item.container_no}</span>
                                              ) : (group.container_no ? (
                                                <span className="bg-amber-50/60 px-1.5 py-0.5 rounded text-amber-800/80">{group.container_no}</span>
                                              ) : '—')}
                                            </td>
                                            <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                              {item.port_of_loading || group.port_of_loading || '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                              {renderShipmentStatusBadge(item.status)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                              <div className="flex items-center justify-end gap-1.5">
                                                {!isViewer && item.status === 'In Transit' && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setReceivingItem(item);
                                                      setWarehouseLocation(item.port?.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                                                    }}
                                                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shadow-2xs transition-colors flex items-center gap-1"
                                                    title="Receive cargo arrival into warehouse inventory"
                                                  >
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    <span>Receive</span>
                                                  </button>
                                                )}
                                                {item.status === 'Ready' && (
                                                  <Link
                                                    href={item.linked_po_number ? `/purchasing/purchase-orders/${item.linked_po_number}` : `/purchasing/purchase-orders`}
                                                    className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] shadow-2xs transition-colors inline-flex items-center gap-1"
                                                    title="Open PO to record shipment details"
                                                  >
                                                    <Ship className="h-3 w-3" />
                                                    <span>Ship →</span>
                                                  </Link>
                                                )}
                                                {item.status === 'Pending' && (
                                                  <Link
                                                    href={item.linked_po_number ? `/purchasing/purchase-orders/${item.linked_po_number}` : `/purchasing/purchase-orders`}
                                                    className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 font-bold text-[10px] transition-colors inline-flex items-center gap-1"
                                                    title="Open PO to mark item ready"
                                                  >
                                                    <PackagePlus className="h-3 w-3" />
                                                    <span>Ready →</span>
                                                  </Link>
                                                )}
                                                {item.status === 'Received' && (
                                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                    ✓ Recd
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => setInspectingItem(item)}
                                                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] transition-colors"
                                                >
                                                  Details
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: ARRIVALS SCHEDULE BY DATE */}
        {activeTab === 'arrivals' && (
          <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">Maritime Port Arrivals Schedule</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {arrivalsStats.uniqueArrivalDates} Scheduled Arrival Dates
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Chronological schedule of container cargo arrivals at maritime ports. Track which lot is arriving on what date.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (collapsedArrivalDates.length === 0) {
                      setCollapsedArrivalDates(filteredArrivalsByDate.map(g => g.dateStr));
                    } else {
                      setCollapsedArrivalDates([]);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                >
                  {collapsedArrivalDates.length === 0 ? 'Collapse All Dates' : 'Expand All Dates'}
                </button>
              </div>
            </div>

            {/* Arrivals KPI Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div 
                onClick={() => setArrivalsTimeFilter('ALL')}
                className={cn(
                  "p-3.5 rounded-xl border transition-all cursor-pointer card-shadow",
                  arrivalsTimeFilter === 'ALL' ? "bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20" : "bg-white border-slate-200 hover:border-slate-300"
                )}
              >
                <div className={cn("flex items-center justify-between", arrivalsTimeFilter === 'ALL' ? "text-slate-200" : "text-slate-600")}>
                  <span className="text-[10px] font-bold uppercase tracking-wider">All In-Transit</span>
                  <Ship className="h-4 w-4" />
                </div>
                <div className={cn("mt-2 text-xl font-extrabold", arrivalsTimeFilter === 'ALL' ? "text-white" : "text-slate-900")}>
                  {arrivalsStats.totalActiveLots} Lots
                </div>
                <div className={cn("text-[11px] font-mono font-bold mt-0.5", arrivalsTimeFilter === 'ALL' ? "text-slate-300" : "text-slate-500")}>
                  {formatWeight(arrivalsStats.totalActiveWeight)}
                </div>
              </div>

              <div 
                onClick={() => setArrivalsTimeFilter('THIS_WEEK')}
                className={cn(
                  "p-3.5 rounded-xl border transition-all cursor-pointer card-shadow",
                  arrivalsTimeFilter === 'THIS_WEEK' ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-400/20" : "bg-white border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between text-amber-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Arriving This Week</span>
                  <Clock className="h-4 w-4" />
                </div>
                <div className="mt-2 text-xl font-extrabold text-amber-900">
                  {arrivalsStats.thisWeekLots} Lots
                </div>
                <div className="text-[11px] font-mono font-bold text-amber-700 mt-0.5">
                  {formatWeight(arrivalsStats.thisWeekWeight)}
                </div>
              </div>

              <div 
                onClick={() => setArrivalsTimeFilter('THIS_MONTH')}
                className={cn(
                  "p-3.5 rounded-xl border transition-all cursor-pointer card-shadow",
                  arrivalsTimeFilter === 'THIS_MONTH' ? "bg-blue-50/50 border-blue-400 ring-2 ring-blue-400/20" : "bg-white border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between text-blue-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Arriving in 30 Days</span>
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="mt-2 text-xl font-extrabold text-blue-900">
                  {arrivalsStats.thisMonthLots} Lots
                </div>
                <div className="text-[11px] font-mono font-bold text-blue-700 mt-0.5">
                  {formatWeight(arrivalsStats.thisMonthWeight)}
                </div>
              </div>

              <div 
                onClick={() => setArrivalsTimeFilter('OVERDUE')}
                className={cn(
                  "p-3.5 rounded-xl border transition-all cursor-pointer card-shadow",
                  arrivalsTimeFilter === 'OVERDUE' ? "bg-rose-50/50 border-rose-400 ring-2 ring-rose-400/20" : "bg-white border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between text-rose-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Delayed / Overdue</span>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="mt-2 text-xl font-extrabold text-rose-900">
                  {arrivalsStats.overdueLots} Lots
                </div>
                <div className="text-[11px] font-mono font-bold text-rose-700 mt-0.5">
                  {formatWeight(arrivalsStats.overdueWeight)}
                </div>
              </div>

              <div 
                onClick={() => setArrivalsTimeFilter('UNSCHEDULED')}
                className={cn(
                  "p-3.5 rounded-xl border transition-all cursor-pointer card-shadow",
                  arrivalsTimeFilter === 'UNSCHEDULED' ? "bg-slate-100 border-slate-400 ring-2 ring-slate-400/20" : "bg-white border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Schedule Pending</span>
                  <Layers className="h-4 w-4" />
                </div>
                <div className="mt-2 text-xl font-extrabold text-slate-900">
                  {arrivalsStats.unscheduledLots} Lots
                </div>
                <div className="text-[11px] font-mono font-bold text-slate-600 mt-0.5">
                  {formatWeight(arrivalsStats.unscheduledWeight)}
                </div>
              </div>
            </div>

            {/* Filter Toolbar for Arrivals */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                {(['ALL', 'THIS_WEEK', 'THIS_MONTH', 'UPCOMING', 'OVERDUE', 'UNSCHEDULED', 'RECEIVED'] as const).map(tf => {
                  const isSelected = arrivalsTimeFilter === tf;
                  const label = 
                    tf === 'ALL' ? 'All In-Transit' :
                    tf === 'THIS_WEEK' ? 'This Week (< 7d)' :
                    tf === 'THIS_MONTH' ? 'Next 30 Days' :
                    tf === 'UPCOMING' ? 'All Scheduled' :
                    tf === 'OVERDUE' ? 'Delayed' :
                    tf === 'UNSCHEDULED' ? 'Schedule Pending' : 'Received';

                  const count =
                    tf === 'ALL' ? arrivalsStats.totalActiveLots :
                    tf === 'THIS_WEEK' ? arrivalsStats.thisWeekLots :
                    tf === 'THIS_MONTH' ? arrivalsStats.thisMonthLots :
                    tf === 'UPCOMING' ? arrivalsStats.upcomingLots :
                    tf === 'OVERDUE' ? arrivalsStats.overdueLots :
                    tf === 'UNSCHEDULED' ? arrivalsStats.unscheduledLots : arrivalsStats.receivedLots;

                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setArrivalsTimeFilter(tf)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap",
                        isSelected
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200"
                      )}
                    >
                      <span>{label}</span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded-full text-[10px]",
                        isSelected ? "bg-white/20 text-white font-extrabold" : "bg-slate-100 text-slate-700"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}

                <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

                {/* Port Filter */}
                <select
                  value={arrivalsPort}
                  onChange={(e) => setArrivalsPort(e.target.value)}
                  className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="ALL">All Ports ({uniquePorts.length})</option>
                  {uniquePorts.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                {/* Search */}
                <div className="relative min-w-[200px] flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={arrivalsSearch}
                    onChange={(e) => setArrivalsSearch(e.target.value)}
                    placeholder="Search lot, PO, date, supplier, container..."
                    className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {arrivalsSearch && (
                    <button
                      onClick={() => setArrivalsSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {(arrivalsSearch || arrivalsPort !== 'ALL' || arrivalsTimeFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setArrivalsSearch('');
                      setArrivalsPort('ALL');
                      setArrivalsTimeFilter('ALL');
                    }}
                    className="text-xs font-semibold text-rose-600 hover:underline px-1"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="text-slate-500 font-medium text-xs">
                Showing <strong className="text-slate-900">{filteredArrivalsByDate.length}</strong> arrival dates ({filteredArrivalsLotsCount} lots)
              </div>
            </div>

            {/* Date-Grouped Arrivals Schedule */}
            {filteredArrivalsByDate.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 card-shadow">
                <Calendar className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <h3 className="font-bold text-slate-700 text-sm">No arrivals found matching your criteria</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Try adjusting the arrival time filter, clearing the search query, or selecting another port of discharge.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredArrivalsByDate.map((dateGroup) => {
                  const isCollapsed = collapsedArrivalDates.includes(dateGroup.dateStr);
                  const daysDiff = dateGroup.etaInfo.daysDiff;
                  const isOverdue = daysDiff !== null && daysDiff < 0;
                  const isToday = daysDiff === 0;
                  const isThisWeek = daysDiff !== null && daysDiff > 0 && daysDiff <= 7;

                  return (
                    <div 
                      key={dateGroup.dateStr}
                      className={cn(
                        "rounded-xl border transition-all overflow-hidden card-shadow bg-white",
                        isToday ? "border-amber-300 ring-2 ring-amber-400/20" :
                        isOverdue ? "border-rose-200" :
                        isThisWeek ? "border-emerald-300" : "border-slate-200"
                      )}
                    >
                      {/* Date Header Card */}
                      <div 
                        onClick={() => {
                          setCollapsedArrivalDates(prev =>
                            prev.includes(dateGroup.dateStr)
                              ? prev.filter(d => d !== dateGroup.dateStr)
                              : [...prev, dateGroup.dateStr]
                          );
                        }}
                        className={cn(
                          "px-4 py-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition-colors border-b",
                          isToday ? "bg-amber-50/70 border-amber-200 hover:bg-amber-100/50" :
                          isOverdue ? "bg-rose-50/50 border-rose-200 hover:bg-rose-100/40" :
                          isThisWeek ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-100/40" :
                          "bg-slate-50/70 border-slate-200 hover:bg-slate-100/60"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            isToday ? "bg-amber-500 text-white" :
                            isOverdue ? "bg-rose-500 text-white" :
                            isThisWeek ? "bg-emerald-600 text-white" : "bg-slate-800 text-white"
                          )}>
                            <Calendar className="h-4 w-4" />
                          </div>

                          <div>
                            <div className="flex items-center gap-2.5">
                              <h3 className="font-bold text-slate-900 text-sm">
                                {dateGroup.dateStr === 'unscheduled' ? 'Arrival Date Pending / Unscheduled' : formatDate(dateGroup.dateStr)}
                              </h3>
                              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border", dateGroup.etaInfo.color)}>
                                {dateGroup.etaInfo.text}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>Port ETA: <strong>{dateGroup.dateStr === 'unscheduled' ? 'TBD' : dateGroup.dateStr}</strong></span>
                              <span>•</span>
                              <span>Destination: <strong>{Array.from(new Set(dateGroup.lots.map(l => l.port))).join(', ') || 'N.S.'}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs font-bold text-slate-900">
                              {dateGroup.lots.length} {dateGroup.lots.length === 1 ? 'Lot' : 'Lots'}
                            </div>
                            <div className="text-xs font-mono font-bold text-blue-700">
                              {formatWeight(dateGroup.totalWeight)}
                            </div>
                          </div>

                          <div className="p-1 rounded-md text-slate-400 hover:text-slate-700 bg-white border border-slate-200">
                            {isCollapsed ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronUp className="h-4 w-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lots Arriving on this Date Table */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                <th className="py-2.5 px-4">Lot Number</th>
                                <th className="py-2.5 px-3">Linked PO</th>
                                <th className="py-2.5 px-3">Supplier / Mill</th>
                                <th className="py-2.5 px-3 text-center">Status</th>
                                <th className="py-2.5 px-3 text-right">Cargo Weight</th>
                                <th className="py-2.5 px-3">Discharge Port</th>
                                <th className="py-2.5 px-3">Port of Load</th>
                                <th className="py-2.5 px-3">Container No.</th>
                                <th className="py-2.5 px-3">Items / Specs</th>
                                <th className="py-2.5 px-4 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {dateGroup.lots.map((lot, lotIdx) => {
                                const grades = Array.from(new Set(lot.items.map(it => it.grade).filter(Boolean))).join(', ');
                                const dimensions = Array.from(new Set(lot.items.map(it => it.dimensions).filter(Boolean))).slice(0, 2).join(' • ');

                                return (
                                  <tr 
                                    key={`${lot.lot_number || 'lot'}-${lotIdx}`}
                                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                    onClick={() => {
                                      if (lot.items.length > 0) {
                                        setInspectingItem(lot.items[0]);
                                      }
                                    }}
                                  >
                                    <td className="py-2.5 px-4">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded shadow-2xs">
                                          {lot.lot_number}
                                        </span>
                                      </div>
                                    </td>

                                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                                      {lot.linked_po_number ? (
                                        <Link
                                          href={`/purchasing/purchase-orders/${lot.linked_po_number}`}
                                          className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                        >
                                          <span>PO {lot.linked_po_number}</span>
                                          <ExternalLink className="h-3 w-3 opacity-60" />
                                        </Link>
                                      ) : (
                                        <span className="text-slate-400 font-medium">Direct Cargo</span>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-3">
                                      <span className="font-semibold text-slate-800 block truncate max-w-[140px]">{lot.supplier}</span>
                                      {lot.make && (
                                        <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">Mill: {lot.make}</span>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                      {renderShipmentStatusBadge(lot.status)}
                                    </td>

                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                                      {formatWeight(lot.total_weight)}
                                    </td>

                                    <td className="py-2.5 px-3">
                                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                                        <MapPin className="h-3 w-3 text-red-500" />
                                        {lot.port || 'N.S.'}
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                      {lot.port_of_loading || '—'}
                                    </td>

                                    <td className="py-2.5 px-3">
                                      {lot.container_no ? (
                                        <span className="font-mono text-amber-800 text-[11px] font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 truncate max-w-[120px] inline-block">
                                          {lot.container_no}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-3">
                                      <div className="text-[11px] font-semibold text-slate-800">{grades || 'Steel Grade'}</div>
                                      {dimensions && (
                                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">{dimensions}</div>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-1.5">
                                        {!isViewer && lot.status === 'In Transit' && lot.items.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setReceivingItem(lot.items[0]);
                                              setWarehouseLocation(lot.port?.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                                            }}
                                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shadow-2xs transition-colors flex items-center gap-1"
                                            title="Receive this lot into warehouse inventory"
                                          >
                                            <CheckCircle2 className="h-3 w-3" />
                                            <span>Receive</span>
                                          </button>
                                        )}
                                        {lot.items.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => setInspectingItem(lot.items[0])}
                                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] transition-colors"
                                          >
                                            Inspect Lot
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
            <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full rounded-xl border border-slate-200">
              <table className="w-full text-left border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="table-header">Lot Number</th>
                    <th className="table-header">PO Number</th>
                    <th className="table-header">Supplier</th>
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-right">Weight (KG)</th>
                    <th className="table-header">Date of Shipment</th>
                    <th className="table-header">Sea Port ETA</th>
                    <th className="table-header">Arrival Status</th>
                    <th className="table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No shipments found for port {selectedPort}.
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.map((item, idx) => {
                      const etaInfo = getEtaStatus(item.eta_seaport);
                      return (
                        <tr key={`${item.id || 'ship'}-${idx}`} className="hover:bg-slate-50 transition-colors">
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
                          <td className="table-cell text-center">
                            {renderShipmentStatusBadge(item.status)}
                          </td>
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
                          <td className="table-cell text-right whitespace-nowrap">
                            {!isViewer && item.status === 'In Transit' && (
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
                            )}
                            {item.status === 'Ready' && (
                              <Link
                                href={item.linked_po_number ? `/purchasing/purchase-orders/${item.linked_po_number}` : `/purchasing/purchase-orders`}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition-colors ml-auto inline-flex items-center gap-1"
                              >
                                <Ship className="h-3 w-3" />
                                <span>Ship</span>
                              </Link>
                            )}
                            {item.status === 'Pending' && (
                              <Link
                                href={item.linked_po_number ? `/purchasing/purchase-orders/${item.linked_po_number}` : `/purchasing/purchase-orders`}
                                className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px] transition-colors ml-auto inline-flex items-center gap-1"
                              >
                                <PackagePlus className="h-3 w-3" />
                                <span>Ready</span>
                              </Link>
                            )}
                            {item.status === 'Received' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" /> Received ✓
                              </span>
                            )}
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

        {/* TAB: CUSTOMER NAME & CARGO ALLOCATION */}
        {activeTab === 'customers' && (
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-violet-600" />
                  <span>Customer Cargo & Order Allocation Analysis</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consolidated tracking of live inbound shipments, container cargo, and lot allocations by Customer Name.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Customer Report</span>
                </button>
              </div>
            </div>

            {/* Customer Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {customerStats.map((custData) => {
                const isSelected = selectedCustomer === custData.customer;
                return (
                  <div
                    key={custData.customer}
                    onClick={() => setSelectedCustomer(isSelected ? 'ALL' : custData.customer)}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer card-shadow flex flex-col justify-between space-y-3",
                      isSelected
                        ? "border-violet-600 ring-2 ring-violet-500/20 bg-violet-50/20"
                        : "border-slate-200 bg-white hover:border-violet-300"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-violet-50 text-violet-600 border border-violet-100">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-xs">{custData.customer}</h3>
                          <span className="text-[10px] text-slate-400 font-medium">Customer Account</span>
                        </div>
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        isSelected
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      )}>
                        {custData.lots.length} Lots
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-500 text-[11px]">Total Cargo Weight:</span>
                        <strong className="text-sm font-mono font-extrabold text-violet-700">
                          {formatWeight(custData.totalWeight)}
                        </strong>
                      </div>
                      <div className="flex items-baseline justify-between text-[11px] text-slate-500">
                        <span>Total Pieces:</span>
                        <span className="font-mono font-bold text-slate-700">{custData.totalPieces} PCS</span>
                      </div>
                    </div>

                    {/* Stage breakdown */}
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-100">
                        <span className="text-slate-400 block font-semibold">Ready</span>
                        <span className="font-bold text-blue-600">{custData.readyLots} lots</span>
                      </div>
                      <div className="bg-amber-50/60 p-1.5 rounded border border-amber-100">
                        <span className="text-amber-700 block font-semibold">Transit</span>
                        <span className="font-bold text-amber-800">{custData.transitLots} lots</span>
                      </div>
                      <div className="bg-emerald-50/60 p-1.5 rounded border border-emerald-100">
                        <span className="text-emerald-700 block font-semibold">Received</span>
                        <span className="font-bold text-emerald-800">{custData.receivedLots} lots</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-violet-600 font-semibold text-right pt-0.5">
                      {isSelected ? 'Click to show all customers' : 'Filter by this customer →'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Filter Toolbar for Customer Shipments Table */}
            <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
              <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search customer lots, PO, supplier, grade..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
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

                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="py-1.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="ALL">All Customers ({uniqueCustomers.length})</option>
                    {uniqueCustomers.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={selectedShipmentStatus}
                    onChange={(e) => setSelectedShipmentStatus(e.target.value)}
                    className="py-1.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Ready">Ready</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Received">Received</option>
                  </select>

                  {(search || selectedCustomer !== 'ALL' || selectedShipmentStatus !== 'ALL') && (
                    <button
                      onClick={() => {
                        setSearch('');
                        setSelectedCustomer('ALL');
                        setSelectedShipmentStatus('ALL');
                      }}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </div>

                <div className="text-slate-500 font-medium">
                  Showing <strong className="text-slate-900">{filteredGroupedShipments.length}</strong> lots ({formatWeight(filteredGroupedShipments.reduce((sum, g) => sum + g.total_weight, 0))})
                </div>
              </div>

              {/* Customer Lots Breakdown Table */}
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 shadow-2xs">
                    <tr>
                      <th className="table-header">Customer</th>
                      <th className="table-header">Lot Number</th>
                      <th className="table-header">Linked PO</th>
                      <th className="table-header">Supplier / Make</th>
                      <th className="table-header">Grade & Spec</th>
                      <th className="table-header text-right">Pieces</th>
                      <th className="table-header text-right">Cargo Weight</th>
                      <th className="table-header">Discharge Port</th>
                      <th className="table-header">Shipment Date</th>
                      <th className="table-header">Port ETA</th>
                      <th className="table-header text-center">SIMS Filing</th>
                      <th className="table-header text-center">Stage</th>
                      <th className="table-header text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGroupedShipments.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-12 text-center text-slate-400">
                          <Building2 className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-semibold text-slate-600">No shipments found for customer filter.</p>
                          <p className="text-[11px] text-slate-400 mt-1">Try selecting a different customer or resetting filters.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredGroupedShipments.map((group, idx) => {
                        const firstItem = group.items[0];
                        return (
                          <tr 
                            key={`${group.lot_number}-${idx}`} 
                            onClick={() => firstItem && setInspectingItem(firstItem)}
                            className="hover:bg-violet-50/40 cursor-pointer transition-colors group"
                          >
                            <td className="table-cell font-bold text-slate-900">
                              <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-800 font-bold border border-violet-200">
                                {group.customer || 'SE'}
                              </span>
                            </td>
                            <td className="table-cell font-mono font-bold text-slate-900">
                              {group.lot_number}
                              {group.container_no && (
                                <span className="block text-[10px] text-amber-800 font-mono font-normal">
                                  {group.container_no}
                                </span>
                              )}
                            </td>
                            <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                              {group.linked_po_number ? (
                                <Link 
                                  href={`/purchasing/purchase-orders/${group.linked_po_number}`}
                                  className="font-bold text-blue-600 hover:underline"
                                >
                                  PO {group.linked_po_number}
                                </Link>
                              ) : (
                                <span className="text-slate-400">Direct Cargo</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="font-semibold text-slate-800 block truncate max-w-[130px]">{group.supplier}</span>
                              {group.make && (
                                <span className="text-[10px] text-slate-400 block">{group.make}</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="font-bold text-slate-900 block">{firstItem?.grade || 'Steel Grade'}</span>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">{firstItem?.dimensions || 'Standard Spec'}</span>
                            </td>
                            <td className="table-cell text-right font-mono font-bold text-slate-700">
                              {group.total_pieces || group.items.length}
                            </td>
                            <td className="table-cell text-right font-mono font-bold text-violet-700">
                              {formatWeight(group.total_weight)}
                            </td>
                            <td className="table-cell font-medium text-slate-700">{group.port || 'N.S.'}</td>
                            <td className="table-cell whitespace-nowrap text-slate-600">{formatDate(group.date_of_shipment)}</td>
                            <td className="table-cell whitespace-nowrap font-medium text-slate-800">{formatDate(group.eta_seaport)}</td>
                            <td className="table-cell text-center">
                              {firstItem?.sims ? (
                                firstItem.sims === 'Done' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Done</span>
                                ) : firstItem.sims === 'Not Required' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Not Required</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700">{firstItem.sims}</span>
                                )
                              ) : '—'}
                            </td>
                            <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                              {renderShipmentStatusBadge(group.status)}
                            </td>
                            <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>
                              {firstItem && (
                                <button
                                  type="button"
                                  onClick={() => setInspectingItem(firstItem)}
                                  className="px-2.5 py-1 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors border border-violet-200"
                                >
                                  Inspect
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
            </div>
          </div>
        )}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Quick Metrics Bar for PO Lots */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 bg-slate-50 border-b border-slate-200">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Contract Lots</span>
                <strong className="text-base font-extrabold text-slate-900">{poLotStats.total}</strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Across {activePOs.length} active POs</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-2xs">
                <span className="text-[10px] text-amber-700 font-bold uppercase block flex items-center gap-1">
                  <Ship className="h-3 w-3" /> In Transit (Sea)
                </span>
                <strong className="text-base font-extrabold text-amber-600">{poLotStats.inTransit} lots</strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Maritime voyage</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs">
                <span className="text-[10px] text-blue-700 font-bold uppercase block flex items-center gap-1">
                  <PackageCheck className="h-3 w-3" /> Ready to Ship
                </span>
                <strong className="text-base font-extrabold text-blue-600">{poLotStats.readyToShip} lots</strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Factory inspected</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-600 font-bold uppercase block flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Open / Production
                </span>
                <strong className="text-base font-extrabold text-slate-700">{poLotStats.open} lots</strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Pending mill dispatch</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold uppercase block flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Received into Yard
                </span>
                <strong className="text-base font-extrabold text-emerald-600">{poLotStats.received} lots</strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Port cleared</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Active Cargo Weight</span>
                <strong className="text-base font-extrabold text-blue-700">{formatWeight(poLotStats.totalWeight)}</strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Total contract steel</span>
              </div>
            </div>

            {/* Filter & View Mode Toolbar */}
            <div className="px-4 py-3 bg-white flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-200">
              {/* View Switcher Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setOrdersViewMode('lots')}
                  className={cn(
                    "px-3 py-1.5 rounded-md font-bold text-xs transition-all flex items-center gap-1.5",
                    ordersViewMode === 'lots'
                      ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Lot-Wise Shipment Status ({filteredPoLots.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrdersViewMode('pos')}
                  className={cn(
                    "px-3 py-1.5 rounded-md font-bold text-xs transition-all flex items-center gap-1.5",
                    ordersViewMode === 'pos'
                      ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span>Grouped by Purchase Order ({activePOs.length})</span>
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                    placeholder="Search lot #, PO #, supplier, grade..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                  {ordersSearch && (
                    <button
                      onClick={() => setOrdersSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={ordersStatusFilter}
                  onChange={(e) => setOrdersStatusFilter(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Lot Statuses ({allPoLots.length})</option>
                  <option value="IN TRANSIT">In Transit at Sea ({poLotStats.inTransit})</option>
                  <option value="READY TO SHIP">Ready to Ship ({poLotStats.readyToShip})</option>
                  <option value="OPEN">Open / In Production ({poLotStats.open})</option>
                  <option value="RECEIVED">Received ({poLotStats.received})</option>
                </select>

                {(ordersSearch || ordersStatusFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setOrdersSearch('');
                      setOrdersStatusFilter('ALL');
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* VIEW 1: LOT-WISE SHIPMENT STATUS TABLE */}
            {ordersViewMode === 'lots' && (
              <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
                <table className="w-full text-left border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      <th className="table-header">Lot Number</th>
                      <th className="table-header">PO Number</th>
                      <th className="table-header">Supplier</th>
                      <th className="table-header text-center">Status</th>
                      <th className="table-header text-right">Weight (KG)</th>
                      <th className="table-header">Date of Shipment</th>
                      <th className="table-header">Port ETA & Countdown</th>
                      <th className="table-header">Port & Terms</th>
                      <th className="table-header text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPoLots.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <Package className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-semibold text-slate-600">No lots found.</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Items will only go to shipments after assigning a lot number from the Purchase Order tab (e.g. via &quot;Ready&quot; action).
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredPoLots.map((lot, idx) => {
                        const etaInfo = getEtaStatus(lot.etaSeaport);

                        return (
                          <tr key={`${lot.id || 'lot'}-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                            <td className="table-cell">
                              <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded shadow-2xs">
                                {lot.lotNumber}
                              </span>
                              {lot.containerNo && (
                                <span className="block mt-0.5 text-[10px] font-mono text-amber-800 font-semibold truncate max-w-[120px]" title={`Container: ${lot.containerNo}`}>
                                  Cont: {lot.containerNo}
                                </span>
                              )}
                              {!lot.hasExplicitLot && (
                                <span className="block text-[10px] text-slate-400 mt-0.5">Item #{lot.lineNumber}</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <Link
                                href={`/purchasing/purchase-orders/${lot.poNumber}`}
                                className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                              >
                                <ShoppingBag className="h-3 w-3" />
                                <span>PO {lot.poNumber}</span>
                              </Link>
                            </td>
                            <td className="table-cell">
                              <span className="font-semibold text-slate-800 block truncate max-w-[140px]" title={lot.supplierName}>
                                {lot.supplierName}
                              </span>
                            </td>
                            <td className="table-cell text-center">
                              {renderShipmentStatusBadge(lot.status)}
                            </td>
                            <td className="table-cell text-right">
                              <span className="font-mono font-bold text-blue-700 block">
                                {formatWeight(lot.readyQty > 0 ? lot.readyQty : lot.orderedQty)}
                              </span>
                              {lot.readyQty > 0 && lot.readyQty !== lot.orderedQty && (
                                <span className="text-[10px] text-slate-400 block">Ord: {formatWeight(lot.orderedQty)}</span>
                              )}
                            </td>
                            <td className="table-cell text-slate-600">
                              {formatDate(lot.dateOfShipment)}
                            </td>
                            <td className="table-cell">
                              {lot.etaSeaport ? (
                                <div className="space-y-0.5">
                                  <span className="font-semibold text-slate-800 block">{formatDate(lot.etaSeaport)}</span>
                                  <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] border ${etaInfo.color}`}>
                                    {etaInfo.text}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                                <MapPin className="h-3 w-3 text-red-500" />
                                {lot.port}
                              </span>
                              {lot.portOfLoading && (
                                <span className="text-[10px] text-slate-500 block mt-0.5">POL: {lot.portOfLoading}</span>
                              )}
                              <span className="text-[10px] text-slate-500 block mt-0.5">{lot.deliveryTerms}</span>
                            </td>
                            <td className="table-cell text-right whitespace-nowrap">
                              {!isViewer && lot.status === 'In Transit' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceivingPoLot({
                                      po: lot.rawPo,
                                      item: lot.rawItem,
                                      lotNumber: lot.lotNumber,
                                      port: lot.port,
                                      grade: lot.gradeCode,
                                      weight: lot.readyQty > 0 ? lot.readyQty : lot.orderedQty
                                    });
                                    setWarehouseLocation(lot.port.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                                  }}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition-colors flex items-center gap-1 ml-auto"
                                  title="Confirm physical arrival into warehouse inventory"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Receive</span>
                                </button>
                              )}

                              {lot.status === 'Ready to Ship' && (
                                <Link
                                  href={`/purchasing/purchase-orders/${lot.poNumber}`}
                                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-sm transition-colors inline-flex items-center gap-1"
                                  title="Open PO to record dispatch details"
                                >
                                  <Ship className="h-3 w-3" />
                                  <span>Ship Item →</span>
                                </Link>
                              )}

                              {lot.status === 'Open' && (
                                <Link
                                  href={`/purchasing/purchase-orders/${lot.poNumber}`}
                                  className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                                  title="Open PO to mark item ready"
                                >
                                  <PackagePlus className="h-3 w-3" />
                                  <span>Ready →</span>
                                </Link>
                              )}

                              {lot.status === 'Received' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" /> Received ✓
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW 2: GROUPED BY PURCHASE ORDER (WITH ACCORDION LOTS EXPANDER) */}
            {ordersViewMode === 'pos' && (
              <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
                <table className="w-full text-left border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      <th className="table-header w-12 text-center">Lots</th>
                      <th className="table-header">PO Number</th>
                      <th className="table-header">Supplier</th>
                      <th className="table-header">Destination Port</th>
                      <th className="table-header">Delivery Terms</th>
                      <th className="table-header">Lots Breakdown</th>
                      <th className="table-header">Expected Port Arrival</th>
                      <th className="table-header text-right">Pending Cargo (KG)</th>
                      <th className="table-header text-center">PO Status</th>
                      <th className="table-header text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activePOs.map((po, idx) => {
                      const isExpanded = expandedPoIds.includes(po.id);
                      const poLots = allPoLots.filter(l => l.poId === po.id || l.poNumber === po.po_number);
                      const inTransitLots = poLots.filter(l => l.status === 'In Transit');
                      const readyLots = poLots.filter(l => l.status === 'Ready to Ship');
                      const openLots = poLots.filter(l => l.status === 'Open');
                      const receivedLots = poLots.filter(l => l.status === 'Received');

                      return (
                        <React.Fragment key={`${po.id}-${po.po_number || idx}`}>
                          <tr className={cn("hover:bg-slate-50 transition-colors", isExpanded && "bg-blue-50/20")}>
                            <td className="table-cell text-center">
                              <button
                                type="button"
                                onClick={() => togglePoExpanded(po.id)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-600 transition-colors"
                                title={isExpanded ? "Collapse lots" : "Expand lots under this PO"}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                              </button>
                            </td>
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
                            <td className="table-cell">
                              <div className="flex flex-wrap items-center gap-1">
                                {poLots.length === 0 ? (
                                  <span className="text-[10px] text-slate-400 italic">No lots assigned yet</span>
                                ) : (
                                  <>
                                    {inTransitLots.length > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {inTransitLots.length} In Transit
                                      </span>
                                    )}
                                    {readyLots.length > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        {readyLots.length} Ready
                                      </span>
                                    )}
                                    {openLots.length > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                        {openLots.length} Open
                                      </span>
                                    )}
                                    {receivedLots.length > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {receivedLots.length} Recd
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="table-cell text-slate-600">{formatDate(po.expected_delivery_date)}</td>
                            <td className="table-cell text-right font-bold text-blue-700">{formatWeight(po.total_balance_qty)}</td>
                            <td className="table-cell text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {po.status}
                              </span>
                            </td>
                            <td className="table-cell text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => togglePoExpanded(po.id)}
                                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                                >
                                  {isExpanded ? 'Hide Lots' : (poLots.length > 0 ? `View ${poLots.length} Lots` : 'Details')}
                                </button>
                                <Link
                                  href={`/purchasing/purchase-orders/${po.po_number}`}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  Open →
                                </Link>
                              </div>
                            </td>
                          </tr>

                          {/* Accordion Subtable of Lots */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={10} className="p-3 pl-10">
                                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
                                  <div className="text-[11px] font-bold text-slate-700 pb-2 border-b border-slate-100 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                      <Layers className="h-3.5 w-3.5 text-blue-600" />
                                      <span>Contract Lots Breakdown for PO {po.po_number} ({poLots.length} {poLots.length === 1 ? 'lot' : 'lots'})</span>
                                    </span>
                                    <span className="text-slate-400 font-normal">Individual shipment details per lot</span>
                                  </div>

                                  <table className="w-full text-left border-collapse text-xs mt-2">
                                    <thead>
                                      <tr className="border-b border-slate-100 text-[10px] text-slate-500 uppercase">
                                        <th className="py-1.5">Line / Lot</th>
                                        <th className="py-1.5 text-center">Status</th>
                                        <th className="py-1.5 text-right">Cargo Weight</th>
                                        <th className="py-1.5">Shipment Date</th>
                                        <th className="py-1.5">Sea Port ETA</th>
                                        <th className="py-1.5 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {poLots.length === 0 ? (
                                        <tr>
                                          <td colSpan={6} className="py-4 text-center text-slate-400 text-xs">
                                            No lots assigned to this PO yet. Assign lots by marking items Ready in the PO.
                                          </td>
                                        </tr>
                                      ) : (
                                        poLots.map((lot, idx) => (
                                        <tr key={`${lot.id || 'lot'}-${idx}`} className="hover:bg-slate-50/80">
                                          <td className="py-2">
                                            <span className="font-mono font-bold text-[11px] bg-slate-900 text-white px-2 py-0.5 rounded">
                                              {lot.lotNumber}
                                            </span>
                                          </td>
                                          <td className="py-2 text-center">
                                            {renderShipmentStatusBadge(lot.status)}
                                          </td>
                                          <td className="py-2 text-right font-mono font-bold text-blue-700">
                                            {formatWeight(lot.readyQty > 0 ? lot.readyQty : lot.orderedQty)}
                                          </td>
                                          <td className="py-2 text-slate-600">{formatDate(lot.dateOfShipment)}</td>
                                          <td className="py-2 font-semibold text-slate-800">{formatDate(lot.etaSeaport)}</td>
                                          <td className="py-2 text-right">
                                            {lot.status === 'In Transit' ? (
                                              !isViewer ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setReceivingPoLot({
                                                      po: lot.rawPo,
                                                      item: lot.rawItem,
                                                      lotNumber: lot.lotNumber,
                                                      port: lot.port,
                                                      grade: lot.gradeCode,
                                                      weight: lot.readyQty > 0 ? lot.readyQty : lot.orderedQty
                                                    });
                                                    setWarehouseLocation(lot.port.includes('Nhava') ? 'Nhava Sheva Yard' : 'Main Warehouse Yard');
                                                  }}
                                                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] ml-auto"
                                                >
                                                  Receive
                                                </button>
                                              ) : (
                                                <span className="text-[10px] text-slate-400 italic font-medium">In Transit</span>
                                              )
                                            ) : (
                                              <Link
                                                href={`/purchasing/purchase-orders/${lot.poNumber}`}
                                                className="text-blue-600 hover:underline font-semibold text-[11px]"
                                              >
                                                Details →
                                              </Link>
                                            )}
                                          </td>
                                        </tr>
                                      )))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inspect Item Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5 text-blue-600">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Ship className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Shipment Item: Lot {inspectingItem.lot_number}
                    </h2>
                    {renderShipmentStatusBadge(inspectingItem.status)}
                  </div>
                  <p className="text-xs text-slate-500">
                    {inspectingItem.supplier} • Port {inspectingItem.port || 'N.S.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setInspectingItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Shipment Status</span>
                <span className="font-bold text-slate-800">{inspectingItem.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Cargo Weight</span>
                <span className="font-mono font-bold text-blue-700 text-sm">{formatWeight(inspectingItem.weight)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Linked PO</span>
                <span className="font-bold text-blue-600">{inspectingItem.linked_po_number ? `PO ${inspectingItem.linked_po_number}` : 'Direct Cargo'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Port of Discharge</span>
                <span className="font-semibold text-slate-800">{inspectingItem.port || 'N.S.'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Date of Shipment</span>
                <span className="font-semibold text-slate-800">{formatDate(inspectingItem.date_of_shipment)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Vessel ETA</span>
                <span className="font-semibold text-slate-800">{formatDate(inspectingItem.eta_seaport)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Delivery Terms</span>
                <span className="font-semibold text-slate-800">{inspectingItem.delivery_terms || 'FOB'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Payment Terms</span>
                <span className="font-semibold text-slate-800">{inspectingItem.payment_terms || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Grade & Dimensions</span>
                <span className="font-bold text-slate-800">{inspectingItem.grade || '—'} {inspectingItem.dimensions ? `• ${inspectingItem.dimensions}` : ''}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Heat Number</span>
                <span className="font-mono font-bold text-slate-800">{inspectingItem.heat_no || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Container Number</span>
                <span className="font-mono font-bold text-amber-800">{inspectingItem.container_no || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Port of Loading (POL)</span>
                <span className="font-semibold text-slate-800">{inspectingItem.port_of_loading || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Customer</span>
                <span className="font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200 inline-block mt-0.5">{inspectingItem.customer || 'SE'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold">Pieces</span>
                <span className="font-bold font-mono text-slate-800">{inspectingItem.rawIncoming?.pieces || inspectingItem.rawItem?.pieces || 1} PCS</span>
              </div>
              {inspectingItem.sims && (
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold">SIMS Filing</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold inline-block mt-0.5 ${
                    inspectingItem.sims === 'Done'
                      ? 'bg-emerald-100 text-emerald-800'
                      : inspectingItem.sims === 'Not Required'
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-blue-100 text-blue-800 font-mono'
                  }`}>
                    {inspectingItem.sims}
                  </span>
                </div>
              )}
              {inspectingItem.make && (
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold">Make / Mill</span>
                  <span className="font-bold text-slate-800">{inspectingItem.make}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              {!isViewer && inspectingItem.status === 'In Transit' && (
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
              )}
              {inspectingItem.status === 'Ready' && inspectingItem.linked_po_number && (
                <Link
                  href={`/purchasing/purchase-orders/${inspectingItem.linked_po_number}`}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-sm"
                >
                  Ship Item →
                </Link>
              )}
              {inspectingItem.status === 'Pending' && inspectingItem.linked_po_number && (
                <Link
                  href={`/purchasing/purchase-orders/${inspectingItem.linked_po_number}`}
                  className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 rounded-lg shadow-2xs"
                >
                  Ready →
                </Link>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Receive Modal (Unified for Incoming Maritime Stock & PO Lots) */}
      {(receivingItem || receivingPoLot) && (() => {
        const activeRec = receivingItem ? {
          lotNumber: receivingItem.lot_number,
          grade: receivingItem.grade || 'Standard Steel',
          weight: receivingItem.weight,
          supplier: receivingItem.supplier,
          port: receivingItem.port || 'N.S.',
          poNumber: receivingItem.linked_po_number
        } : {
          lotNumber: receivingPoLot!.lotNumber,
          grade: receivingPoLot!.grade,
          weight: receivingPoLot!.weight,
          supplier: receivingPoLot!.po.supplier_name || 'Standard Supplier',
          port: receivingPoLot!.port || 'N.S.',
          poNumber: receivingPoLot!.po.po_number
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-600 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">
                      Confirm Port Arrival & Cargo Receipt
                    </h3>
                    <p className="text-xs text-slate-400">
                      Lot: {activeRec.lotNumber} • {activeRec.grade} • Port: {activeRec.port}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setReceivingItem(null);
                    setReceivingPoLot(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs text-slate-700 overflow-y-auto flex-1">
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
                        <span className="font-bold text-slate-900">{activeRec.grade}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-emerald-800 font-semibold">Cargo Weight:</span>
                        <span className="font-mono font-bold text-emerald-700 text-sm">{formatWeight(activeRec.weight)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-emerald-800 font-semibold">Supplier:</span>
                        <span className="text-slate-800 font-semibold">{activeRec.supplier}</span>
                      </div>
                      {activeRec.poNumber && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-emerald-800 font-semibold">Linked Purchase Order:</span>
                          <span className="font-bold text-blue-700">PO {activeRec.poNumber}</span>
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

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setReceivingItem(null);
                          setReceivingPoLot(null);
                        }}
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
        );
      })()}
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
