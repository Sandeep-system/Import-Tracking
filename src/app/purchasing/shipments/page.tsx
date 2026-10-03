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
import { formatDate, formatWeight, getEtaStatus, getStatusBadgeClass, cn } from '@/lib/utils';
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
  customer?: string | null;
  status: ShipmentStage;
  rawIncoming?: IncomingStockItem;
  rawPo?: PurchaseOrder;
  rawItem?: PurchaseOrderItem;
}

function ShipmentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dataVersion, setDataVersion] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
  const [selectedShipmentStatus, setSelectedShipmentStatus] = useState<string>('ALL');

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
    return dataStore.getPurchaseOrders().filter(p => !p.is_closed);
  }, [dataVersion]);

  // Unified Shipments synthesizing incoming stock and contract PO lots across 4 stages: Pending, Ready, In Transit, Received
  const allUnifiedShipments = useMemo(() => {
    const list: UnifiedShipmentItem[] = [];
    const matchedPoItemIds = new Set<string>();
    const matchedPoLotKeys = new Set<string>();

    // 1. Process all incomingStock items with an assigned lot number
    for (const inc of allIncoming) {
      if (!inc.lot_number || !inc.lot_number.trim()) continue;
      let matchedPo: PurchaseOrder | undefined;
      let matchedItem: PurchaseOrderItem | undefined;

      if (inc.linked_po_number) {
        matchedPo = activePOs.find(p => p.po_number === inc.linked_po_number || p.id === inc.linked_po_id);
        if (matchedPo && matchedPo.items) {
          matchedItem = matchedPo.items.find(pi => 
            (inc.lot_number && pi.lot_number?.trim() === inc.lot_number.trim()) ||
            inc.id.includes(pi.id)
          ) || matchedPo.items[0];
        }
      } else if (inc.lot_number) {
        for (const po of activePOs) {
          const pi = po.items?.find(item => item.lot_number?.trim() === inc.lot_number.trim());
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
        stage = 'In Transit';
      }

      list.push({
        id: inc.id,
        lot_number: inc.lot_number.trim(),
        linked_po_number: inc.linked_po_number || matchedPo?.po_number || null,
        supplier: inc.supplier || matchedPo?.supplier_name || 'Standard Supplier',
        make: inc.make || matchedPo?.origin || matchedPo?.origin_make_name || null,
        grade: inc.grade || matchedItem?.grade_code || 'Standard Grade',
        dimensions: [inc.dia_w ? `DIA ${inc.dia_w}` : '', inc.t ? `T${inc.t}` : '', inc.l ? `L${inc.l}` : ''].filter(Boolean).join(' × '),
        weight: Number(inc.weight) || Number(matchedItem?.ready_quantity ?? matchedItem?.received_quantity ?? matchedItem?.ordered_quantity ?? 0),
        port: inc.port || matchedItem?.destination_port || matchedPo?.destination || 'N.S.',
        date_of_shipment: inc.date_of_shipment || matchedItem?.date_of_shipment || null,
        eta_seaport: inc.eta_seaport || matchedItem?.eta_seaport || matchedPo?.expected_delivery_date || null,
        heat_no: inc.heat_no || matchedItem?.heat_no || null,
        sims: inc.sims || matchedItem?.sims || null,
        delivery_terms: inc.delivery_terms || matchedItem?.delivery_terms || matchedPo?.delivery_terms || 'FOB',
        payment_terms: inc.payment_terms || matchedItem?.payment_terms || matchedPo?.payment_terms || 'DP at sight',
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
        // Items will only go to the shipment after assigning lot no. from PO tab
        if (!item.lot_number || !item.lot_number.trim()) continue;
        const lotNo = item.lot_number.trim();
        if (matchedPoLotKeys.has(lotNo)) continue;
        if (matchedPoLotKeys.has(`${po.po_number}-${item.line_number}`)) continue;

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
          weight: Number(item.ready_quantity ?? item.received_quantity ?? item.ordered_quantity ?? 0),
          port: item.destination_port || po.destination || 'N.S.',
          date_of_shipment: item.date_of_shipment || null,
          eta_seaport: item.eta_seaport || po.expected_delivery_date || null,
          heat_no: item.heat_no || null,
          sims: item.sims || null,
          delivery_terms: item.delivery_terms || po.delivery_terms || 'FOB',
          payment_terms: item.payment_terms || po.payment_terms || 'DP at sight',
          customer: po.customer_name || null,
          status: stage,
          rawPo: po,
          rawItem: item
        });
      }
    }

    return list;
  }, [allIncoming, activePOs]);

  // Counts across all 4 shipment stages
  const statusCounts = useMemo(() => {
    let pending = 0;
    let ready = 0;
    let inTransit = 0;
    let received = 0;
    for (const s of allUnifiedShipments) {
      if (s.status === 'Pending') pending++;
      else if (s.status === 'Ready') ready++;
      else if (s.status === 'In Transit') inTransit++;
      else if (s.status === 'Received') received++;
    }
    return { pending, ready, inTransit, received, total: allUnifiedShipments.length };
  }, [allUnifiedShipments]);

  // Filtered shipments based on status, port, supplier, terms, search
  const filteredShipments = useMemo(() => {
    return allUnifiedShipments.filter(item => {
      // Status filter
      if (selectedShipmentStatus !== 'ALL' && item.status.toUpperCase() !== selectedShipmentStatus.toUpperCase()) {
        return false;
      }
      // Port filter
      if (selectedPort !== 'ALL' && (item.port || '').toLowerCase() !== selectedPort.toLowerCase()) {
        return false;
      }
      // Supplier filter
      if (selectedSupplier !== 'ALL' && (item.supplier || '').toLowerCase() !== selectedSupplier.toLowerCase()) {
        return false;
      }
      // Delivery terms filter
      if (selectedTerms !== 'ALL' && (item.delivery_terms || '').toUpperCase() !== selectedTerms.toUpperCase()) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchLot = item.lot_number.toLowerCase().includes(q);
        const matchPo = (item.linked_po_number || '').toLowerCase().includes(q);
        const matchSupplier = item.supplier.toLowerCase().includes(q);
        const matchPort = (item.port || '').toLowerCase().includes(q);
        const matchStatus = item.status.toLowerCase().includes(q);
        if (!matchLot && !matchPo && !matchSupplier && !matchPort && !matchStatus) {
          return false;
        }
      }
      return true;
    });
  }, [allUnifiedShipments, selectedShipmentStatus, selectedPort, selectedSupplier, selectedTerms, search]);

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
      rawItem: PurchaseOrderItem;
      rawPo: PurchaseOrder;
    }> = [];

    for (const po of activePOs) {
      if (!po.items || po.items.length === 0) continue;
      for (const item of po.items) {
        // Items will only go to shipment after assigning lot no. from PO tab
        if (!item.lot_number || !item.lot_number.trim()) continue;

        const dimStr = [
          item.diameter_width ? `DIA ${item.diameter_width}` : '',
          item.thickness ? `T${item.thickness}` : '',
          item.length ? `L${item.length}` : ''
        ].filter(Boolean).join(' × ');

        const lotNo = item.lot_number.trim();

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
          readyQty: Number(item.ready_quantity ?? item.received_quantity ?? 0),
          status: item.status || 'Open',
          dateOfShipment: item.date_of_shipment,
          etaSeaport: item.eta_seaport || po.expected_delivery_date,
          heatNo: item.heat_no,
          sims: item.sims,
          port: item.destination_port || po.destination || 'N.S.',
          deliveryTerms: item.delivery_terms || po.delivery_terms || 'FOB',
          paymentTerms: item.payment_terms || po.payment_terms || 'DP at sight',
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
        'Date of Shipment': l.dateOfShipment || '—',
        'Sea Port ETA': l.etaSeaport || '—',
        'Discharge Port': l.port,
        'Delivery Terms': l.deliveryTerms,
        'Payment Terms': l.paymentTerms
      }));
      const ws = XLSX.utils.json_to_sheet(lotRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PO Lots Shipment Status');
      XLSX.writeFile(wb, `PO_Lots_Shipment_Status_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const exportRows = filteredShipments.map(i => ({
        'Lot Number': i.lot_number,
        'Linked PO': i.linked_po_number ? `PO ${i.linked_po_number}` : 'Direct Cargo',
        'Make / Mill': i.make || 'Standard',
        'Supplier': i.supplier,
        'Shipment Status': i.status,
        'Weight (KG)': i.weight,
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
              <span>Shipments</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-extrabold">
                {allUnifiedShipments.length}
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
                const count = st === 'ALL' ? allUnifiedShipments.length :
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
                  <option value="ALL">All Statuses ({allUnifiedShipments.length})</option>
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

                {(search || selectedShipmentStatus !== 'ALL' || selectedPort !== 'ALL' || selectedSupplier !== 'ALL' || selectedTerms !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setSelectedShipmentStatus('ALL');
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
                Showing <strong className="text-slate-900">{filteredShipments.length}</strong> shipment items
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
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-right">Weight (KG)</th>
                    <th className="table-header">Discharge Port</th>
                    <th className="table-header">Shipment Date</th>
                    <th className="table-header">Port ETA & Countdown</th>
                    <th className="table-header">Terms</th>
                    <th className="table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Ship className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">No shipments matching your filters.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Try resetting filters or adjusting search criteria.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.map((item) => {
                      const etaInfo = getEtaStatus(item.eta_seaport);

                      return (
                        <tr 
                          key={item.id}
                          onClick={() => setInspectingItem(item)}
                          className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                        >
                          <td className="table-cell">
                            <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded shadow-2xs">
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
                          <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                            {renderShipmentStatusBadge(item.status)}
                          </td>
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
                            {item.eta_seaport ? (
                              <div className="space-y-0.5">
                                <span className="font-semibold text-slate-800 block">{formatDate(item.eta_seaport)}</span>
                                <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] border ${etaInfo.color}`}>
                                  {etaInfo.text}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="table-cell">
                            <span className="font-semibold text-slate-800 block">{item.delivery_terms || 'FOB'}</span>
                            {item.payment_terms && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-[100px]">{item.payment_terms}</span>
                            )}
                          </td>
                          <td className="table-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {item.status === 'In Transit' && (
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
                            )}
                            {item.status === 'Ready' && (
                              <Link
                                href={item.linked_po_number ? `/purchasing/purchase-orders/${item.linked_po_number}` : `/purchasing/purchase-orders`}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-sm transition-colors inline-flex items-center gap-1 ml-auto"
                                title="Open PO to record shipment details"
                              >
                                <Ship className="h-3.5 w-3.5" />
                                <span>Ship Item →</span>
                              </Link>
                            )}
                            {item.status === 'Pending' && (
                              <Link
                                href={item.linked_po_number ? `/purchasing/purchase-orders/${item.linked_po_number}` : `/purchasing/purchase-orders`}
                                className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 font-bold text-[11px] shadow-2xs transition-colors inline-flex items-center gap-1 ml-auto"
                                title="Open PO to mark item ready"
                              >
                                <PackagePlus className="h-3.5 w-3.5" />
                                <span>Ready →</span>
                              </Link>
                            )}
                            {item.status === 'Received' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Received ✓
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
                    filteredShipments.map((item) => {
                      const etaInfo = getEtaStatus(item.eta_seaport);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                            {item.status === 'In Transit' && (
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

        {/* TAB 3: PO CONTRACTS & LOT-WISE SHIPMENT STATUS */}
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
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
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
                      filteredPoLots.map((lot) => {
                        const etaInfo = getEtaStatus(lot.etaSeaport);

                        return (
                          <tr key={lot.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="table-cell">
                              <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded shadow-2xs">
                                {lot.lotNumber}
                              </span>
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
                              <span className="text-[10px] text-slate-500 block mt-0.5">{lot.deliveryTerms}</span>
                            </td>
                            <td className="table-cell text-right whitespace-nowrap">
                              {lot.status === 'In Transit' && (
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
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
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
                    {activePOs.map((po) => {
                      const isExpanded = expandedPoIds.includes(po.id);
                      const poLots = allPoLots.filter(l => l.poId === po.id || l.poNumber === po.po_number);
                      const inTransitLots = poLots.filter(l => l.status === 'In Transit');
                      const readyLots = poLots.filter(l => l.status === 'Ready to Ship');
                      const openLots = poLots.filter(l => l.status === 'Open');
                      const receivedLots = poLots.filter(l => l.status === 'Received');

                      return (
                        <React.Fragment key={po.id}>
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
                                        poLots.map(lot => (
                                        <tr key={lot.id} className="hover:bg-slate-50/80">
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
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
              {inspectingItem.status === 'In Transit' && (
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

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
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
