import { 
  PurchaseOrder, 
  PurchaseOrderItem, 
  Receipt, 
  Lot, 
  Supplier, 
  Customer, 
  InventoryTransaction, 
  AuditLog, 
  CustomerAllocation, 
  Sale,
  MigrationSummary,
  BalanceResolution,
  ResolutionType,
  ResolutionStatus,
  IncomingStockItem,
  DataState
} from '@/types';
import initialDataRaw from './initialData.json';
import incomingStockRaw from './incomingStockData.json';
import { supabaseSync } from './supabaseSync';
import { canonicalSupplierKey } from './utils';

const STORAGE_KEY = 'IMPORT_TRACKING_SYSTEM_DATA_V9';
const PREV_STORAGE_KEY = 'IMPORT_TRACKING_SYSTEM_DATA_V8';

export function normalizeIncomingStockItem(raw: any, defaultSource: string = 'INCOMING SE'): IncomingStockItem {
  if (!raw) return raw;
  const grade = String(raw.grade || raw.grade_code || '').trim();
  const gradeCode = String(raw.grade_code || raw.grade || grade).trim();
  const supplier = String(raw.supplier || raw.supplier_name || '').trim();
  const supplierName = String(raw.supplier_name || raw.supplier || supplier).trim();
  const diaW = raw.dia_w !== undefined && raw.dia_w !== null ? raw.dia_w : (raw.width_diameter !== undefined && raw.width_diameter !== null ? raw.width_diameter : null);
  const widthDiameter = raw.width_diameter !== undefined && raw.width_diameter !== null ? raw.width_diameter : diaW;
  const t = raw.t !== undefined && raw.t !== null ? raw.t : (raw.thickness !== undefined && raw.thickness !== null ? raw.thickness : null);
  const thickness = raw.thickness !== undefined && raw.thickness !== null ? raw.thickness : t;
  const l = raw.l !== undefined && raw.l !== null ? raw.l : (raw.length !== undefined && raw.length !== null ? raw.length : null);
  const length = raw.length !== undefined && raw.length !== null ? raw.length : l;
  const heat = raw.heat_no || raw.heat_number || null;

  return {
    ...raw,
    grade,
    grade_code: gradeCode,
    supplier,
    supplier_name: supplierName,
    dia_w: diaW,
    width_diameter: widthDiameter,
    t,
    thickness,
    l,
    length,
    heat_no: heat,
    heat_number: heat,
    source_sheet: raw.source_sheet || defaultSource
  };
}

function getInitialState(): DataState {
  const rawSuppliers = (initialDataRaw.suppliers || []) as unknown as Supplier[];
  const seenSup = new Set<string>();
  const defaultSuppliers: Supplier[] = [];
  for (const s of rawSuppliers) {
    if (!s || !s.supplier_name) continue;
    const key = canonicalSupplierKey(s.supplier_name) || (s.id || s.supplier_name).trim().toLowerCase();
    if (!seenSup.has(key)) {
      seenSup.add(key);
      defaultSuppliers.push(s);
    }
  }

  const rawPOs = (initialDataRaw.purchaseOrders || []) as unknown as PurchaseOrder[];
  const seenPO = new Set<string>();
  const defaultPOs: PurchaseOrder[] = [];
  for (const po of rawPOs) {
    if (!po) continue;
    const key = po.id || po.po_number;
    if (!seenPO.has(key)) {
      seenPO.add(key);
      defaultPOs.push(po);
    }
  }
  const defaultLots: Lot[] = (initialDataRaw.lots || []) as unknown as Lot[];
  const defaultReceipts: Receipt[] = (initialDataRaw.receipts || []) as unknown as Receipt[];

  const defaultCustomers: Customer[] = [
    { id: 'cust-1', customer_code: 'SE', customer_name: 'Sandeep Edgetech (Self)', contact_person: 'Head Office / Self', phone: '+91 98200 11111', status: 'active' },
    { id: 'cust-2', customer_code: 'BM', customer_name: 'BM Trading Division', contact_person: 'Procurement Lead', phone: '+91 98200 22222', status: 'active' },
    { id: 'cust-3', customer_code: 'CUST-003', customer_name: 'Omkara Steels Pvt Ltd', contact_person: 'Mr. Sharma', phone: '+91 98200 33333', status: 'active' },
  ];

  const defaultIncomingTransit = (incomingStockRaw.inTransit || []) as unknown as IncomingStockItem[];
  const defaultIncomingReceived = (incomingStockRaw.received || []) as unknown as IncomingStockItem[];
  const initMap = new Map<string, IncomingStockItem>();
  for (const item of [...defaultIncomingTransit, ...defaultIncomingReceived]) {
    const key = item.id || `inc-${Math.random()}`;
    if (!initMap.has(key)) {
      initMap.set(key, normalizeIncomingStockItem(item));
    }
  }
  const defaultIncomingStock = Array.from(initMap.values());

  const defaultAuditLogs: AuditLog[] = [
    {
      id: 'log-ingest-2',
      action: 'SYSTEM_INGEST',
      entity_type: 'SYSTEM',
      entity_id: 'excel-ingest',
      entity_display: 'Import Tracking System',
      remarks: 'Ingested 27 active POs, 373 closed POs, 7,725 receipts, and 128 in-transit stock items (updated 2026-10-19).',
      created_at: new Date().toISOString()
    }
  ];

  return {
    purchaseOrders: defaultPOs,
    suppliers: defaultSuppliers,
    customers: defaultCustomers,
    lots: defaultLots,
    receipts: defaultReceipts,
    inventoryTransactions: [],
    customerAllocations: [],
    sales: [],
    auditLogs: defaultAuditLogs,
    balanceResolutions: [],
    incomingStock: defaultIncomingStock
  };
}

class Store {
  private state: DataState;
  private deletedPoIds: Set<string> = new Set();
  private deletedReceiptIds: Set<string> = new Set();

  constructor() {
    this.state = getInitialState();

    if (typeof window !== 'undefined') {
      // Purge legacy browser localStorage keys to prevent old caches from polluting the server database
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PREV_STORAGE_KEY);
        localStorage.removeItem('sandeep_user_pos');
        localStorage.removeItem('sandeep_user_receipts');
      } catch (e) {}

      // Link incoming stock to purchase orders on initial state
      this.linkIncomingStockWithPOs();
      for (const po of this.state.purchaseOrders) {
        this.recomputePOAggregates(po);
      }

      // Initialize Cloud Database Synchronization (authoritative server database)
      supabaseSync.init((remoteData) => {
        this.mergeRemoteState(remoteData);
      });
    }
  }

  public getDeletedPoIds(): string[] {
    return Array.from(this.deletedPoIds);
  }

  public getDeletedReceiptIds(): string[] {
    return Array.from(this.deletedReceiptIds);
  }

  public mergeRemoteState(remote: any) {
    if (!remote) return;
    try {
      const baselineIds = new Set((initialDataRaw.purchaseOrders || []).map((p: any) => p.id));

      // 1. Process deleted POs
      if (Array.isArray(remote.deletedPoIds)) {
        for (const id of remote.deletedPoIds) {
          this.deletedPoIds.add(id);
        }
        this.state.purchaseOrders = this.state.purchaseOrders.filter(
          p => !this.deletedPoIds.has(p.id) && !this.deletedPoIds.has(p.po_number)
        );
      }

      // 2. Process deleted Receipts
      if (Array.isArray(remote.deletedReceiptIds)) {
        for (const id of remote.deletedReceiptIds) {
          this.deletedReceiptIds.add(id);
        }
        this.state.receipts = this.state.receipts.filter(r => !this.deletedReceiptIds.has(r.id));
      }

      // 3. Purchase Orders
      if (Array.isArray(remote.purchaseOrders) || Array.isArray(remote.userPurchaseOrders)) {
        const rawPos: PurchaseOrder[] = Array.isArray(remote.purchaseOrders) 
          ? remote.purchaseOrders 
          : (Array.isArray(remote.userPurchaseOrders) ? remote.userPurchaseOrders : []);
        const poMap = new Map<string, PurchaseOrder>();
        for (const basePo of (initialDataRaw.purchaseOrders || [])) {
          if (!this.deletedPoIds.has(basePo.id) && !this.deletedPoIds.has(basePo.po_number)) {
            poMap.set(basePo.id || `po-${basePo.po_number}`, basePo as unknown as PurchaseOrder);
          }
        }
        for (const po of rawPos) {
          if (!this.deletedPoIds.has(po.id) && !this.deletedPoIds.has(po.po_number)) {
            poMap.set(po.id || `po-${po.po_number}`, po);
          }
        }
        this.state.purchaseOrders = Array.from(poMap.values());
      }

      // 4. Receipts
      if (Array.isArray(remote.receipts) || Array.isArray(remote.userReceipts)) {
        const rawReceipts: Receipt[] = Array.isArray(remote.receipts) 
          ? remote.receipts 
          : (Array.isArray(remote.userReceipts) ? remote.userReceipts : []);
        const rcMap = new Map<string, Receipt>();
        for (const baseRc of (initialDataRaw.receipts || [])) {
          if (!this.deletedReceiptIds.has(baseRc.id)) {
            rcMap.set(baseRc.id, baseRc as unknown as Receipt);
          }
        }
        for (const rc of rawReceipts) {
          if (!this.deletedReceiptIds.has(rc.id)) {
            rcMap.set(rc.id, rc);
          }
        }
        this.state.receipts = Array.from(rcMap.values());
      }

      // 6. Process inventory transactions
      if (Array.isArray(remote.inventoryTransactions) && remote.inventoryTransactions.length > 0) {
        const txMap = new Map(this.state.inventoryTransactions.map(t => [t.id, t]));
        for (const tx of remote.inventoryTransactions) {
          txMap.set(tx.id, tx);
        }
        this.state.inventoryTransactions = Array.from(txMap.values());
      }

      // 7. Process lots, suppliers, customers
      if (Array.isArray(remote.lots) && remote.lots.length > 0) {
        const lotMap = new Map(this.state.lots.map(l => [l.id, l]));
        for (const rLot of remote.lots) {
          lotMap.set(rLot.id, rLot);
        }
        this.state.lots = Array.from(lotMap.values());
      }
      if (Array.isArray(remote.suppliers) && remote.suppliers.length > 0) {
        const seenSup = new Set<string>();
        const uniqueSup: Supplier[] = [];
        for (const s of remote.suppliers) {
          if (!s || !s.supplier_name) continue;
          const key = canonicalSupplierKey(s.supplier_name) || (s.id || s.supplier_name).trim().toLowerCase();
          if (!seenSup.has(key)) {
            seenSup.add(key);
            uniqueSup.push(s);
          }
        }
        this.state.suppliers = uniqueSup;
      }
      if (Array.isArray(remote.customers) && remote.customers.length > 0) {
        this.state.customers = remote.customers;
      }
      if (Array.isArray(remote.incomingStock) && remote.incomingStock.length > 0) {
        const incMap = new Map<string, IncomingStockItem>();
        for (const i of (this.state.incomingStock || [])) {
          if (i.id) incMap.set(i.id, i);
        }
        for (const savedInc of remote.incomingStock) {
          if (savedInc.id) {
            const existing = incMap.get(savedInc.id);
            const merged = existing ? { ...existing, ...savedInc } : savedInc;
            incMap.set(savedInc.id, normalizeIncomingStockItem(merged));
          }
        }
        this.state.incomingStock = Array.from(incMap.values());
      }

      // Ensure customer "SE" is always Sandeep Edgetech (Self)
      const seCust = this.state.customers?.find(c => 
        c.id === 'cust-1' || 
        c.customer_code === 'SE' || 
        c.customer_code === 'CUST-001' || 
        c.customer_name?.includes('Special Enterprises') ||
        c.customer_name?.includes('SE')
      );
      if (seCust) {
        seCust.customer_name = 'Sandeep Edgetech (Self)';
        seCust.customer_code = 'SE';
        seCust.contact_person = 'Head Office / Self';
      }

      this.linkIncomingStockWithPOs();
      for (const po of this.state.purchaseOrders) {
        this.recomputePOAggregates(po);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:data-updated'));
      }
    } catch (err) {
      console.warn('Failed to merge remote cloud database state:', err);
    }
  }

  public async pushToCloud() {
    return supabaseSync.pushAll(this.state, {
      deletedPoIds: Array.from(this.deletedPoIds),
      deletedReceiptIds: Array.from(this.deletedReceiptIds)
    });
  }

  public getOperationalPurchaseOrders(): PurchaseOrder[] {
    return this.state.purchaseOrders.filter(
      p => !p.is_closed || Number(p.po_number) >= 1093 || isNaN(Number(p.po_number)) || p.id.startsWith('po-')
    );
  }

  public getUserPurchaseOrders(): PurchaseOrder[] {
    const baselineIds = new Set((initialDataRaw.purchaseOrders || []).map((p: any) => p.id));
    return this.state.purchaseOrders.filter(p => !baselineIds.has(p.id));
  }

  public save(options: { skipAutoSync?: boolean } = {}) {
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('app:data-updated'));
        if (!options.skipAutoSync) {
          supabaseSync.queueSync(this.state, {
            deletedPoIds: Array.from(this.deletedPoIds),
            deletedReceiptIds: Array.from(this.deletedReceiptIds)
          });
        }
      } catch (err) {
        console.error('Error dispatching update event:', err);
      }
    }
  }

  public resetToDefault() {
    this.state = getInitialState();
    this.save({ skipAutoSync: true });
    return this.state;
  }

  // --- Purchase Orders ---
  public getPurchaseOrders(filter?: { status?: string; supplier?: string; search?: string; overdueOnly?: boolean }) {
    // Ensure all POs in state are strictly deduplicated by both ID and PO number
    const seenIds = new Set<string>();
    const seenPoNumbers = new Set<string>();
    const uniquePOs: PurchaseOrder[] = [];

    for (const po of this.state.purchaseOrders) {
      const idKey = po.id || `po-${po.po_number}`;
      const numKey = po.po_number ? String(po.po_number).trim() : '';

      if (seenIds.has(idKey) || (numKey && seenPoNumbers.has(numKey))) {
        continue;
      }
      seenIds.add(idKey);
      if (numKey) seenPoNumbers.add(numKey);
      uniquePOs.push(po);
    }
    this.state.purchaseOrders = uniquePOs;
    let list = [...uniquePOs];
    if (filter) {
      if (filter.status && filter.status !== 'all') {
        list = list.filter(po => po.status.toLowerCase() === filter.status?.toLowerCase());
      }
      if (filter.supplier && filter.supplier !== 'all') {
        const supKey = filter.supplier.toLowerCase().trim();
        const exactMatches = list.filter(po => {
          const poSup = (po.supplier_name || '').toLowerCase().trim();
          const poSupId = (po.supplier_id || '').toLowerCase().trim();
          return poSup === supKey || poSupId === supKey;
        });

        if (exactMatches.length > 0) {
          list = exactMatches;
        } else {
          list = list.filter(po => {
            const poSup = (po.supplier_name || '').toLowerCase().trim();
            return poSup.includes(supKey);
          });
        }
      }
      if (filter.overdueOnly) {
        list = list.filter(po => po.is_overdue);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(po => 
          po.po_number.toLowerCase().includes(q) ||
          po.supplier_name?.toLowerCase().includes(q) ||
          po.destination?.toLowerCase().includes(q) ||
          po.oc_number?.toLowerCase().includes(q) ||
          po.items?.some(i => i.grade_code.toLowerCase().includes(q))
        );
      }
    }
    return list;
  }

  public getPurchaseOrderById(id: string): PurchaseOrder | undefined {
    return this.state.purchaseOrders.find(po => po.id === id || po.po_number === id);
  }

  public getNextPONumber(): string {
    const pos = this.state.purchaseOrders || [];
    let max = 1000;
    for (const po of pos) {
      const clean = (po.po_number || '').replace(/[^0-9]/g, '');
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num > max) {
        max = num;
      }
    }
    return String(max + 1);
  }

  public createPurchaseOrder(po: Omit<Partial<PurchaseOrder>, 'items'> & { items: Partial<PurchaseOrderItem>[] }): PurchaseOrder {
    const id = `po-${po.po_number}`;
    const newItems: PurchaseOrderItem[] = (po.items || []).map((item, idx) => ({
      id: `item-${po.po_number}-${idx + 1}`,
      purchase_order_id: id,
      po_number: po.po_number!,
      line_number: idx + 1,
      grade_code: item.grade_code || '1.2311',
      grade_doc: item.grade_doc,
      section_name: item.section_name || 'Plate',
      diameter_width: item.diameter_width,
      thickness: item.thickness,
      length: item.length,
      treatment: item.treatment || 'Annealed',
      condition_name: item.condition_name || 'BLACK ROLLED',
      lot_number: item.lot_number || null,
      container_no: item.container_no || null,
      port_of_loading: item.port_of_loading || null,
      ordered_quantity: Number(item.ordered_quantity) || 0,
      received_quantity: 0,
      balance_quantity: Number(item.ordered_quantity) || 0,
      unit: item.unit || 'KG',
      purchase_price: Number(item.purchase_price) || 0,
      currency: po.currency || 'USD',
      status: 'Open',
      receipt_count: 0,
      receipts: []
    }));

    const totalOrd = newItems.reduce((acc, i) => acc + i.ordered_quantity, 0);
    const totalVal = newItems.reduce((acc, i) => acc + (i.ordered_quantity * i.purchase_price), 0);

    const newPO: PurchaseOrder = {
      id,
      po_number: po.po_number!,
      order_date: po.order_date || new Date().toISOString().split('T')[0],
      supplier_id: po.supplier_id || 'sup-1',
      supplier_name: po.supplier_name || 'Selected Supplier',
      customer_id: po.customer_id || null,
      customer_name: po.customer_name || null,
      reference: po.reference || po.reference_person || null,
      reference_person: po.reference_person || po.reference || null,
      origin: po.origin || po.origin_make_name || null,
      origin_make_name: po.origin_make_name || po.origin || null,
      commission: po.commission || null,
      currency: po.currency || 'USD',
      payment_terms: po.payment_terms || 'DP at sight',
      delivery_terms: po.delivery_terms || 'FOB',
      destination: po.destination || 'N.S.',
      oc_number: po.oc_number,
      oc_date: po.oc_date,
      expected_delivery_date: po.expected_delivery_date,
      remarks: po.remarks,
      status: 'Open',
      is_closed: false,
      total_items: newItems.length,
      total_ordered_qty: totalOrd,
      total_received_qty: 0,
      total_balance_qty: totalOrd,
      total_order_value: totalVal,
      total_pending_value: totalVal,
      is_overdue: false,
      days_overdue: 0,
      items: newItems,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Register lots for any items with assigned lot number
    for (const item of newItems) {
      if (item.lot_number && item.lot_number.trim()) {
        const lotNo = item.lot_number.trim();
        let lot = this.state.lots.find(l => l.lot_number.toLowerCase() === lotNo.toLowerCase());
        if (!lot) {
          lot = {
            id: `lot-${lotNo}`,
            lot_number: lotNo,
            purchase_order_item_id: item.id,
            po_number: newPO.po_number,
            supplier_name: newPO.supplier_name,
            grade_code: item.grade_code,
            section_name: item.section_name,
            dimensions_display: [
              item.diameter_width ? `DIA ${item.diameter_width}` : '',
              item.thickness ? `T${item.thickness}` : '',
              item.length ? `L${item.length}` : ''
            ].filter(Boolean).join(' × ') || 'Standard Spec',
            total_received_qty: 0,
            total_allocated_sold_qty: 0,
            available_qty: 0,
            warehouse_location: 'Nhava Sheva Yard',
            status: 'Available',
            created_at: new Date().toISOString()
          };
          this.state.lots.unshift(lot);
        }
      }
    }

    this.deletedPoIds.delete(newPO.id);
    this.deletedPoIds.delete(newPO.po_number);
    this.state.purchaseOrders = this.state.purchaseOrders.filter(
      p => p.id !== newPO.id && p.po_number !== newPO.po_number
    );
    this.state.purchaseOrders.unshift(newPO);
    this.addAuditLog('PO_CREATE', 'purchase_orders', newPO.id, `Created PO ${newPO.po_number}`);
    this.save();
    return newPO;
  }

  public updatePurchaseOrder(idOrPoNumber: string, updates: Partial<PurchaseOrder>): PurchaseOrder {
    const po = this.state.purchaseOrders.find(
      p => p.id === idOrPoNumber || p.po_number === idOrPoNumber
    );
    if (!po) throw new Error(`Purchase order ${idOrPoNumber} not found`);

    if (updates.supplier_name !== undefined) po.supplier_name = updates.supplier_name;
    if (updates.customer_name !== undefined) po.customer_name = updates.customer_name;
    if (updates.customer_id !== undefined) po.customer_id = updates.customer_id;
    if (updates.reference !== undefined) po.reference = updates.reference;
    if (updates.reference_person !== undefined) po.reference_person = updates.reference_person;
    if (updates.origin !== undefined) po.origin = updates.origin;
    if (updates.origin_make_name !== undefined) po.origin_make_name = updates.origin_make_name;
    if (updates.commission !== undefined) po.commission = updates.commission;
    if (updates.order_date !== undefined) po.order_date = updates.order_date;
    if (updates.currency !== undefined) po.currency = updates.currency;
    if (updates.destination !== undefined) po.destination = updates.destination;
    if (updates.delivery_terms !== undefined) po.delivery_terms = updates.delivery_terms;
    if (updates.payment_terms !== undefined) po.payment_terms = updates.payment_terms;
    if (updates.oc_number !== undefined) po.oc_number = updates.oc_number;
    if (updates.oc_date !== undefined) po.oc_date = updates.oc_date;
    if (updates.contract_delivery_date !== undefined) po.contract_delivery_date = updates.contract_delivery_date;
    if (updates.expected_delivery_date !== undefined) po.expected_delivery_date = updates.expected_delivery_date;
    if (updates.remarks !== undefined) po.remarks = updates.remarks;
    if (updates.status !== undefined) po.status = updates.status;

    // Recalculate totals if currency changed
    if (po.items && po.items.length > 0) {
      for (const item of po.items) {
        if (updates.currency) item.currency = updates.currency;
      }
      po.total_order_value = po.items.reduce((acc, i) => acc + ((i.ordered_quantity || 0) * (i.purchase_price || 0)), 0);
      po.total_pending_value = po.items.reduce((acc, i) => acc + ((i.balance_quantity || 0) * (i.purchase_price || 0)), 0);
    }

    po.updated_at = new Date().toISOString();

    this.addAuditLog(
      'PO_UPDATE',
      'purchase_orders',
      po.id,
      `Updated PO details for PO ${po.po_number} (Supplier: ${po.supplier_name}, O/C: ${po.oc_number || 'N/A'})`
    );

    this.save();
    return po;
  }

  public deletePurchaseOrder(idOrPoNumber: string): boolean {
    const poIndex = this.state.purchaseOrders.findIndex(
      p => p.id === idOrPoNumber || p.po_number === idOrPoNumber
    );
    if (poIndex === -1) return false;

    const po = this.state.purchaseOrders[poIndex];
    const poNumber = po.po_number;

    // Collect receipt IDs for this PO
    const poReceiptIds = this.state.receipts
      .filter(r => r.po_number === poNumber)
      .map(r => r.id);

    // Remove associated receipts
    this.state.receipts = this.state.receipts.filter(r => r.po_number !== poNumber);

    // Remove associated inventory transactions
    this.state.inventoryTransactions = this.state.inventoryTransactions.filter(
      tx => !poReceiptIds.includes(tx.reference_id || '')
    );

    // Remove the PO
    this.deletedPoIds.add(po.id);
    this.deletedPoIds.add(poNumber);
    this.state.purchaseOrders.splice(poIndex, 1);

    // Add audit log
    this.addAuditLog(
      'PO_DELETE',
      'purchase_orders',
      po.id,
      `Deleted Purchase Order PO ${poNumber} (${po.supplier_name}) and cleaned associated records.`
    );

    this.save();
    return true;
  }

  public addPurchaseOrderItem(poIdOrNumber: string, itemData: Partial<PurchaseOrderItem>): PurchaseOrderItem {
    const po = this.state.purchaseOrders.find(
      p => p.id === poIdOrNumber || p.po_number === poIdOrNumber
    );
    if (!po) throw new Error(`Purchase Order ${poIdOrNumber} not found`);

    if (!po.items) po.items = [];
    const lineNum = po.items.length + 1;
    const ordQty = Number(itemData.ordered_quantity) || 0;
    const price = Number(itemData.purchase_price) || 0;
    const orderVal = ordQty * price;

    const newItem: PurchaseOrderItem = {
      id: `item-${po.po_number}-${lineNum}-${Date.now()}`,
      purchase_order_id: po.id,
      po_number: po.po_number,
      line_number: lineNum,
      grade_code: itemData.grade_code || '1.2311',
      grade_doc: itemData.grade_doc || null,
      section_name: itemData.section_name || 'Plate',
      diameter_width: itemData.diameter_width || null,
      thickness: itemData.thickness || null,
      length: itemData.length || null,
      treatment: itemData.treatment || 'Annealed',
      condition_name: itemData.condition_name || 'BLACK ROLLED',
      lot_number: itemData.lot_number || null,
      ordered_quantity: ordQty,
      received_quantity: 0,
      balance_quantity: ordQty,
      unit: itemData.unit || 'KG',
      purchase_price: price,
      currency: itemData.currency || po.currency || 'USD',
      expected_delivery_date: itemData.expected_delivery_date || po.expected_delivery_date || null,
      status: 'Open',
      receipt_count: 0,
      is_overdue: false,
      days_overdue: 0,
      receipts: []
    };

    po.items.push(newItem);
    this.recomputePOAggregates(po);

    this.addAuditLog(
      'PO_ITEM_ADD',
      'purchase_order_items',
      newItem.id,
      `Added item #${lineNum} (${newItem.grade_code} ${newItem.section_name}, ${newItem.ordered_quantity} KG) to PO ${po.po_number}`
    );
    this.save();
    return newItem;
  }

  public updatePurchaseOrderItem(
    poIdOrNumber: string,
    itemId: string,
    updates: Partial<PurchaseOrderItem>
  ): PurchaseOrderItem {
    const po = this.state.purchaseOrders.find(
      p => p.id === poIdOrNumber || p.po_number === poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${poIdOrNumber} not found`);
    if (!po.items) po.items = [];

    const item = po.items.find(i => i.id === itemId);
    if (!item) throw new Error(`PO Line Item ${itemId} not found in PO ${po.po_number}`);

    if (updates.grade_code !== undefined) item.grade_code = String(updates.grade_code).trim();
    if (updates.grade_doc !== undefined) item.grade_doc = updates.grade_doc ? String(updates.grade_doc).trim() : null;
    if (updates.section_name !== undefined) item.section_name = String(updates.section_name).trim();
    if (updates.diameter_width !== undefined) item.diameter_width = updates.diameter_width !== null && updates.diameter_width !== ('' as any) ? Number(updates.diameter_width) : null;
    if (updates.thickness !== undefined) item.thickness = updates.thickness !== null && updates.thickness !== ('' as any) ? Number(updates.thickness) : null;
    if (updates.length !== undefined) item.length = updates.length !== null && updates.length !== ('' as any) ? Number(updates.length) : null;
    if (updates.treatment !== undefined) item.treatment = updates.treatment ? String(updates.treatment).trim() : null;
    if (updates.condition_name !== undefined) item.condition_name = updates.condition_name ? String(updates.condition_name).trim() : null;
    if (updates.ordered_quantity !== undefined) item.ordered_quantity = Number(updates.ordered_quantity) || 0;
    if (updates.purchase_price !== undefined) item.purchase_price = Number(updates.purchase_price) || 0;
    if (updates.currency !== undefined) item.currency = updates.currency;
    if (updates.lot_number !== undefined) item.lot_number = updates.lot_number ? String(updates.lot_number).trim() : null;
    if (updates.container_no !== undefined) item.container_no = updates.container_no ? String(updates.container_no).trim() : null;
    if (updates.port_of_loading !== undefined) item.port_of_loading = updates.port_of_loading ? String(updates.port_of_loading).trim() : null;
    if (updates.destination_port !== undefined) item.destination_port = updates.destination_port ? String(updates.destination_port).trim() : null;
    if (updates.delivery_terms !== undefined) item.delivery_terms = updates.delivery_terms;
    if (updates.payment_terms !== undefined) item.payment_terms = updates.payment_terms;
    if (updates.heat_no !== undefined) item.heat_no = updates.heat_no ? String(updates.heat_no).trim() : null;
    if (updates.sims !== undefined) item.sims = updates.sims ? String(updates.sims).trim() : null;
    if (updates.date_of_shipment !== undefined) item.date_of_shipment = updates.date_of_shipment || null;
    if (updates.eta_seaport !== undefined) item.eta_seaport = updates.eta_seaport || null;
    if (updates.expected_delivery_date !== undefined) item.expected_delivery_date = updates.expected_delivery_date || null;
    if (updates.status !== undefined) item.status = updates.status;
    if (updates.remarks !== undefined) item.remarks = updates.remarks ? String(updates.remarks).trim() : null;

    // Recalculate balance and aggregates
    this.computeItemQuantities(item);
    this.recomputePOAggregates(po);

    this.addAuditLog(
      'PO_ITEM_UPDATE',
      'purchase_order_items',
      item.id,
      `Updated item #${item.line_number} (${item.grade_code} ${item.section_name}, ${item.ordered_quantity} KG) in PO ${po.po_number}`
    );

    this.save();
    return item;
  }

  public deletePurchaseOrderItem(poIdOrNumber: string, itemId: string): boolean {
    const po = this.state.purchaseOrders.find(
      p => p.id === poIdOrNumber || p.po_number === poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${poIdOrNumber} not found`);
    if (!po.items) return false;

    const itemIndex = po.items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return false;

    const removedItem = po.items[itemIndex];

    // Remove associated receipts for this item if any
    this.state.receipts = this.state.receipts.filter(r => r.purchase_order_item_id !== itemId);

    po.items.splice(itemIndex, 1);

    // Re-index remaining line numbers
    po.items.forEach((item, idx) => {
      item.line_number = idx + 1;
    });

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'PO_ITEM_DELETE',
      'purchase_order_items',
      itemId,
      `Deleted item #${removedItem.line_number} (${removedItem.grade_code}) from PO ${po.po_number}`
    );

    this.save();
    return true;
  }

  // --- Add Receipt Workflow ---
  public addReceipt(params: {
    poId: string;
    itemId: string;
    receiptDate: string;
    receivedQuantity: number;
    supplierInvoice: string;
    supplierInvoiceDate?: string;
    lotNumber: string;
    shipmentDetails?: string;
    containerNo?: string;
    portOfLoading?: string;
    remarks?: string;
  }): { receipt: Receipt; updatedItem: PurchaseOrderItem; updatedPO: PurchaseOrder } {
    const po = this.state.purchaseOrders.find(p => p.id === params.poId || p.po_number === params.poId);
    if (!po) throw new Error(`Purchase order ${params.poId} not found`);

    const item = po.items?.find(i => i.id === params.itemId);
    if (!item) throw new Error(`PO Line Item ${params.itemId} not found`);

    const qty = Number(params.receivedQuantity);
    if (isNaN(qty) || qty <= 0) throw new Error(`Invalid received quantity: ${params.receivedQuantity}`);

    const lotNo = params.lotNumber.trim();
    let lot = this.state.lots.find(l => l.lot_number.toLowerCase() === lotNo.toLowerCase());
    if (!lot) {
      lot = {
        id: `lot-${lotNo}`,
        lot_number: lotNo,
        purchase_order_item_id: item.id,
        po_number: po.po_number,
        supplier_name: po.supplier_name,
        grade_code: item.grade_code,
        section_name: item.section_name,
        dimensions_display: `${item.diameter_width || 0} x ${item.thickness || 0} x ${item.length || 0}`,
        total_received_qty: 0,
        total_allocated_sold_qty: 0,
        available_qty: 0,
        warehouse_location: 'Nhava Sheva Yard',
        status: 'Available',
        created_at: new Date().toISOString()
      };
      this.state.lots.unshift(lot);
    }

    lot.total_received_qty += qty;
    lot.available_qty += qty;

    const receiptId = `rec-${po.po_number}-${Date.now()}`;
    const receiptNumber = `REC-${po.po_number}-${String((item.receipts?.length || 0) + 1).padStart(2, '0')}`;
    const newReceipt: Receipt = {
      id: receiptId,
      purchase_order_item_id: item.id,
      po_number: po.po_number,
      lot_id: lot.id,
      lot_number: lot.lot_number,
      receipt_number: receiptNumber,
      receipt_date: params.receiptDate,
      received_quantity: qty,
      unit: item.unit || 'KG',
      supplier_invoice_number: params.supplierInvoice,
      supplier_invoice_date: params.supplierInvoiceDate,
      container_no: params.containerNo?.trim() || null,
      port_of_loading: params.portOfLoading?.trim() || null,
      remarks: params.remarks,
      created_at: new Date().toISOString()
    };

    if (!item.receipts) item.receipts = [];
    item.receipts.push(newReceipt);
    this.deletedReceiptIds.delete(newReceipt.id);
    this.state.receipts.push(newReceipt);

    // Create Inventory Transaction Ledger Entry
    const tx: InventoryTransaction = {
      id: `tx-${Date.now()}`,
      lot_id: lot.id,
      lot_number: lot.lot_number,
      transaction_type: 'PURCHASE_RECEIPT',
      quantity: qty,
      reference_type: 'receipts',
      reference_id: newReceipt.id,
      reference_display: `PO ${po.po_number} / Item #${item.line_number} (Inv: ${params.supplierInvoice})`,
      transaction_date: params.receiptDate,
      remarks: params.remarks || `Physical receipt against PO ${po.po_number}`,
      created_at: new Date().toISOString()
    };
    this.state.inventoryTransactions.unshift(tx);

    // Set item status to Ready to Ship and assign ready quantity, container, and port of loading
    item.status = 'Ready to Ship';
    item.ready_quantity = (item.ready_quantity || 0) + qty;
    item.lot_number = lot.lot_number;
    if (params.containerNo !== undefined) item.container_no = params.containerNo.trim() || null;
    if (params.portOfLoading !== undefined) item.port_of_loading = params.portOfLoading.trim() || null;

    // Recompute Item & PO Quantities, Physical Shortage, and Statuses
    this.recomputePOAggregates(po);

    this.addAuditLog(
      'READY_TO_SHIP_ENTRY', 
      'receipts', 
      newReceipt.id, 
      `Marked ${qty} KG Ready to Ship for PO ${po.po_number} (Item #${item.line_number}) into Lot ${lot.lot_number}`
    );
    this.save();

    return { receipt: newReceipt, updatedItem: item, updatedPO: po };
  }

  // --- Mark Item Shipped & Set In-Transit ---
  public markItemShipped(params: {
    poIdOrNumber: string;
    itemId: string;
    dateOfShipment: string;
    etaSeaport: string;
    lotNumber?: string;
    heatNo?: string;
    sims?: string;
    deliveryTerms?: string;
    paymentTerms?: string;
    port?: string;
    containerNo?: string;
    portOfLoading?: string;
  }): { updatedItem: PurchaseOrderItem; updatedPO: PurchaseOrder; incomingItem: IncomingStockItem } {
    const po = this.state.purchaseOrders.find(
      p => p.id === params.poIdOrNumber || p.po_number === params.poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${params.poIdOrNumber} not found`);

    const item = po.items?.find(i => i.id === params.itemId);
    if (!item) throw new Error(`PO Line Item ${params.itemId} not found`);

    item.status = 'In Transit';
    item.date_of_shipment = params.dateOfShipment;
    item.eta_seaport = params.etaSeaport;
    item.heat_no = params.heatNo || item.heat_no || null;
    item.sims = params.sims || item.sims || null;
    item.delivery_terms = params.deliveryTerms || po.delivery_terms || 'FOB';
    item.payment_terms = params.paymentTerms || po.payment_terms || null;
    item.destination_port = params.port || po.destination || 'N.S.';
    if (params.containerNo !== undefined) item.container_no = params.containerNo?.trim() || null;
    if (params.portOfLoading !== undefined) item.port_of_loading = params.portOfLoading?.trim() || null;

    if (params.lotNumber?.trim()) {
      item.lot_number = params.lotNumber.trim();
    } else if (!item.lot_number?.trim()) {
      const recLot = item.receipts?.find(r => r.lot_number?.trim())?.lot_number?.trim();
      item.lot_number = recLot || `LOT-${po.po_number}-${item.line_number}`;
    }

    const cargoWeight = item.ready_quantity || item.received_quantity || item.ordered_quantity;
    const lotNo = item.lot_number.trim();

    // Create or update incoming stock item linked to this PO Item
    const incId = `inc-po-${po.po_number}-${item.id}`;
    let incomingItem = (this.state.incomingStock || []).find(
      i => i.id === incId || (i.linked_po_number === po.po_number && (i.lot_number === lotNo || i.id.includes(item.id)))
    );

    if (incomingItem) {
      incomingItem.lot_number = lotNo;
      incomingItem.date_of_shipment = params.dateOfShipment;
      incomingItem.eta_seaport = params.etaSeaport;
      incomingItem.heat_no = params.heatNo || incomingItem.heat_no;
      incomingItem.sims = params.sims || incomingItem.sims;
      incomingItem.delivery_terms = params.deliveryTerms || incomingItem.delivery_terms;
      incomingItem.payment_terms = params.paymentTerms || incomingItem.payment_terms;
      incomingItem.port = params.port || incomingItem.port || 'N.S.';
      incomingItem.container_no = params.containerNo?.trim() || incomingItem.container_no || item.container_no || null;
      incomingItem.port_of_loading = params.portOfLoading?.trim() || incomingItem.port_of_loading || item.port_of_loading || null;
      incomingItem.received_status = 'IN_TRANSIT';
      incomingItem.source_sheet = 'INCOMING SE';
      incomingItem.weight = cargoWeight;
    } else {
      incomingItem = {
        id: incId,
        make: po.origin || po.origin_make_name || 'Standard',
        supplier: po.supplier_name || 'Unknown Supplier',
        lot_number: lotNo,
        grade: item.grade_code,
        condition: item.condition_name || 'BLACK ROLLED',
        dia_w: item.diameter_width,
        t: item.thickness,
        l: item.length,
        pieces: item.receipts?.length || 1,
        weight: cargoWeight,
        customer: po.customer_name || 'SE',
        port: params.port || po.destination || 'N.S.',
        date_of_shipment: params.dateOfShipment,
        eta_seaport: params.etaSeaport,
        received_status: 'IN_TRANSIT',
        heat_no: params.heatNo || null,
        delivery_terms: params.deliveryTerms || po.delivery_terms || 'FOB',
        price: item.purchase_price,
        currency: item.currency || po.currency || 'USD',
        sims: params.sims || null,
        payment_terms: params.paymentTerms || po.payment_terms || null,
        container_no: params.containerNo?.trim() || item.container_no || null,
        port_of_loading: params.portOfLoading?.trim() || item.port_of_loading || null,
        source_sheet: 'INCOMING SE',
        linked_po_number: po.po_number,
        linked_po_id: po.id
      };
      if (!this.state.incomingStock) this.state.incomingStock = [];
      this.state.incomingStock.unshift(incomingItem);
    }

    // Ensure lot in inventory exists
    let lot = this.state.lots.find(l => l.lot_number.toLowerCase() === lotNo.toLowerCase());
    if (!lot) {
      lot = {
        id: `lot-${lotNo}-${Date.now()}`,
        lot_number: lotNo,
        purchase_order_item_id: item.id,
        po_number: po.po_number,
        supplier_name: po.supplier_name,
        grade_code: item.grade_code || 'Steel Grade',
        section_name: item.section_name || 'Steel Section',
        dimensions_display: `${item.grade_code} ${item.diameter_width || ''}`,
        total_received_qty: cargoWeight,
        total_allocated_sold_qty: 0,
        available_qty: cargoWeight,
        warehouse_location: params.port || po.destination || 'Nhava Sheva Yard',
        status: 'Available',
        created_at: new Date().toISOString()
      };
      this.state.lots.unshift(lot);
    }

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'SHIPMENT_DISPATCHED',
      'purchase_orders',
      po.id,
      `Item #${item.line_number} (Lot ${lotNo}) marked as In Transit with ETA ${params.etaSeaport}`
    );
    this.save();

    return { updatedItem: item, updatedPO: po, incomingItem };
  }

  // --- Mark Item Received (Both PO & Incoming Stock Synced) ---
  public markItemReceived(params: {
    poIdOrNumber: string;
    itemId: string;
    receiptDate?: string;
    warehouseLocation?: string;
  }): { updatedItem: PurchaseOrderItem; updatedPO: PurchaseOrder } {
    const po = this.state.purchaseOrders.find(
      p => p.id === params.poIdOrNumber || p.po_number === params.poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${params.poIdOrNumber} not found`);

    const item = po.items?.find(i => i.id === params.itemId);
    if (!item) throw new Error(`PO Line Item ${params.itemId} not found`);

    item.status = 'Received';
    if (!item.received_quantity || item.received_quantity <= 0) {
      item.received_quantity = item.ready_quantity || item.ordered_quantity;
    }
    if (params.warehouseLocation) {
      item.destination_port = params.warehouseLocation.trim();
    }

    // Synchronize linked Incoming Stock items
    if (this.state.incomingStock) {
      for (const inc of this.state.incomingStock) {
        if (
          inc.linked_po_number === po.po_number &&
          (inc.id === `inc-po-${po.po_number}-${item.id}` || (item.lot_number && inc.lot_number === item.lot_number) || inc.id.includes(item.id))
        ) {
          inc.received_status = 'RECEIVED';
          inc.source_sheet = 'INCOMING CLOSE';
          if (params.warehouseLocation) inc.port = params.warehouseLocation;
        }
      }
    }

    // Ensure lot in inventory is available
    if (item.lot_number) {
      const lot = this.state.lots.find(l => l.lot_number === item.lot_number);
      if (lot && params.warehouseLocation) {
        lot.warehouse_location = params.warehouseLocation;
      }
    }

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'ITEM_RECEIVED',
      'purchase_orders',
      po.id,
      `Marked Item #${item.line_number} as RECEIVED at warehouse.`
    );
    this.save();

    return { updatedItem: item, updatedPO: po };
  }


  public addBulkReceipt(params: {
    poIdOrNumber: string;
    itemIds: string[];
    lotNumber: string;
    supplierInvoice: string;
    supplierInvoiceDate?: string;
    receiptDate?: string;
    warehouseLocation?: string;
    containerNo?: string;
    portOfLoading?: string;
    remarks?: string;
    itemQuantities?: Record<string, number>;
  }): { receipts: Receipt[]; updatedPO: PurchaseOrder } {
    const po = this.state.purchaseOrders.find(
      p => p.id === params.poIdOrNumber || p.po_number === params.poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${params.poIdOrNumber} not found`);

    const lotNo = params.lotNumber.trim();
    if (!lotNo) throw new Error('Lot Number is required');
    const invoiceNo = params.supplierInvoice.trim();
    if (!invoiceNo) throw new Error('Supplier Invoice Number is required');
    const invoiceDate = params.supplierInvoiceDate || new Date().toISOString().split('T')[0];
    const receiptDate = params.receiptDate || invoiceDate;

    // Resolve or create shared lot
    let lot = this.state.lots.find(l => l.lot_number.toLowerCase() === lotNo.toLowerCase());
    const selectedItems = (po.items || []).filter(i => params.itemIds.includes(i.id));

    if (!lot) {
      const firstItem = selectedItems[0];
      const grades = selectedItems.map(i => i.grade_code).filter((v, idx, a) => a.indexOf(v) === idx).join(', ');
      lot = {
        id: `lot-${lotNo}-${Date.now()}`,
        lot_number: lotNo,
        purchase_order_item_id: firstItem?.id || params.itemIds[0],
        po_number: po.po_number,
        supplier_name: po.supplier_name,
        grade_code: grades || firstItem?.grade_code || 'Steel Grade',
        section_name: firstItem?.section_name || 'Multiple Sections',
        dimensions_display: `${selectedItems.length} PO Items: ${grades}`,
        total_received_qty: 0,
        total_allocated_sold_qty: 0,
        available_qty: 0,
        warehouse_location: params.warehouseLocation || 'Nhava Sheva Yard',
        status: 'Available',
        created_at: new Date().toISOString()
      };
      this.state.lots.unshift(lot);
    } else if (params.warehouseLocation) {
      lot.warehouse_location = params.warehouseLocation;
    }

    const createdReceipts: Receipt[] = [];

    for (const item of selectedItems) {
      this.computeItemQuantities(item);

      // Full quantity received which we ordered (or remaining pending if partial)
      let qty = params.itemQuantities && params.itemQuantities[item.id] !== undefined
        ? Number(params.itemQuantities[item.id])
        : (item.actionable_pending_qty ?? item.balance_quantity ?? item.ordered_quantity);

      if (qty <= 0) {
        qty = item.ordered_quantity;
      }
      if (qty <= 0) continue;

      // Update item properties directly in the store PO
      item.lot_number = lotNo;
      item.status = 'Ready to Ship';
      item.ready_quantity = qty;
      if (params.containerNo !== undefined) item.container_no = params.containerNo.trim() || null;
      if (params.portOfLoading !== undefined) item.port_of_loading = params.portOfLoading.trim() || null;
      if (params.warehouseLocation) item.destination_port = item.destination_port || params.warehouseLocation.trim();

      lot.total_received_qty += qty;
      lot.available_qty += qty;

      const receiptId = `rec-${po.po_number}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const receiptNumber = `REC-${po.po_number}-${String((item.receipts?.length || 0) + 1).padStart(2, '0')}`;
      const newReceipt: Receipt = {
        id: receiptId,
        purchase_order_item_id: item.id,
        po_number: po.po_number,
        lot_id: lot.id,
        lot_number: lot.lot_number,
        receipt_number: receiptNumber,
        receipt_date: receiptDate,
        received_quantity: qty,
        unit: item.unit || 'KG',
        supplier_invoice_number: invoiceNo,
        supplier_invoice_date: invoiceDate,
        container_no: params.containerNo?.trim() || null,
        port_of_loading: params.portOfLoading?.trim() || null,
        warehouse_location: params.warehouseLocation?.trim() || null,
        remarks: params.remarks,
        created_at: new Date().toISOString()
      };

      if (!item.receipts) item.receipts = [];
      item.receipts.push(newReceipt);
      this.deletedReceiptIds.delete(newReceipt.id);
      this.state.receipts.push(newReceipt);
      createdReceipts.push(newReceipt);

      // Create or update incoming stock item linked to this PO Item
      const incId = `inc-po-${po.po_number}-${item.id}`;
      let incomingItem = (this.state.incomingStock || []).find(
        i => i.id === incId || (i.linked_po_number === po.po_number && (i.lot_number === lotNo || i.id.includes(item.id)))
      );
      if (incomingItem) {
        incomingItem.lot_number = lotNo;
        incomingItem.weight = qty;
        incomingItem.received_status = 'READY';
        if (params.containerNo) incomingItem.container_no = params.containerNo.trim();
        if (params.portOfLoading) incomingItem.port_of_loading = params.portOfLoading.trim();
      } else {
        incomingItem = {
          id: incId,
          make: po.origin || po.origin_make_name || 'Standard',
          supplier: po.supplier_name || 'Unknown Supplier',
          lot_number: lotNo,
          grade: item.grade_code,
          condition: item.condition_name || 'BLACK ROLLED',
          dia_w: item.diameter_width,
          t: item.thickness,
          l: item.length,
          pieces: item.receipts?.length || 1,
          weight: qty,
          customer: po.customer_name || 'SE',
          port: po.destination || 'N.S.',
          date_of_shipment: '',
          eta_seaport: po.expected_delivery_date || '',
          received_status: 'READY',
          delivery_terms: po.delivery_terms || 'FOB',
          price: item.purchase_price,
          currency: item.currency || po.currency || 'USD',
          container_no: params.containerNo?.trim() || item.container_no || null,
          port_of_loading: params.portOfLoading?.trim() || item.port_of_loading || null,
          source_sheet: 'INCOMING SE',
          linked_po_number: po.po_number,
          linked_po_id: po.id
        };
        if (!this.state.incomingStock) this.state.incomingStock = [];
        this.state.incomingStock.unshift(incomingItem);
      }

      // Create Inventory Transaction Ledger Entry
      const tx: InventoryTransaction = {
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        lot_id: lot.id,
        lot_number: lot.lot_number,
        transaction_type: 'PURCHASE_RECEIPT',
        quantity: qty,
        reference_type: 'receipts',
        reference_id: newReceipt.id,
        reference_display: `PO ${po.po_number} / Item #${item.line_number} (Inv: ${invoiceNo})`,
        transaction_date: receiptDate,
        remarks: params.remarks || `Physical receipt against PO ${po.po_number} (Bulk)`,
        created_at: new Date().toISOString()
      };
      this.state.inventoryTransactions.unshift(tx);
    }

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'RECEIPT_ENTRY',
      'purchase_orders',
      po.id,
      `Bulk received ${createdReceipts.length} items for PO ${po.po_number} under Lot ${lot.lot_number} and Invoice ${invoiceNo}`
    );

    this.save();
    return { receipts: createdReceipts, updatedPO: po };
  }

  public updateBulkItemReceipts(params: {
    poIdOrNumber: string;
    itemIds: string[];
    lotNumber?: string;
    supplierInvoice?: string;
    supplierInvoiceDate?: string;
  }): { updatedCount: number } {
    const po = this.state.purchaseOrders.find(
      p => p.id === params.poIdOrNumber || p.po_number === params.poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${params.poIdOrNumber} not found`);

    const lotNo = params.lotNumber?.trim();
    const invoiceNo = params.supplierInvoice?.trim();
    const invoiceDate = params.supplierInvoiceDate;

    let updatedCount = 0;
    for (const itemId of params.itemIds) {
      const item = po.items?.find(i => i.id === itemId);
      if (!item) continue;

      if (lotNo) {
        item.lot_number = lotNo;
      }

      if (item.receipts) {
        for (const rec of item.receipts) {
          if (lotNo) rec.lot_number = lotNo;
          if (invoiceNo) rec.supplier_invoice_number = invoiceNo;
          if (invoiceDate) {
            rec.supplier_invoice_date = invoiceDate;
            rec.receipt_date = invoiceDate;
          }

          const globalRec = this.state.receipts.find(r => r.id === rec.id);
          if (globalRec) {
            if (lotNo) globalRec.lot_number = lotNo;
            if (invoiceNo) globalRec.supplier_invoice_number = invoiceNo;
            if (invoiceDate) {
              globalRec.supplier_invoice_date = invoiceDate;
              globalRec.receipt_date = invoiceDate;
            }
          }
          updatedCount++;
        }
      }

      // Also sync incoming stock item if lot changed
      if (lotNo && this.state.incomingStock) {
        for (const inc of this.state.incomingStock) {
          if (inc.linked_po_number === po.po_number && inc.id.includes(item.id)) {
            inc.lot_number = lotNo;
          }
        }
      }
    }

    if (updatedCount > 0) {
      this.addAuditLog(
        'RECEIPT_UPDATE',
        'purchase_orders',
        po.id,
        `Bulk updated Lot/Invoice for ${params.itemIds.length} items under PO ${po.po_number}`
      );
      this.save();
    }

    return { updatedCount };
  }

  // --- Edit & Delete Individual Receipt Workflows ---
  public updateReceipt(receiptId: string, updates: {
    receivedQuantity?: number;
    lotNumber?: string;
    supplierInvoice?: string;
    supplierInvoiceDate?: string;
    containerNo?: string;
    portOfLoading?: string;
    remarks?: string;
    warehouseLocation?: string;
  }): { updatedReceipt: Receipt; updatedItem: PurchaseOrderItem; updatedPO: PurchaseOrder } {
    const globalRec = this.state.receipts.find(r => r.id === receiptId);
    if (!globalRec) throw new Error(`Receipt ${receiptId} not found`);

    const po = this.state.purchaseOrders.find(p => p.po_number === globalRec.po_number);
    if (!po) throw new Error(`Purchase order ${globalRec.po_number} not found`);

    const item = po.items?.find(i => i.id === globalRec.purchase_order_item_id);
    if (!item) throw new Error(`PO Line Item not found for receipt`);

    const itemRec = item.receipts?.find(r => r.id === receiptId);
    if (!itemRec) throw new Error(`Item receipt not found`);

    const oldQty = Number(globalRec.received_quantity) || 0;
    const newQty = updates.receivedQuantity !== undefined ? Number(updates.receivedQuantity) : oldQty;
    if (newQty <= 0) throw new Error('Received quantity must be greater than 0 KG');
    const diffQty = newQty - oldQty;

    // Handle Lot assignment changes
    const oldLotNo = (globalRec.lot_number || '').trim();
    const newLotNo = (updates.lotNumber?.trim()) || oldLotNo;

    if (oldLotNo && oldLotNo.toLowerCase() === newLotNo.toLowerCase()) {
      const lot = this.state.lots.find(l => l.lot_number.toLowerCase() === oldLotNo.toLowerCase());
      if (lot) {
        lot.total_received_qty = Math.max(0, lot.total_received_qty + diffQty);
        lot.available_qty = Math.max(0, lot.available_qty + diffQty);
        if (updates.warehouseLocation) lot.warehouse_location = updates.warehouseLocation;
      }
    } else {
      if (oldLotNo) {
        const oldLot = this.state.lots.find(l => l.lot_number.toLowerCase() === oldLotNo.toLowerCase());
        if (oldLot) {
          oldLot.total_received_qty = Math.max(0, oldLot.total_received_qty - oldQty);
          oldLot.available_qty = Math.max(0, oldLot.available_qty - oldQty);
        }
      }
      let newLot = newLotNo ? this.state.lots.find(l => l.lot_number.toLowerCase() === newLotNo.toLowerCase()) : null;
      if (!newLot) {
        newLot = {
          id: `lot-${newLotNo}-${Date.now()}`,
          lot_number: newLotNo,
          purchase_order_item_id: item.id,
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          grade_code: item.grade_code,
          section_name: item.section_name,
          dimensions_display: `${item.diameter_width || 0} x ${item.thickness || 0} x ${item.length || 0}`,
          total_received_qty: newQty,
          total_allocated_sold_qty: 0,
          available_qty: newQty,
          warehouse_location: updates.warehouseLocation || 'Nhava Sheva Yard',
          status: 'Available',
          created_at: new Date().toISOString()
        };
        this.state.lots.unshift(newLot);
      } else {
        newLot.total_received_qty += newQty;
        newLot.available_qty += newQty;
        if (updates.warehouseLocation) newLot.warehouse_location = updates.warehouseLocation;
      }
      globalRec.lot_id = newLot.id;
      globalRec.lot_number = newLot.lot_number;
      itemRec.lot_id = newLot.id;
      itemRec.lot_number = newLot.lot_number;
    }

    globalRec.received_quantity = newQty;
    itemRec.received_quantity = newQty;

    if (updates.supplierInvoice !== undefined) {
      globalRec.supplier_invoice_number = updates.supplierInvoice.trim();
      itemRec.supplier_invoice_number = updates.supplierInvoice.trim();
    }
    if (updates.supplierInvoiceDate !== undefined) {
      globalRec.supplier_invoice_date = updates.supplierInvoiceDate;
      globalRec.receipt_date = updates.supplierInvoiceDate;
      itemRec.supplier_invoice_date = updates.supplierInvoiceDate;
      itemRec.receipt_date = updates.supplierInvoiceDate;
    }
    if (updates.remarks !== undefined) {
      globalRec.remarks = updates.remarks.trim();
      itemRec.remarks = updates.remarks.trim();
    }
    if (updates.containerNo !== undefined) {
      globalRec.container_no = updates.containerNo.trim() || null;
      itemRec.container_no = updates.containerNo.trim() || null;
      item.container_no = updates.containerNo.trim() || null;
    }
    if (updates.portOfLoading !== undefined) {
      globalRec.port_of_loading = updates.portOfLoading.trim() || null;
      itemRec.port_of_loading = updates.portOfLoading.trim() || null;
      item.port_of_loading = updates.portOfLoading.trim() || null;
    }

    // Update Inventory Ledger Transaction
    const tx = this.state.inventoryTransactions.find(t => t.reference_id === receiptId);
    if (tx) {
      tx.quantity = newQty;
      tx.lot_number = globalRec.lot_number || undefined;
      if (updates.supplierInvoice) {
        tx.reference_display = `PO ${po.po_number} / Item #${item.line_number} (Inv: ${updates.supplierInvoice})`;
      }
      if (updates.supplierInvoiceDate) {
        tx.transaction_date = updates.supplierInvoiceDate;
      }
    }

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'RECEIPT_UPDATE',
      'receipts',
      receiptId,
      `Updated Receipt ${globalRec.receipt_number} for PO ${po.po_number}: ${oldQty} KG -> ${newQty} KG, Lot: ${globalRec.lot_number}`
    );

    this.save();
    return { updatedReceipt: itemRec, updatedItem: item, updatedPO: po };
  }

  public deleteReceipt(receiptId: string): { deletedReceipt: Receipt; updatedItem: PurchaseOrderItem; updatedPO: PurchaseOrder } {
    const recIndex = this.state.receipts.findIndex(r => r.id === receiptId);
    if (recIndex === -1) throw new Error(`Receipt ${receiptId} not found`);
    const rec = this.state.receipts[recIndex];

    const po = this.state.purchaseOrders.find(p => p.po_number === rec.po_number);
    if (!po) throw new Error(`Purchase order ${rec.po_number} not found`);

    const item = po.items?.find(i => i.id === rec.purchase_order_item_id);
    if (!item) throw new Error(`PO Line Item not found for receipt`);

    const itemRecIndex = (item.receipts || []).findIndex(r => r.id === receiptId);
    if (itemRecIndex === -1) throw new Error(`Item receipt not found`);

    const qty = Number(rec.received_quantity) || 0;

    // Deduct from Lot
    const lotNo = (rec.lot_number || '').trim().toLowerCase();
    const lot = lotNo ? this.state.lots.find(l => l.lot_number.toLowerCase() === lotNo) : null;
    if (lot) {
      lot.total_received_qty = Math.max(0, lot.total_received_qty - qty);
      lot.available_qty = Math.max(0, lot.available_qty - qty);
      if (lot.total_received_qty === 0 && lot.total_allocated_sold_qty === 0) {
        lot.status = 'Depleted';
      }
    }

    // Remove inventory transaction
    this.state.inventoryTransactions = this.state.inventoryTransactions.filter(
      t => t.reference_id !== receiptId
    );

    // Remove receipt from item and global state
    item.receipts!.splice(itemRecIndex, 1);
    this.deletedReceiptIds.add(receiptId);
    this.state.receipts.splice(recIndex, 1);

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'RECEIPT_DELETE',
      'receipts',
      receiptId,
      `Deleted Receipt ${rec.receipt_number} (${qty} KG) for PO ${po.po_number} (Item #${item.line_number})`
    );

    this.save();
    return { deletedReceipt: rec, updatedItem: item, updatedPO: po };
  }

  // --- Balance Resolution Engine ---
  public computeItemQuantities(item: PurchaseOrderItem): void {
    const totalRecd = item.receipts !== undefined
      ? item.receipts.reduce((sum, r) => sum + (Number(r.received_quantity) || 0), 0)
      : (Number(item.received_quantity) || 0);

    item.received_quantity = totalRecd;

    const ordQty = Number(item.ordered_quantity) || 0;
    const isFullyMatched = (ordQty > 0 || totalRecd > 0) && Math.abs(ordQty - totalRecd) < 0.001;

    if (isFullyMatched) {
      item.physical_short_qty = 0;
      item.actionable_pending_qty = 0;
      item.balance_quantity = 0;
      item.carried_forward_qty = 0;
      item.waived_qty = 0;
    } else if (totalRecd > ordQty) {
      item.physical_short_qty = 0;
      const overBalance = ordQty - totalRecd; // negative number (e.g. -200 KG)
      item.actionable_pending_qty = overBalance;
      item.balance_quantity = overBalance;
    } else {
      item.physical_short_qty = Math.max(0, ordQty - totalRecd);

      const activeRes = (this.state.balanceResolutions || []).filter(
        r => r.po_item_id === item.id && r.status === 'ACTIVE'
      );
      item.resolutions = activeRes;

      const cfQty = activeRes
        .filter(r => r.resolution_type === 'CARRY_FORWARD')
        .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
      const wQty = activeRes
        .filter(r => r.resolution_type === 'WAIVED')
        .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

      item.carried_forward_qty = cfQty;
      item.waived_qty = wQty;
      const resolvedQty = cfQty + wQty;
      const actionablePending = Math.max(0, item.physical_short_qty - resolvedQty);

      item.actionable_pending_qty = actionablePending;
      item.balance_quantity = actionablePending;
    }

    // Preserve lifecycle statuses if already set to Ready to Ship, In Transit, Received, or Closed
    if (item.status === 'In Transit' || item.status === 'Received' || item.status?.startsWith('Closed')) {
      return;
    }
    if (item.status === 'Ready to Ship' && (totalRecd > 0 || (item.ready_quantity || 0) > 0)) {
      return;
    }

    if (isFullyMatched) {
      if (totalRecd > 0) {
        item.status = 'Received';
      }
      return;
    }

    if (totalRecd > ordQty) {
      item.status = 'Over Received';
    } else if (item.actionable_pending_qty === 0 && ((item.carried_forward_qty || 0) + (item.waived_qty || 0) > 0)) {
      if ((item.carried_forward_qty || 0) > 0 && (item.waived_qty || 0) > 0) {
        item.status = 'Closed — Balance Resolved';
      } else if ((item.carried_forward_qty || 0) > 0) {
        item.status = 'Closed — Balance Carried Forward';
      } else if ((item.waived_qty || 0) > 0) {
        item.status = 'Closed — Short Received';
      }
    } else if (totalRecd > 0 || (item.ready_quantity || 0) > 0) {
      item.status = 'Ready to Ship';
    } else {
      item.status = 'Open';
    }
  }

  public recomputePOAggregates(po: PurchaseOrder): void {
    if (!po.items) po.items = [];
    for (const item of po.items) {
      this.computeItemQuantities(item);
    }

    po.total_items = po.items.length;
    po.total_ordered_qty = po.items.reduce((acc, i) => acc + (i.ordered_quantity || 0), 0);
    po.total_received_qty = po.items.reduce((acc, i) => acc + (i.received_quantity || 0), 0);
    po.total_ready_qty = po.items.reduce((acc, i) => acc + (i.ready_quantity || i.received_quantity || 0), 0);
    po.total_physical_short_qty = po.items.reduce((acc, i) => acc + (i.physical_short_qty || 0), 0);
    po.total_carried_forward_qty = po.items.reduce((acc, i) => acc + (i.carried_forward_qty || 0), 0);
    po.total_waived_qty = po.items.reduce((acc, i) => acc + (i.waived_qty || 0), 0);
    po.total_actionable_pending_qty = po.items.reduce((acc, i) => acc + (i.actionable_pending_qty || 0), 0);
    po.total_balance_qty = po.items.reduce((acc, i) => acc + (i.balance_quantity || 0), 0);
    po.total_order_value = po.items.reduce((acc, i) => acc + ((i.ordered_quantity || 0) * (i.purchase_price || 0)), 0);
    po.total_pending_value = po.items.reduce((acc, i) => acc + (Math.max(0, i.actionable_pending_qty || 0) * (i.purchase_price || 0)), 0);

    const isPOFullyMatched = (po.total_ordered_qty > 0 || po.total_received_qty > 0) &&
      Math.abs(po.total_ordered_qty - po.total_received_qty) < 0.001;
    if (isPOFullyMatched) {
      po.total_physical_short_qty = 0;
      po.total_actionable_pending_qty = 0;
      po.total_balance_qty = 0;
      po.total_pending_value = 0;
    } else if (po.is_closed) {
      po.total_physical_short_qty = 0;
      po.total_actionable_pending_qty = 0;
      // Preserve po.total_balance_qty so closed POs retain their under/over received variance
      po.total_pending_value = 0;
    }

    const hasShortage = po.items.some(i => (i.physical_short_qty || 0) > 0 && ((i.actionable_pending_qty || 0) > 0));
    const hasOverReceived = po.items.some(i => i.status === 'Over Received' || (i.balance_quantity || 0) < 0);

    if (po.is_closed) {
      po.status = 'Closed';
    } else if (po.items.length > 0 && po.items.every(i => i.status === 'Received' || i.status?.startsWith('Closed'))) {
      po.status = 'Received';
    } else if (po.items.some(i => i.status === 'In Transit')) {
      po.status = 'In Transit';
    } else if (po.items.some(i => i.status === 'Ready to Ship')) {
      po.status = 'Ready to Ship';
    } else if (!hasShortage && po.total_received_qty > 0) {
      po.status = 'Received';
    } else if (po.items.some(i => (i.carried_forward_qty || 0) > 0 || (i.waived_qty || 0) > 0)) {
      po.status = 'Partially Resolved';
    } else if (po.total_received_qty > 0) {
      po.status = 'Ready to Ship';
    } else {
      po.status = 'Open';
    }

    po.updated_at = new Date().toISOString();
  }

  public resolveBalance(params: {
    poIdOrNumber: string;
    itemId: string;
    option: 'CARRY_FORWARD' | 'WAIVED' | 'MIXED';
    carryForwardQty?: number;
    waivedQty?: number;
    reason?: string;
    remarks?: string;
    expectedDeliveryDate?: string;
    createdBy?: string;
  }): {
    resolutions: BalanceResolution[];
    originalItem: PurchaseOrderItem;
    newItem?: PurchaseOrderItem;
    updatedPO: PurchaseOrder;
  } {
    const po = this.state.purchaseOrders.find(
      p => p.id === params.poIdOrNumber || p.po_number === params.poIdOrNumber
    );
    if (!po) throw new Error(`Purchase order ${params.poIdOrNumber} not found`);

    const item = po.items?.find(i => i.id === params.itemId);
    if (!item) throw new Error(`PO Line Item ${params.itemId} not found`);

    this.computeItemQuantities(item);
    const actionable = item.actionable_pending_qty ?? 0;
    if (actionable <= 0) {
      throw new Error(`This item has no actionable pending balance to resolve (Actionable Pending: 0 KG).`);
    }

    let cfQty = 0;
    let wQty = 0;

    if (params.option === 'CARRY_FORWARD') {
      cfQty = Number(params.carryForwardQty) || 0;
    } else if (params.option === 'WAIVED') {
      wQty = Number(params.waivedQty) || 0;
    } else if (params.option === 'MIXED') {
      cfQty = Number(params.carryForwardQty) || 0;
      wQty = Number(params.waivedQty) || 0;
    }

    if (cfQty < 0 || wQty < 0) {
      throw new Error('Quantities cannot be negative.');
    }

    const totalToResolve = cfQty + wQty;
    if (totalToResolve <= 0) {
      throw new Error('Total quantity to resolve must be greater than zero.');
    }

    if (totalToResolve > actionable) {
      throw new Error(`Resolved quantity (${totalToResolve.toLocaleString()} KG) cannot exceed current pending quantity of ${actionable.toLocaleString()} KG.`);
    }

    let newItem: PurchaseOrderItem | undefined;
    const createdResolutions: BalanceResolution[] = [];

    // 1. Handle Carry Forward
    if (cfQty > 0) {
      const lineNum = (po.items?.length || 0) + 1;
      const newItemId = `item-${po.po_number}-${lineNum}-${Date.now()}`;
      newItem = {
        id: newItemId,
        purchase_order_id: po.id,
        po_number: po.po_number,
        line_number: lineNum,
        grade_code: item.grade_code,
        grade_doc: item.grade_doc || null,
        section_name: item.section_name,
        diameter_width: item.diameter_width || null,
        thickness: item.thickness || null,
        length: item.length || null,
        treatment: item.treatment || 'Annealed',
        condition_name: item.condition_name || 'BLACK ROLLED',
        ordered_quantity: cfQty,
        received_quantity: 0,
        balance_quantity: cfQty,
        physical_short_qty: cfQty,
        carried_forward_qty: 0,
        waived_qty: 0,
        actionable_pending_qty: cfQty,
        unit: item.unit || 'KG',
        purchase_price: item.purchase_price,
        currency: item.currency || po.currency || 'USD',
        expected_delivery_date: params.expectedDeliveryDate || item.expected_delivery_date || po.expected_delivery_date || null,
        status: 'Open',
        receipt_count: 0,
        receipts: [],
        created_from_item_id: item.id,
        created_from_po_number: po.po_number,
        remarks: params.remarks ? `Balance carried forward from Item #${item.line_number}: ${params.remarks}` : `Balance carried forward from Item #${item.line_number}`
      };
      po.items!.push(newItem);

      const cfRes: BalanceResolution = {
        id: `res-cf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        po_item_id: item.id,
        po_number: po.po_number,
        resolution_type: 'CARRY_FORWARD',
        quantity: cfQty,
        reason: params.reason || 'Balance carried forward to new order item',
        remarks: params.remarks || null,
        linked_po_item_id: newItemId,
        linked_po_number: po.po_number,
        created_by: params.createdBy || 'Current User (Operations)',
        created_at: new Date().toISOString(),
        status: 'ACTIVE'
      };
      this.state.balanceResolutions.unshift(cfRes);
      createdResolutions.push(cfRes);
      item.carried_forward_to_item_id = newItemId;
    }

    // 2. Handle Waived / Short Close
    if (wQty > 0) {
      const wRes: BalanceResolution = {
        id: `res-w-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        po_item_id: item.id,
        po_number: po.po_number,
        resolution_type: 'WAIVED',
        quantity: wQty,
        reason: params.reason || 'Short-close / balance waived',
        remarks: params.remarks || null,
        created_by: params.createdBy || 'Current User (Operations)',
        created_at: new Date().toISOString(),
        status: 'ACTIVE'
      };
      this.state.balanceResolutions.unshift(wRes);
      createdResolutions.push(wRes);
    }

    // 3. Recompute everything
    this.recomputePOAggregates(po);

    this.addAuditLog(
      'BALANCE_RESOLUTION',
      'purchase_order_items',
      item.id,
      `Resolved ${totalToResolve} KG for PO ${po.po_number} Item #${item.line_number} (CF: ${cfQty} KG, Waived: ${wQty} KG. Reason: ${params.reason || 'N/A'})`
    );

    this.save();

    return {
      resolutions: createdResolutions,
      originalItem: item,
      newItem,
      updatedPO: po
    };
  }

  public reverseResolution(resolutionId: string, reversalReason?: string): boolean {
    const res = this.state.balanceResolutions.find(r => r.id === resolutionId);
    if (!res) throw new Error(`Resolution ${resolutionId} not found`);
    if (res.status === 'REVERSED') throw new Error(`Resolution ${resolutionId} is already reversed`);

    const po = this.state.purchaseOrders.find(p => p.po_number === res.po_number || p.items?.some(i => i.id === res.po_item_id));
    if (!po) throw new Error(`Associated Purchase Order for resolution ${resolutionId} not found`);

    const origItem = po.items?.find(i => i.id === res.po_item_id);

    if (res.resolution_type === 'CARRY_FORWARD' && res.linked_po_item_id) {
      const linkedItem = po.items?.find(i => i.id === res.linked_po_item_id);
      if (linkedItem) {
        if ((linkedItem.receipt_count || 0) > 0 || (linkedItem.received_quantity || 0) > 0) {
          throw new Error(`Cannot reverse carry-forward: linked line item #${linkedItem.line_number} already has physical receipts recorded.`);
        }
        po.items = po.items?.filter(i => i.id !== res.linked_po_item_id);
      }
      if (origItem && origItem.carried_forward_to_item_id === res.linked_po_item_id) {
        origItem.carried_forward_to_item_id = null;
      }
    }

    res.status = 'REVERSED';
    res.reversed_at = new Date().toISOString();
    res.reversed_by = 'Current User (Operations)';
    res.reversal_reason = reversalReason || 'Manual reversal';

    this.recomputePOAggregates(po);

    this.addAuditLog(
      'RESOLUTION_REVERSAL',
      'balance_resolutions',
      res.id,
      `Reversed resolution ${res.id} (${res.resolution_type}: ${res.quantity} KG) for PO ${res.po_number}`
    );

    this.save();
    return true;
  }

  public getBalanceResolutions(itemId?: string): BalanceResolution[] {
    if (!this.state.balanceResolutions) return [];
    if (itemId) {
      return this.state.balanceResolutions.filter(r => r.po_item_id === itemId);
    }
    return this.state.balanceResolutions;
  }

  // --- Lots & Inventory ---
  public getLots(search?: string) {
    // Collect all lot aggregations from PO items
    const poLotAgg = new Map<string, {
      total_received_qty: number;
      grade_codes: Set<string>;
      po_numbers: Set<string>;
      suppliers: Set<string>;
      sections: Set<string>;
      dimensions: Set<string>;
      firstItemId: string;
      primaryPo: string;
      primarySup: string;
      primaryGrade: string;
      primarySection: string;
    }>();

    for (const po of this.state.purchaseOrders) {
      if (!po.items) continue;
      for (const item of po.items) {
        if (item.lot_number && item.lot_number.trim()) {
          const lotNo = item.lot_number.trim();
          const lotKey = lotNo.toLowerCase();
          const itemQty = Number(item.ready_quantity ?? item.received_quantity ?? 0);
          
          if (!poLotAgg.has(lotKey)) {
            poLotAgg.set(lotKey, {
              total_received_qty: 0,
              grade_codes: new Set(),
              po_numbers: new Set(),
              suppliers: new Set(),
              sections: new Set(),
              dimensions: new Set(),
              firstItemId: item.id,
              primaryPo: po.po_number,
              primarySup: po.supplier_name || 'Standard Supplier',
              primaryGrade: item.grade_code,
              primarySection: item.section_name || 'Standard'
            });
          }
          const agg = poLotAgg.get(lotKey)!;
          agg.total_received_qty += itemQty;
          if (item.grade_code) agg.grade_codes.add(item.grade_code);
          if (po.po_number) agg.po_numbers.add(po.po_number);
          if (po.supplier_name) agg.suppliers.add(po.supplier_name);
          if (item.section_name) agg.sections.add(item.section_name);
          const dimStr = [
            item.diameter_width ? `DIA ${item.diameter_width}` : '',
            item.thickness ? `T${item.thickness}` : '',
            item.length ? `L${item.length}` : ''
          ].filter(Boolean).join(' × ');
          if (dimStr) agg.dimensions.add(dimStr);
        }
      }
    }

    for (const [lotKey, agg] of poLotAgg.entries()) {
      const existing = this.state.lots.find(l => l.lot_number.toLowerCase() === lotKey);
      if (existing) {
        existing.total_received_qty = agg.total_received_qty;
        existing.available_qty = Math.max(0, agg.total_received_qty - (existing.total_allocated_sold_qty || 0));
        existing.status = existing.available_qty > 0 ? 'Available' : 'Allocated';
      } else {
        const lotOrig = Array.from(this.state.purchaseOrders)
          .flatMap(p => p.items || [])
          .find(i => i.lot_number && i.lot_number.trim().toLowerCase() === lotKey)?.lot_number?.trim() || lotKey;
        this.state.lots.unshift({
          id: `lot-${lotOrig}`,
          lot_number: lotOrig,
          purchase_order_item_id: agg.firstItemId,
          po_number: agg.primaryPo,
          supplier_name: agg.primarySup,
          grade_code: agg.primaryGrade,
          section_name: agg.primarySection,
          dimensions_display: Array.from(agg.dimensions).slice(0, 3).join(', ') || 'Standard Spec',
          total_received_qty: agg.total_received_qty,
          total_allocated_sold_qty: 0,
          available_qty: agg.total_received_qty,
          warehouse_location: 'Nhava Sheva Yard',
          status: agg.total_received_qty > 0 ? 'Available' : 'Allocated',
          created_at: new Date().toISOString()
        });
      }
    }

    let list = this.state.lots.filter(l => Boolean(l.lot_number && l.lot_number.trim() && !l.lot_number.startsWith('LOT-undefined')));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => 
        l.lot_number.toLowerCase().includes(q) ||
        l.grade_code?.toLowerCase().includes(q) ||
        l.po_number?.toLowerCase().includes(q) ||
        l.supplier_name?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const lotA = (a.lot_number || '').trim();
      const lotB = (b.lot_number || '').trim();
      const numA = parseFloat(lotA);
      const numB = parseFloat(lotB);
      if (!isNaN(numA) && !isNaN(numB) && String(numA) === lotA && String(numB) === lotB) {
        return numB - numA;
      }
      return lotB.localeCompare(lotA, undefined, { numeric: true, sensitivity: 'base' });
    });
    return list;
  }

  public getLotHistory(lotId: string): InventoryTransaction[] {
    return this.state.inventoryTransactions.filter(tx => tx.lot_id === lotId || tx.lot_number === lotId);
  }

  // --- Suppliers & Customers ---
  public getSuppliers(): Supplier[] {
    const seen = new Set<string>();
    const unique: Supplier[] = [];
    for (const s of (this.state.suppliers || [])) {
      if (!s || !s.supplier_name) continue;
      const key = canonicalSupplierKey(s.supplier_name) || (s.id || s.supplier_name).trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    return unique;
  }

  public createSupplier(supplierData: Partial<Supplier>): Supplier {
    const name = (supplierData.supplier_name || '').trim();
    if (!name) throw new Error('Supplier name is required');

    const id = `sup-${Date.now()}`;
    const code = supplierData.supplier_code?.trim() || `SUP-${String(this.state.suppliers.length + 1).padStart(3, '0')}`;

    const newSupplier: Supplier = {
      id,
      supplier_code: code,
      supplier_name: name,
      country: supplierData.country?.trim() || 'Overseas',
      contact_person: supplierData.contact_person?.trim() || null,
      reference: supplierData.reference?.trim() || supplierData.reference_person?.trim() || null,
      reference_person: supplierData.reference_person?.trim() || supplierData.reference?.trim() || null,
      email: supplierData.email?.trim() || null,
      phone: supplierData.phone?.trim() || null,
      address: supplierData.address?.trim() || null,
      payment_terms: supplierData.payment_terms?.trim() || 'DP at sight',
      default_currency: supplierData.default_currency?.trim() || 'USD',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.state.suppliers.unshift(newSupplier);
    this.addAuditLog('SUPPLIER_CREATE', 'suppliers', newSupplier.id, `Created supplier ${newSupplier.supplier_name} (${newSupplier.country})`);
    this.save();
    return newSupplier;
  }

  public getCustomers() {
    return this.state.customers;
  }

  public createCustomer(customerData: Partial<Customer>): Customer {
    const name = (customerData.customer_name || '').trim();
    if (!name) throw new Error('Customer name is required');

    const id = `cust-${Date.now()}`;
    const code = customerData.customer_code?.trim() || `CUST-${String(this.state.customers.length + 1).padStart(3, '0')}`;

    const newCustomer: Customer = {
      id,
      customer_code: code,
      customer_name: name,
      contact_person: customerData.contact_person?.trim() || null,
      email: customerData.email?.trim() || null,
      phone: customerData.phone?.trim() || null,
      address: customerData.address?.trim() || null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.state.customers.push(newCustomer);
    this.addAuditLog('CUSTOMER_CREATE', 'customers', newCustomer.id, `Created customer ${newCustomer.customer_name}`);
    this.save();
    return newCustomer;
  }

  public getInventoryTransactions() {
    return this.state.inventoryTransactions;
  }

  public getReceipts() {
    return this.state.receipts;
  }

  // --- Traceability Engine ---
  public getTraceability(term: string) {
    const q = term.trim().toLowerCase();
    if (!q) return null;

    // Search by PO Number
    const po = this.state.purchaseOrders.find(p => p.po_number.toLowerCase() === q);
    if (po) {
      const relatedReceipts = this.state.receipts.filter(r => r.po_number?.toLowerCase() === po.po_number.toLowerCase());
      const lotNumbers = Array.from(new Set(relatedReceipts.map(r => r.lot_number).filter(Boolean)));
      const relatedLots = this.state.lots.filter(l => lotNumbers.includes(l.lot_number));
      return {
        type: 'PURCHASE_ORDER',
        po,
        items: po.items || [],
        receipts: relatedReceipts,
        lots: relatedLots,
        supplier: this.state.suppliers.find(s => s.id === po.supplier_id || s.supplier_name === po.supplier_name)
      };
    }

    // Search by Lot Number
    const lot = this.state.lots.find(l => l.lot_number.toLowerCase() === q);
    if (lot) {
      const po = this.state.purchaseOrders.find(p => p.po_number === lot.po_number);
      const item = po?.items?.find(i => i.id === lot.purchase_order_item_id);
      const receipts = this.state.receipts.filter(r => r.lot_number === lot.lot_number);
      const transactions = this.getLotHistory(lot.id);
      return {
        type: 'LOT',
        lot,
        po,
        item,
        receipts,
        transactions,
        supplier: po ? this.state.suppliers.find(s => s.id === po.supplier_id || s.supplier_name === po.supplier_name) : null
      };
    }

    // Search by Invoice Number
    const receiptByInv = this.state.receipts.find(r => r.supplier_invoice_number?.toLowerCase() === q);
    if (receiptByInv) {
      const po = this.state.purchaseOrders.find(p => p.po_number === receiptByInv.po_number);
      const lot = this.state.lots.find(l => l.lot_number === receiptByInv.lot_number);
      return {
        type: 'INVOICE',
        receipt: receiptByInv,
        po,
        lot,
        supplier: po ? this.state.suppliers.find(s => s.id === po.supplier_id || s.supplier_name === po.supplier_name) : null
      };
    }

    return null;
  }

  // --- Dashboard KPIs ---
  public getDashboardKPIs() {
    const pos = this.state.purchaseOrders;
    const closedPOs = pos.filter(p => p.is_closed || p.status === 'Closed');
    const openPOs = pos.filter(p => !p.is_closed && p.status !== 'Closed' && p.status !== 'Received');
    const activePOs = pos.filter(p => !p.is_closed && p.status !== 'Closed');
    
    let totalOrd = 0;
    let totalRecd = 0;
    let totalBal = 0;
    let totalPendVal = 0;

    let activeOrd = 0;
    let activeRecd = 0;
    let activeBal = 0;
    let activePendVal = 0;

    let closedOrd = 0;
    let closedRecd = 0;

    let totalPhysicalShort = 0;
    let totalCarriedForward = 0;
    let totalWaived = 0;

    let overdueCount = 0;
    let overRecdCount = 0;
    let expectedSoonCount = 0;

    const today = new Date('2026-09-28');
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const po of pos) {
      const isClosed = po.is_closed || po.status === 'Closed';
      const ord = po.total_ordered_qty || 0;
      const recd = po.total_received_qty || 0;
      const bal = po.total_balance_qty || 0;
      const val = po.total_pending_value || 0;

      totalOrd += ord;
      totalRecd += recd;
      totalBal += bal;
      totalPendVal += val;

      totalPhysicalShort += (po.total_physical_short_qty || 0);
      totalCarriedForward += (po.total_carried_forward_qty || 0);
      totalWaived += (po.total_waived_qty || 0);

      if (isClosed) {
        closedOrd += ord;
        closedRecd += recd;
      } else {
        activeOrd += ord;
        activeRecd += recd;
        activeBal += bal;
        activePendVal += val;

        for (const item of (po.items || [])) {
          if (item.status === 'Over Received') overRecdCount++;
          if (item.is_overdue) overdueCount++;

          if (item.expected_delivery_date && (item.balance_quantity || 0) > 0) {
            const d = new Date(item.expected_delivery_date);
            if (d >= today && d <= in30Days) expectedSoonCount++;
          }
        }
      }
    }

    // Active Supplier Breakdown (for pending balance)
    const supplierStats: Record<string, { ordered: number; received: number; pending: number }> = {};
    for (const po of activePOs) {
      const s = po.supplier_name || 'Other';
      if (!supplierStats[s]) supplierStats[s] = { ordered: 0, received: 0, pending: 0 };
      supplierStats[s].ordered += po.total_ordered_qty || 0;
      supplierStats[s].received += po.total_received_qty || 0;
      supplierStats[s].pending += Math.max(0, po.total_balance_qty || 0);
    }

    // Active Grade Breakdown
    const gradeStats: Record<string, number> = {};
    for (const po of activePOs) {
      for (const item of (po.items || [])) {
        const g = item.grade_code || 'Other';
        gradeStats[g] = (gradeStats[g] || 0) + Math.max(0, item.balance_quantity || 0);
      }
    }

    return {
      totalOpenPOs: openPOs.length,
      totalActivePOs: activePOs.length,
      totalClosedPOs: closedPOs.length,
      totalPOs: pos.length,
      totalOrderedQty: totalOrd,
      totalReceivedQty: totalRecd,
      totalPendingQty: totalBal,
      totalPhysicalShortQty: totalPhysicalShort,
      totalCarriedForwardQty: totalCarriedForward,
      totalWaivedQty: totalWaived,
      totalActionablePendingQty: totalBal,
      pendingPurchaseValue: activePendVal,
      activeOrderedQty: activeOrd,
      activeReceivedQty: activeRecd,
      activePendingQty: activeBal,
      closedOrderedQty: closedOrd,
      closedReceivedQty: closedRecd,
      overdueItems: overdueCount,
      overReceivedItems: overRecdCount,
      ordersExpectedSoon: expectedSoonCount,
      supplierStats: Object.entries(supplierStats).map(([name, data]) => ({ name, ...data })),
      gradeStats: Object.entries(gradeStats).map(([grade, pending]) => ({ grade, pending })).sort((a, b) => b.pending - a.pending).slice(0, 8),
    };
  }

  // --- Audit Log ---
  public addAuditLog(action: string, entity_type: string, entity_id: string, remarks: string) {
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      user_name: 'Current User (Operations)',
      action,
      entity_type,
      entity_id,
      entity_display: remarks,
      remarks,
      created_at: new Date().toISOString()
    };
    this.state.auditLogs.unshift(log);
  }

  public getAuditLogs() {
    return this.state.auditLogs;
  }

  // --- Incoming Stock & In-Transit Tracking ---
  public linkIncomingStockWithPOs() {
    if (!Array.isArray(this.state.incomingStock)) {
      this.state.incomingStock = [];
      return;
    }

    function canonicalGradeKey(g?: string | null): string {
      if (!g) return '';
      const clean = String(g).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean === 'c45' || clean === 'c50' || clean === '1045' || clean === '1050' || clean === 'en8' || clean === 'en9') {
        return 'c45_c50';
      }
      return clean;
    }

    const activeGradeMap = new Map<string, { po_number: string; po_id: string; is_closed: boolean }>();
    const activeLotMap = new Map<string, { po_number: string; po_id: string; is_closed: boolean }>();
    const closedGradeMap = new Map<string, { po_number: string; po_id: string; is_closed: boolean }>();
    const closedLotMap = new Map<string, { po_number: string; po_id: string; is_closed: boolean }>();

    for (const po of this.state.purchaseOrders) {
      const isClosed = Boolean(po.is_closed);
      if (po.items) {
        for (const item of po.items) {
          if (item.lot_number) {
            const lot = String(item.lot_number).trim();
            const gKey = canonicalGradeKey(item.grade_code);
            const entry = { po_number: po.po_number, po_id: po.id, is_closed: isClosed };
            if (isClosed) {
              if (gKey) closedGradeMap.set(`${lot}:::${gKey}`, entry);
              if (!closedLotMap.has(lot)) closedLotMap.set(lot, entry);
            } else {
              if (gKey) activeGradeMap.set(`${lot}:::${gKey}`, entry);
              if (!activeLotMap.has(lot)) activeLotMap.set(lot, entry);
            }
          }
        }
      }
    }

    for (const rc of this.state.receipts) {
      if (rc.lot_number && rc.po_number) {
        const lot = String(rc.lot_number).trim();
        const foundPo = this.state.purchaseOrders.find(p => p.po_number === rc.po_number);
        const isClosed = Boolean(foundPo?.is_closed);
        const entry = { po_number: rc.po_number, po_id: foundPo?.id || '', is_closed: isClosed };
        if (isClosed) {
          if (!closedLotMap.has(lot)) closedLotMap.set(lot, entry);
        } else {
          if (!activeLotMap.has(lot)) activeLotMap.set(lot, entry);
        }
      }
    }

    for (const inc of this.state.incomingStock) {
      const lot = String(inc.lot_number || '').trim();
      const gKey = canonicalGradeKey(inc.grade || (inc as any).grade_code);
      let match: { po_number: string; po_id: string; is_closed: boolean } | undefined;

      // 1. Prioritize active PO with matching lot and grade
      if (gKey && activeGradeMap.has(`${lot}:::${gKey}`)) {
        match = activeGradeMap.get(`${lot}:::${gKey}`);
      }
      // 2. Closed PO with matching lot and grade
      else if (gKey && closedGradeMap.has(`${lot}:::${gKey}`)) {
        match = closedGradeMap.get(`${lot}:::${gKey}`);
      }
      // 3. Active PO with matching lot only
      else if (activeLotMap.has(lot)) {
        match = activeLotMap.get(lot);
      }
      // 4. Closed PO with matching lot only
      else if (closedLotMap.has(lot)) {
        match = closedLotMap.get(lot);
      }

      if (match) {
        inc.linked_po_number = match.po_number;
        inc.linked_po_id = match.po_id;
      }
    }
  }

  public getIncomingStock(filters?: { 
    status?: 'IN_TRANSIT' | 'READY' | 'RECEIVED' | 'ALL'; 
    search?: string; 
    port?: string; 
    supplier?: string; 
    lot?: string;
  }): IncomingStockItem[] {
    const seenIds = new Set<string>();
    const uniqueRaw: IncomingStockItem[] = [];
    for (const item of (this.state.incomingStock || [])) {
      const key = item.id ? String(item.id).trim() : `inc-${Math.random()}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      uniqueRaw.push(item);
    }
    let items = uniqueRaw;

    if (filters?.status && filters.status !== 'ALL') {
      items = items.filter(i => i.received_status === filters.status);
    }

    if (filters?.port && filters.port !== 'ALL') {
      items = items.filter(i => (i.port || '').toLowerCase() === filters.port?.toLowerCase());
    }

    if (filters?.supplier && filters.supplier !== 'ALL') {
      items = items.filter(i => (i.supplier || (i as any).supplier_name || '').toLowerCase() === filters.supplier?.toLowerCase());
    }

    if (filters?.lot) {
      items = items.filter(i => (i.lot_number || '').includes(filters.lot!));
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      items = items.filter(i => 
        (i.lot_number && i.lot_number.toLowerCase().includes(q)) ||
        ((i.supplier || (i as any).supplier_name) && (i.supplier || (i as any).supplier_name).toLowerCase().includes(q)) ||
        ((i.grade || (i as any).grade_code) && (i.grade || (i as any).grade_code).toLowerCase().includes(q)) ||
        (i.make && i.make.toLowerCase().includes(q)) ||
        (i.port && i.port.toLowerCase().includes(q)) ||
        ((i.heat_no || (i as any).heat_number) && (i.heat_no || (i as any).heat_number).toLowerCase().includes(q)) ||
        (i.linked_po_number && i.linked_po_number.toLowerCase().includes(q))
      );
    }

    return items;
  }

  public getIncomingStockItem(id: string): IncomingStockItem | undefined {
    return (this.state.incomingStock || []).find(i => i.id === id);
  }

  public getIncomingStockByLot(lotNumber: string): IncomingStockItem[] {
    const key = String(lotNumber).trim();
    return (this.state.incomingStock || []).filter(i => String(i.lot_number).trim() === key);
  }

  public getIncomingStockForPO(poNumber: string): IncomingStockItem[] {
    const key = String(poNumber).trim();
    return (this.state.incomingStock || []).filter(i => String(i.linked_po_number).trim() === key);
  }

  public getIncomingStockSummary() {
    const all = this.state.incomingStock || [];
    const inTransit = all.filter(i => i.received_status === 'IN_TRANSIT');
    const received = all.filter(i => i.received_status === 'RECEIVED');

    const totalTransitWeight = inTransit.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);
    const totalReceivedWeight = received.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);
    const transitLots = Array.from(new Set(inTransit.map(i => i.lot_number))).filter(Boolean);
    const receivedLots = Array.from(new Set(received.map(i => i.lot_number))).filter(Boolean);

    const now = new Date();
    const imminentThreshold = new Date();
    imminentThreshold.setDate(imminentThreshold.getDate() + 14);

    let imminentCount = 0;
    let overdueTransitCount = 0;

    for (const item of inTransit) {
      if (item.eta_seaport) {
        const etaDate = new Date(item.eta_seaport);
        if (!isNaN(etaDate.getTime())) {
          if (etaDate < now) {
            overdueTransitCount++;
          } else if (etaDate <= imminentThreshold) {
            imminentCount++;
          }
        }
      }
    }

    // Port breakdown
    const portMap: Record<string, { count: number; weight: number; lots: Set<string>; imminentCount: number; overdueCount: number }> = {};
    for (const item of inTransit) {
      const port = item.port || 'Unassigned';
      if (!portMap[port]) {
        portMap[port] = { count: 0, weight: 0, lots: new Set<string>(), imminentCount: 0, overdueCount: 0 };
      }
      portMap[port].count++;
      portMap[port].weight += Number(item.weight) || 0;
      if (item.lot_number) portMap[port].lots.add(item.lot_number);

      if (item.eta_seaport) {
        const etaDate = new Date(item.eta_seaport);
        if (!isNaN(etaDate.getTime())) {
          if (etaDate < now) {
            portMap[port].overdueCount++;
          } else if (etaDate <= imminentThreshold) {
            portMap[port].imminentCount++;
          }
        }
      }
    }

    const ready = all.filter(i => i.received_status === 'READY');
    const totalReadyWeight = ready.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);
    const readyLots = Array.from(new Set(ready.map(i => i.lot_number))).filter(Boolean);

    return {
      totalInTransitItems: inTransit.length,
      totalInTransitWeight: totalTransitWeight,
      uniqueTransitLots: transitLots.length,
      totalReadyItems: ready.length,
      totalReadyWeight: totalReadyWeight,
      uniqueReadyLots: readyLots.length,
      totalReceivedItems: received.length,
      totalReceivedWeight: totalReceivedWeight,
      uniqueReceivedLots: receivedLots.length,
      imminentArrivals: imminentCount,
      overdueTransitCount,
      portStats: Object.entries(portMap).map(([port, data]) => ({
        port,
        count: data.count,
        weight: data.weight,
        uniqueLots: data.lots.size,
        imminentCount: data.imminentCount,
        overdueCount: data.overdueCount
      })).sort((a, b) => b.weight - a.weight)
    };
  }

  public markIncomingStockReceived(id: string, options?: { receipt_date?: string; location?: string }): { success: boolean; item?: IncomingStockItem; receipt?: Receipt; error?: string } {
    const item = (this.state.incomingStock || []).find(i => i.id === id);
    if (!item) return { success: false, error: 'Item not found' };

    item.received_status = 'RECEIVED';
    item.source_sheet = 'INCOMING CLOSE';

    let createdReceipt: Receipt | undefined;
    const receiptDate = options?.receipt_date || new Date().toISOString().split('T')[0];

    // Check if linked to PO
    if (item.linked_po_number) {
      const po = this.state.purchaseOrders.find(p => p.po_number === item.linked_po_number || p.id === item.linked_po_id);
      if (po && po.items && po.items.length > 0) {
        const matchedItem = po.items.find(pi => 
          (item.grade && pi.grade_code && pi.grade_code.toLowerCase().includes(item.grade.toLowerCase())) ||
          (item.lot_number && pi.lot_number === item.lot_number)
        ) || po.items[0];

        const receiptNum = `REC-${po.po_number}-${(po.items.reduce((acc, it) => acc + (it.receipts?.length || 0), 0) + 1).toString().padStart(2, '0')}`;
        createdReceipt = {
          id: `rec-inc-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          purchase_order_item_id: matchedItem.id,
          po_number: po.po_number,
          lot_id: `lot-${item.lot_number}`,
          lot_number: item.lot_number,
          receipt_number: receiptNum,
          receipt_date: receiptDate,
          received_quantity: Number(item.weight) || 0,
          unit: 'KG',
          supplier_invoice_number: item.heat_no ? `HEAT-${item.heat_no}` : undefined,
          remarks: `Received at port ${item.port || 'Port'} from vessel transit`,
          legacy_source_sheet: 'INCOMING CLOSE',
          created_at: new Date().toISOString()
        };

        if (!matchedItem.receipts) matchedItem.receipts = [];
        matchedItem.receipts.push(createdReceipt);
        this.state.receipts.unshift(createdReceipt);
        item.linked_receipt_id = createdReceipt.id;

        // Update or create inventory Lot
        let existingLot = this.state.lots.find(l => l.lot_number === item.lot_number);
        if (existingLot) {
          existingLot.total_received_qty += Number(item.weight) || 0;
          existingLot.available_qty += Number(item.weight) || 0;
          if (existingLot.available_qty > 0) existingLot.status = 'Available';
        } else {
          const dimParts = [item.dia_w ? `DIA ${item.dia_w}` : '', item.t ? `T${item.t}` : '', item.l ? `L${item.l}` : ''].filter(Boolean).join(' × ');
          existingLot = {
            id: `lot-${item.lot_number}`,
            lot_number: item.lot_number,
            purchase_order_item_id: matchedItem.id,
            po_number: po.po_number,
            supplier_name: item.supplier,
            grade_code: item.grade,
            section_name: item.dia_w ? 'Round' : 'Block',
            dimensions_display: dimParts || undefined,
            total_received_qty: Number(item.weight) || 0,
            total_allocated_sold_qty: 0,
            available_qty: Number(item.weight) || 0,
            warehouse_location: options?.location || 'Main Yard (Port Arrival)',
            status: 'Available',
            created_at: new Date().toISOString()
          };
          this.state.lots.unshift(existingLot);
        }

        // Ledger transaction
        this.state.inventoryTransactions.unshift({
          id: `tx-inc-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          lot_id: existingLot.id,
          lot_number: item.lot_number,
          transaction_type: 'PURCHASE_RECEIPT',
          quantity: Number(item.weight) || 0,
          reference_type: 'receipts',
          reference_id: createdReceipt.id,
          reference_display: `PO ${po.po_number} / Lot ${item.lot_number}`,
          transaction_date: receiptDate,
          remarks: `Physical stock received from sea port (${item.port || 'Port'})`,
          created_at: new Date().toISOString()
        });

        matchedItem.status = 'Received';
        this.recomputePOAggregates(po);
      }
    }

    this.addAuditLog(
      'INCOMING_STOCK_RECEIVED',
      'INCOMING_STOCK',
      item.id,
      `Marked Lot ${item.lot_number} (${item.weight} KG) as RECEIVED at warehouse.`
    );

    this.save();
    return { success: true, item, receipt: createdReceipt };
  }

  public updateIncomingStockItem(
    id: string,
    updates: Partial<IncomingStockItem>
  ): IncomingStockItem {
    const item = (this.state.incomingStock || []).find(i => i.id === id);
    if (!item) throw new Error(`Incoming stock item ${id} not found`);

    if (updates.grade !== undefined) {
      item.grade = String(updates.grade).trim();
      item.grade_code = item.grade;
    }
    if (updates.make !== undefined) item.make = String(updates.make).trim();
    if (updates.supplier !== undefined) {
      item.supplier = String(updates.supplier).trim();
      item.supplier_name = item.supplier;
    }
    if (updates.lot_number !== undefined) item.lot_number = String(updates.lot_number).trim();
    if (updates.condition !== undefined) item.condition = updates.condition ? String(updates.condition).trim() : null;
    if (updates.dia_w !== undefined) item.dia_w = updates.dia_w !== null && updates.dia_w !== ('' as any) ? Number(updates.dia_w) : null;
    if (updates.t !== undefined) item.t = updates.t !== null && updates.t !== ('' as any) ? Number(updates.t) : null;
    if (updates.l !== undefined) item.l = updates.l !== null && updates.l !== ('' as any) ? Number(updates.l) : null;
    if (updates.pieces !== undefined) item.pieces = updates.pieces !== null && updates.pieces !== ('' as any) ? Number(updates.pieces) : null;
    if (updates.weight !== undefined) item.weight = Number(updates.weight) || 0;
    if (updates.port !== undefined) item.port = updates.port ? String(updates.port).trim() : null;
    if (updates.date_of_shipment !== undefined) item.date_of_shipment = updates.date_of_shipment || null;
    if (updates.eta_seaport !== undefined) item.eta_seaport = updates.eta_seaport || null;
    if (updates.received_status !== undefined) item.received_status = updates.received_status;
    if (updates.heat_no !== undefined) {
      item.heat_no = updates.heat_no ? String(updates.heat_no).trim() : null;
      item.heat_number = item.heat_no;
    }
    if (updates.sims !== undefined) item.sims = updates.sims ? String(updates.sims).trim() : null;
    if (updates.delivery_terms !== undefined) item.delivery_terms = updates.delivery_terms;
    if (updates.payment_terms !== undefined) item.payment_terms = updates.payment_terms;
    if (updates.container_no !== undefined) item.container_no = updates.container_no ? String(updates.container_no).trim() : null;
    if (updates.port_of_loading !== undefined) item.port_of_loading = updates.port_of_loading ? String(updates.port_of_loading).trim() : null;
    if (updates.hsn_code !== undefined) item.hsn_code = updates.hsn_code ? String(updates.hsn_code).trim() : null;
    if (updates.price !== undefined) item.price = updates.price !== null && updates.price !== ('' as any) ? Number(updates.price) : null;
    if (updates.currency !== undefined) item.currency = updates.currency;
    if (updates.linked_po_number !== undefined) {
      item.linked_po_number = updates.linked_po_number ? String(updates.linked_po_number).trim() : null;
    }

    this.linkIncomingStockWithPOs();

    this.addAuditLog(
      'INCOMING_STOCK_UPDATE',
      'INCOMING_STOCK',
      item.id,
      `Updated incoming stock item Lot ${item.lot_number} (${item.grade}, ${item.weight} KG, port ${item.port || 'N.S.'})`
    );

    this.save();
    return item;
  }

  public deleteIncomingStockItem(id: string): boolean {
    const idx = (this.state.incomingStock || []).findIndex(i => i.id === id);
    if (idx === -1) return false;
    const removed = this.state.incomingStock[idx];
    this.state.incomingStock.splice(idx, 1);
    this.linkIncomingStockWithPOs();
    this.addAuditLog(
      'INCOMING_STOCK_DELETE',
      'INCOMING_STOCK',
      id,
      `Deleted incoming stock item Lot ${removed.lot_number} (${removed.grade})`
    );
    this.save();
    return true;
  }

  public importIncomingStock(items: IncomingStockItem[]): { added: number; updated: number } {
    if (!Array.isArray(this.state.incomingStock)) {
      this.state.incomingStock = [];
    }

    let added = 0;
    let updated = 0;

    for (const newItem of items) {
      const normalized = normalizeIncomingStockItem(newItem);
      const existingIdx = this.state.incomingStock.findIndex(i => i.id === normalized.id);
      if (existingIdx >= 0) {
        this.state.incomingStock[existingIdx] = { ...this.state.incomingStock[existingIdx], ...normalized };
        updated++;
      } else {
        this.state.incomingStock.unshift(normalized);
        added++;
      }
    }

    this.linkIncomingStockWithPOs();
    this.addAuditLog(
      'INCOMING_STOCK_IMPORTED',
      'INCOMING_STOCK',
      `batch-${Date.now()}`,
      `Imported/synchronized ${added} new items and updated ${updated} items from INCOMING STOCK Excel.`
    );
    this.save();
    return { added, updated };
  }

  public purgeAllData(): void {
    this.deletedPoIds.clear();
    this.deletedReceiptIds.clear();
    this.state = getInitialState();
    this.addAuditLog(
      'DATABASE_PURGE',
      'SYSTEM',
      'clean-purge',
      'All data purged from system by administrator for bulk upload.'
    );
    this.save();
    this.pushToCloud();
  }

  public bulkImportData(payload: {
    purchaseOrders?: PurchaseOrder[];
    receipts?: Receipt[];
    incomingStock?: IncomingStockItem[];
  }): { poCount: number; receiptCount: number; stockCount: number } {
    if (Array.isArray(payload.purchaseOrders) && payload.purchaseOrders.length > 0) {
      const existingMap = new Map(this.state.purchaseOrders.map(p => [p.po_number, p]));
      for (const po of payload.purchaseOrders) {
        existingMap.set(po.po_number, po);
      }
      this.state.purchaseOrders = Array.from(existingMap.values());
    }

    if (Array.isArray(payload.receipts) && payload.receipts.length > 0) {
      const existingRcs = new Map(this.state.receipts.map(r => [r.id, r]));
      for (const rc of payload.receipts) {
        existingRcs.set(rc.id, rc);
      }
      this.state.receipts = Array.from(existingRcs.values());
    }

    if (Array.isArray(payload.incomingStock) && payload.incomingStock.length > 0) {
      const existingInc = new Map(this.state.incomingStock.map(i => [i.id, i]));
      for (const inc of payload.incomingStock) {
        existingInc.set(inc.id, normalizeIncomingStockItem(inc));
      }
      this.state.incomingStock = Array.from(existingInc.values());
    }

    // Link incoming stock & recompute PO aggregates
    this.linkIncomingStockWithPOs();
    for (const po of this.state.purchaseOrders) {
      this.recomputePOAggregates(po);
    }

    // Refresh suppliers list
    const supSet = new Set(this.state.suppliers.map(s => canonicalSupplierKey(s.supplier_name)));
    for (const po of this.state.purchaseOrders) {
      if (!po.supplier_name) continue;
      const key = canonicalSupplierKey(po.supplier_name);
      if (!supSet.has(key)) {
        supSet.add(key);
        this.state.suppliers.push({
          id: `sup-${key}`,
          supplier_name: po.supplier_name,
          country: po.origin || 'International',
          status: 'active'
        });
      }
    }

    this.addAuditLog(
      'BULK_IMPORT',
      'SYSTEM',
      'bulk-upload',
      `Bulk uploaded ${payload.purchaseOrders?.length || 0} POs, ${payload.receipts?.length || 0} receipts, and ${payload.incomingStock?.length || 0} incoming stock items.`
    );

    this.save();
    this.pushToCloud();

    return {
      poCount: payload.purchaseOrders?.length || 0,
      receiptCount: payload.receipts?.length || 0,
      stockCount: payload.incomingStock?.length || 0
    };
  }
}


// Global Singleton
export const dataStore = new Store();
