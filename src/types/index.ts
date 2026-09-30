export type POStatus = 
  | 'Draft' 
  | 'Open' 
  | 'Partially Received' 
  | 'Received' 
  | 'Over Received' 
  | 'Closed' 
  | 'Cancelled'
  | 'Partially Resolved'
  | 'Closed — Fully Received'
  | 'Closed — Short Received'
  | 'Closed — Balance Carried Forward'
  | 'Closed — Balance Resolved';

export type ItemStatus = 
  | 'Open' 
  | 'Partially Received' 
  | 'Received' 
  | 'Over Received' 
  | 'Closed'
  | 'Partially Resolved'
  | 'Closed — Fully Received'
  | 'Closed — Short Received'
  | 'Closed — Balance Carried Forward'
  | 'Closed — Balance Resolved';

export type ResolutionType = 'CARRY_FORWARD' | 'WAIVED';
export type ResolutionStatus = 'ACTIVE' | 'REVERSED';

export interface BalanceResolution {
  id: string; // Permanent unique resolution ID
  po_item_id: string;
  po_number: string;
  resolution_type: ResolutionType;
  quantity: number;
  reason: string;
  remarks?: string | null;
  linked_po_item_id?: string | null;
  linked_po_number?: string | null;
  created_by: string;
  created_at: string;
  status: ResolutionStatus;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
}

export type LotStatus = 'Available' | 'Allocated' | 'Depleted' | 'On Hold';

export type TransactionType = 
  | 'PURCHASE_RECEIPT' 
  | 'SALE' 
  | 'CUSTOMER_ALLOCATION' 
  | 'ADJUSTMENT_IN' 
  | 'ADJUSTMENT_OUT' 
  | 'RETURN' 
  | 'TRANSFER';

export interface Supplier {
  id: string;
  supplier_code?: string | null;
  supplier_name: string;
  country?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  default_currency?: string | null;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: string;
  customer_code?: string | null;
  customer_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface MasterGrade {
  id: string;
  code: string;
  doc_grade_alias?: string | null;
  description?: string | null;
  status: 'active' | 'inactive';
}

export interface MasterCondition {
  id: string;
  name: string;
  description?: string | null;
}

export interface MasterMake {
  id: string;
  name: string;
  country?: string | null;
}

export interface MasterSection {
  id: string;
  name: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  order_date: string;
  supplier_id: string;
  supplier_name?: string | null;
  supplier_country?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  reference?: string | null;
  reference_person?: string | null;
  origin?: string | null;
  origin_make_id?: string | null;
  origin_make_name?: string | null;
  commission?: number | string | null;
  currency: string;
  payment_terms?: string | null;
  delivery_terms?: string | null;
  destination?: string | null;
  oc_number?: string | null;
  oc_date?: string | null;
  contract_delivery_date?: string | null;
  expected_delivery_date?: string | null;
  remarks?: string | null;
  status: POStatus;
  is_closed: boolean;
  close_reason?: string | null;
  legacy_source_sheet?: string | null;
  total_items?: number;
  total_ordered_qty?: number;
  total_received_qty?: number;
  total_balance_qty?: number;
  total_physical_short_qty?: number;
  total_carried_forward_qty?: number;
  total_waived_qty?: number;
  total_actionable_pending_qty?: number;
  total_order_value?: number;
  total_pending_value?: number;
  is_overdue?: boolean;
  days_overdue?: number;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  po_number?: string;
  line_number: number;
  grade_id?: string | null;
  grade_code: string;
  grade_doc?: string | null;
  section_id?: string | null;
  section_name: string;
  diameter_width?: number | null;
  thickness?: number | null;
  length?: number | null;
  treatment?: string | null;
  condition_id?: string | null;
  condition_name?: string | null;
  lot_number?: string | null;
  ordered_quantity: number;
  received_quantity?: number;
  balance_quantity?: number;
  physical_short_qty?: number;
  carried_forward_qty?: number;
  waived_qty?: number;
  actionable_pending_qty?: number;
  carried_forward_to_item_id?: string | null;
  created_from_item_id?: string | null;
  created_from_po_number?: string | null;
  unit: string;
  purchase_price: number;
  currency: string;
  expected_delivery_date?: string | null;
  commission_notes?: string | null;
  additional_terms?: string | null;
  remarks?: string | null;
  status: ItemStatus;
  is_overdue?: boolean;
  days_overdue?: number;
  receipt_count?: number;
  legacy_source_sheet?: string | null;
  legacy_excel_row?: number | null;
  receipts?: Receipt[];
  resolutions?: BalanceResolution[];
}

export interface Receipt {
  id: string;
  purchase_order_item_id: string;
  po_number?: string;
  shipment_id?: string | null;
  lot_id?: string | null;
  lot_number?: string | null;
  receipt_number: string;
  receipt_date: string;
  received_quantity: number;
  unit: string;
  supplier_invoice_number?: string | null;
  supplier_invoice_date?: string | null;
  raw_formula?: string | null;
  remarks?: string | null;
  created_by?: string | null;
  legacy_source_sheet?: string | null;
  legacy_excel_row?: number | null;
  created_at?: string;
}

export interface Lot {
  id: string;
  lot_number: string;
  purchase_order_item_id?: string | null;
  po_number?: string | null;
  supplier_name?: string | null;
  grade_code?: string | null;
  section_name?: string | null;
  dimensions_display?: string | null;
  total_received_qty: number;
  total_allocated_sold_qty: number;
  available_qty: number;
  warehouse_location: string;
  status: LotStatus;
  created_at?: string;
}

export interface InventoryTransaction {
  id: string;
  lot_id: string;
  lot_number?: string;
  transaction_type: TransactionType;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  reference_display?: string;
  transaction_date: string;
  remarks?: string;
  created_by?: string;
  created_at: string;
}

export interface CustomerAllocation {
  id: string;
  purchase_order_item_id: string;
  lot_id?: string | null;
  customer_id?: string | null;
  customer_name: string;
  allocated_quantity: number;
  sales_price_indication?: string | null;
  status: 'Allocated' | 'Invoiced' | 'Cancelled';
  created_at?: string;
}

export interface Sale {
  id: string;
  sales_invoice_number: string;
  sales_invoice_date: string;
  customer_id: string;
  customer_name?: string | null;
  payment_terms?: string | null;
  currency: string;
  status: 'Completed' | 'Pending' | 'Cancelled';
  total_amount?: number;
  items?: SaleItem[];
  created_at?: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  lot_id: string;
  lot_number?: string | null;
  purchase_order_item_id?: string | null;
  po_number?: string | null;
  grade_code?: string | null;
  quantity: number;
  sale_price: number;
  total_value: number;
}

export interface AuditLog {
  id: string;
  user_name?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_display?: string | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  remarks?: string | null;
  created_at: string;
}

export interface MigrationSummary {
  totalExcelRows: number;
  uniqueOrders: number;
  uniquePoItems: number;
  uniqueSuppliers: number;
  uniqueCustomers: number;
  uniqueLots: number;
  receiptsIdentified: number;
  overReceiptsCount: number;
  arithmeticCellsCount: number;
  needsReviewCount: number;
  formulaDummyCount: number;
  readyForImportCount: number;
}
