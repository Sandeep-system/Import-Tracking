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
  ResolutionStatus
} from '@/types';
import initialDataRaw from './initialData.json';
import { googleSync } from './googleSync';

const STORAGE_KEY = 'IMPORT_TRACKING_SYSTEM_DATA_V7';
const PREV_STORAGE_KEY = 'IMPORT_TRACKING_SYSTEM_DATA_V6';

export interface DataState {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  customers: Customer[];
  lots: Lot[];
  receipts: Receipt[];
  inventoryTransactions: InventoryTransaction[];
  customerAllocations: CustomerAllocation[];
  sales: Sale[];
  auditLogs: AuditLog[];
  balanceResolutions: BalanceResolution[];
}

function getInitialState(): DataState {
  const defaultSuppliers: Supplier[] = initialDataRaw.suppliers as unknown as Supplier[];
  const defaultPOs: PurchaseOrder[] = initialDataRaw.purchaseOrders as unknown as PurchaseOrder[];
  const defaultLots: Lot[] = initialDataRaw.lots as unknown as Lot[];
  const defaultReceipts: Receipt[] = initialDataRaw.receipts as unknown as Receipt[];

  // Generate initial inventory transactions from existing receipts
  const defaultTransactions: InventoryTransaction[] = defaultReceipts.map((rc, idx) => ({
    id: `tx-${idx + 1}`,
    lot_id: rc.lot_id || `lot-${rc.lot_number || 'default'}`,
    lot_number: rc.lot_number || 'UNASSIGNED',
    transaction_type: 'PURCHASE_RECEIPT',
    quantity: rc.received_quantity,
    reference_type: 'receipts',
    reference_id: rc.id,
    reference_display: `PO ${rc.po_number} Receipt ${rc.receipt_number}`,
    transaction_date: rc.receipt_date,
    remarks: `Initial import from invoice ${rc.supplier_invoice_number || 'N/A'}`,
    created_at: new Date().toISOString()
  }));

  // Initial customers based on Excel analysis
  const defaultCustomers: Customer[] = [
    { id: 'cust-1', customer_code: 'SE', customer_name: 'Sandeep Edgetech (Self)', contact_person: 'Head Office / Self', phone: '+91 98200 11111', status: 'active' },
    { id: 'cust-2', customer_code: 'BM', customer_name: 'BM Trading Division', contact_person: 'Procurement Lead', phone: '+91 98200 22222', status: 'active' },
    { id: 'cust-3', customer_code: 'CUST-003', customer_name: 'Omkara Steels Pvt Ltd', contact_person: 'Mr. Sharma', phone: '+91 98200 33333', status: 'active' },
    { id: 'cust-4', customer_code: 'CUST-004', customer_name: 'Global Aluminium Ltd', contact_person: 'Mr. Patel', phone: '+91 98200 44444', status: 'active' },
    { id: 'cust-5', customer_code: 'CUST-005', customer_name: 'Interplast Industries', contact_person: 'Director Operations', phone: '+91 98200 55555', status: 'active' },
  ];

  const defaultAuditLogs: AuditLog[] = [
    {
      id: 'log-1',
      action: 'SYSTEM_INIT',
      entity_type: 'SYSTEM',
      entity_id: 'init',
      entity_display: 'Import Tracking System',
      remarks: 'Initialized system with 394 POs (376 Closed + 18 Active) and 7,208 verified receipts from workbook.',
      created_at: new Date().toISOString()
    }
  ];

  return {
    purchaseOrders: defaultPOs,
    suppliers: defaultSuppliers,
    customers: defaultCustomers,
    lots: defaultLots,
    receipts: defaultReceipts,
    inventoryTransactions: defaultTransactions,
    customerAllocations: [],
    sales: [],
    auditLogs: defaultAuditLogs,
    balanceResolutions: []
  };
}

class Store {
  private state: DataState;

  constructor() {
    this.state = getInitialState();
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PREV_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Ensure we have the full dataset including historical closed orders
          if (
            parsed && 
            Array.isArray(parsed.purchaseOrders) && 
            parsed.purchaseOrders.length >= initialDataRaw.purchaseOrders.length
          ) {
            this.state = parsed;
            if (!Array.isArray(this.state.balanceResolutions)) {
              this.state.balanceResolutions = [];
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
          } else {
            // Outdated cache with fewer POs, re-populate full dataset
            this.state = getInitialState();
          }
        }
        // Initialize balance and resolution aggregates across all loaded POs
        for (const po of this.state.purchaseOrders) {
          this.recomputePOAggregates(po);
        }
        this.save({ skipAutoSync: true });
      } catch (e) {
        console.error('Failed to load local storage:', e);
      }
    }
  }

  public getOperationalPurchaseOrders(): PurchaseOrder[] {
    return this.state.purchaseOrders.filter(
      p => !p.is_closed || Number(p.po_number) >= 1093 || isNaN(Number(p.po_number)) || p.id.startsWith('po-')
    );
  }

  private save(options: { skipAutoSync?: boolean } = {}) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        window.dispatchEvent(new CustomEvent('app:data-updated'));
        if (!options.skipAutoSync) {
          googleSync.queueAutoSync(this.getOperationalPurchaseOrders());
        }
      } catch (e) {
        console.error('Failed to save to local storage:', e);
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
    let list = [...this.state.purchaseOrders];
    if (filter) {
      if (filter.status && filter.status !== 'all') {
        list = list.filter(po => po.status.toLowerCase() === filter.status?.toLowerCase());
      }
      if (filter.supplier && filter.supplier !== 'all') {
        list = list.filter(po => po.supplier_name?.toLowerCase().includes(filter.supplier!.toLowerCase()));
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
      remarks: params.remarks,
      created_at: new Date().toISOString()
    };

    if (!item.receipts) item.receipts = [];
    item.receipts.push(newReceipt);
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

    // Recompute Item & PO Quantities, Physical Shortage, and Statuses
    this.recomputePOAggregates(po);

    this.addAuditLog(
      'RECEIPT_ENTRY', 
      'receipts', 
      newReceipt.id, 
      `Received ${qty} KG for PO ${po.po_number} (Item #${item.line_number}) into Lot ${lot.lot_number}`
    );
    this.save();

    return { receipt: newReceipt, updatedItem: item, updatedPO: po };
  }

  // --- Bulk Receipts & Multi-Item Edit Workflow ---
  public addBulkReceipt(params: {
    poIdOrNumber: string;
    itemIds: string[];
    lotNumber: string;
    supplierInvoice: string;
    supplierInvoiceDate?: string;
    receiptDate?: string;
    warehouseLocation?: string;
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
        remarks: params.remarks,
        created_at: new Date().toISOString()
      };

      if (!item.receipts) item.receipts = [];
      item.receipts.push(newReceipt);
      this.state.receipts.push(newReceipt);
      createdReceipts.push(newReceipt);

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
      if (!item || !item.receipts) continue;

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
    item.physical_short_qty = Math.max(0, item.ordered_quantity - totalRecd);

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

    // Status logic matching Section 8
    if (item.ordered_quantity <= totalRecd) {
      if (totalRecd === item.ordered_quantity) {
        item.status = 'Received';
      } else {
        item.status = 'Over Received';
      }
    } else {
      if (actionablePending === 0) {
        if (cfQty > 0 && wQty > 0) {
          item.status = 'Closed — Balance Resolved';
        } else if (cfQty > 0) {
          item.status = 'Closed — Balance Carried Forward';
        } else if (wQty > 0) {
          item.status = 'Closed — Short Received';
        } else if (totalRecd === 0) {
          item.status = 'Closed';
        } else {
          item.status = 'Closed — Fully Received';
        }
      } else if (resolvedQty > 0) {
        item.status = 'Partially Resolved';
      } else if (totalRecd > 0) {
        item.status = 'Partially Received';
      } else {
        item.status = 'Open';
      }
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
    po.total_physical_short_qty = po.items.reduce((acc, i) => acc + (i.physical_short_qty || 0), 0);
    po.total_carried_forward_qty = po.items.reduce((acc, i) => acc + (i.carried_forward_qty || 0), 0);
    po.total_waived_qty = po.items.reduce((acc, i) => acc + (i.waived_qty || 0), 0);
    po.total_actionable_pending_qty = po.items.reduce((acc, i) => acc + (i.actionable_pending_qty || 0), 0);
    po.total_balance_qty = po.total_actionable_pending_qty;
    po.total_order_value = po.items.reduce((acc, i) => acc + ((i.ordered_quantity || 0) * (i.purchase_price || 0)), 0);
    po.total_pending_value = po.items.reduce((acc, i) => acc + ((i.actionable_pending_qty || 0) * (i.purchase_price || 0)), 0);

    if (po.is_closed) {
      po.status = 'Closed';
    } else if (po.total_actionable_pending_qty === 0) {
      if (po.total_waived_qty > 0 && po.total_carried_forward_qty > 0) {
        po.status = 'Closed — Balance Resolved';
      } else if (po.total_carried_forward_qty > 0) {
        po.status = 'Closed — Balance Carried Forward';
      } else if (po.total_waived_qty > 0) {
        po.status = 'Closed — Short Received';
      } else {
        po.status = 'Received';
      }
    } else if (po.items.some(i => (i.carried_forward_qty || 0) > 0 || (i.waived_qty || 0) > 0)) {
      po.status = 'Partially Resolved';
    } else if (po.total_received_qty > 0) {
      po.status = 'Partially Received';
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
    let list = [...this.state.lots];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => 
        l.lot_number.toLowerCase().includes(q) ||
        l.grade_code?.toLowerCase().includes(q) ||
        l.po_number?.toLowerCase().includes(q) ||
        l.supplier_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }

  public getLotHistory(lotId: string): InventoryTransaction[] {
    return this.state.inventoryTransactions.filter(tx => tx.lot_id === lotId || tx.lot_number === lotId);
  }

  // --- Suppliers & Customers ---
  public getSuppliers() {
    return this.state.suppliers;
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
}

// Global Singleton
export const dataStore = new Store();
