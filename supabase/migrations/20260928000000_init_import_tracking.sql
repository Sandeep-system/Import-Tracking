-- ============================================================================
-- IMPORT PURCHASE ORDER & MATERIAL TRACKING SYSTEM
-- Complete Supabase / PostgreSQL Schema & Migrations
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing if re-running
DROP VIEW IF EXISTS v_order_lot_summary CASCADE;
DROP VIEW IF EXISTS v_lot_inventory CASCADE;
DROP VIEW IF EXISTS v_purchase_order_summary CASCADE;
DROP VIEW IF EXISTS v_purchase_order_item_balances CASCADE;

-- ----------------------------------------------------------------------------
-- 1. MASTER REFERENCE TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS master_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    doc_grade_alias VARCHAR(100),
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_makes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    country VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. BUSINESS PARTNERS (Suppliers & Customers)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_code VARCHAR(50) UNIQUE,
    supplier_name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    contact_person VARCHAR(150),
    email VARCHAR(150),
    phone VARCHAR(50),
    address TEXT,
    payment_terms VARCHAR(100),
    default_currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code VARCHAR(50) UNIQUE,
    customer_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(150),
    email VARCHAR(150),
    phone VARCHAR(50),
    address TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. PURCHASE ORDERS & LINE ITEMS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(100) UNIQUE NOT NULL,
    order_date DATE NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    reference VARCHAR(150),
    origin_make_id UUID REFERENCES master_makes(id) ON DELETE SET NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    payment_terms VARCHAR(150),
    delivery_terms VARCHAR(100),
    destination VARCHAR(150),
    oc_number VARCHAR(100),
    oc_date DATE,
    contract_delivery_date DATE,
    expected_delivery_date DATE,
    remarks TEXT,
    status VARCHAR(50) DEFAULT 'Open',
    is_closed BOOLEAN DEFAULT false,
    close_reason TEXT,
    legacy_source_sheet VARCHAR(50),
    legacy_excel_row INTEGER,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    grade_id UUID REFERENCES master_grades(id) ON DELETE SET NULL,
    grade_name_raw VARCHAR(100),
    grade_doc VARCHAR(100),
    section_id UUID REFERENCES master_sections(id) ON DELETE SET NULL,
    section_raw VARCHAR(100),
    diameter_width NUMERIC(12, 3),
    thickness NUMERIC(12, 3),
    length NUMERIC(12, 3),
    treatment VARCHAR(100),
    condition_id UUID REFERENCES master_conditions(id) ON DELETE SET NULL,
    condition_raw VARCHAR(100),
    ordered_quantity NUMERIC(14, 3) NOT NULL,
    unit VARCHAR(10) DEFAULT 'KG',
    purchase_price NUMERIC(14, 4),
    currency VARCHAR(10) DEFAULT 'USD',
    expected_delivery_date DATE,
    commission_notes TEXT,
    additional_terms TEXT,
    remarks TEXT,
    status VARCHAR(50) DEFAULT 'Open',
    legacy_source_sheet VARCHAR(50),
    legacy_excel_row INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. SHIPMENTS, LOTS & PHYSICAL RECEIPTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    shipment_reference VARCHAR(150),
    supplier_invoice_number VARCHAR(100),
    supplier_invoice_date DATE,
    shipping_date DATE,
    expected_arrival_date DATE,
    actual_arrival_date DATE,
    destination VARCHAR(150),
    container_number VARCHAR(100),
    bl_number VARCHAR(100),
    vessel_details VARCHAR(150),
    status VARCHAR(50) DEFAULT 'Shipped',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_number VARCHAR(100) UNIQUE NOT NULL,
    purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    warehouse_location VARCHAR(150) DEFAULT 'Nhava Sheva Yard',
    status VARCHAR(50) DEFAULT 'Available',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_item_id UUID NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
    shipment_id UUID REFERENCES shipments(id) ON DELETE SET NULL,
    lot_id UUID REFERENCES lots(id) ON DELETE SET NULL,
    receipt_number VARCHAR(100) UNIQUE NOT NULL,
    receipt_date DATE NOT NULL,
    received_quantity NUMERIC(14, 3) NOT NULL,
    unit VARCHAR(10) DEFAULT 'KG',
    supplier_invoice_number VARCHAR(100),
    supplier_invoice_date DATE,
    raw_formula TEXT,
    remarks TEXT,
    created_by UUID,
    legacy_source_sheet VARCHAR(50),
    legacy_excel_row INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. INVENTORY MOVEMENTS & SALES TRACEABILITY
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- PURCHASE_RECEIPT, SALE, CUSTOMER_ALLOCATION, ADJUSTMENT_IN, ADJUSTMENT_OUT, RETURN, TRANSFER
    quantity NUMERIC(14, 3) NOT NULL,
    reference_type VARCHAR(50), -- receipts, sales_items, adjustments
    reference_id UUID,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    remarks TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_invoice_number VARCHAR(100) UNIQUE NOT NULL,
    sales_invoice_date DATE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    payment_terms VARCHAR(150),
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) DEFAULT 'Completed',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
    purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    quantity NUMERIC(14, 3) NOT NULL,
    sale_price NUMERIC(14, 4),
    total_value NUMERIC(16, 2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES lots(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name_raw VARCHAR(150),
    allocated_quantity NUMERIC(14, 3),
    sales_price_indication VARCHAR(150),
    status VARCHAR(50) DEFAULT 'Allocated',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. AUDIT LOGS & MIGRATION TRACKING
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name VARCHAR(150) NOT NULL,
    source_file VARCHAR(255) NOT NULL,
    source_sheet VARCHAR(100) NOT NULL,
    total_rows INTEGER DEFAULT 0,
    imported_rows INTEGER DEFAULT 0,
    review_needed_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES migration_batches(id) ON DELETE CASCADE,
    source_sheet VARCHAR(100),
    source_row_number INTEGER,
    raw_data JSONB,
    status VARCHAR(50) DEFAULT 'IMPORTED', -- IMPORTED, NEEDS_REVIEW, SKIPPED_DUMMY, ERROR
    validation_notes TEXT,
    target_po_id UUID,
    target_item_id UUID,
    target_receipt_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. INDEXES FOR HIGH-PERFORMANCE GLOBAL SEARCH & FILTERS
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_poi_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_grade_id ON purchase_order_items(grade_id);
CREATE INDEX IF NOT EXISTS idx_receipts_poi_id ON receipts(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_receipts_lot_id ON receipts(lot_id);
CREATE INDEX IF NOT EXISTS idx_receipts_inv_number ON receipts(supplier_invoice_number);
CREATE INDEX IF NOT EXISTS idx_lots_number ON lots(lot_number);
CREATE INDEX IF NOT EXISTS idx_inv_tx_lot_id ON inventory_transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_sales_inv_number ON sales(sales_invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_items_lot_id ON sales_items(lot_id);

-- ----------------------------------------------------------------------------
-- 8. DYNAMIC CALCULATION VIEWS (Zero Stored Calculation Fragility)
-- ----------------------------------------------------------------------------

-- View: Calculated Balances and Status for PO Items
CREATE OR REPLACE VIEW v_purchase_order_item_balances AS
SELECT 
    poi.id AS item_id,
    poi.purchase_order_id,
    po.po_number,
    po.order_date,
    po.supplier_id,
    sup.supplier_name,
    poi.line_number,
    poi.grade_id,
    mg.code AS grade_code,
    COALESCE(poi.grade_doc, mg.doc_grade_alias) AS grade_doc,
    poi.section_id,
    ms.name AS section_name,
    poi.diameter_width,
    poi.thickness,
    poi.length,
    poi.treatment,
    poi.condition_id,
    mc.name AS condition_name,
    poi.ordered_quantity,
    poi.unit,
    poi.purchase_price,
    poi.currency,
    COALESCE(SUM(r.received_quantity), 0)::NUMERIC(14, 3) AS received_quantity,
    (poi.ordered_quantity - COALESCE(SUM(r.received_quantity), 0))::NUMERIC(14, 3) AS balance_quantity,
    COUNT(r.id)::INTEGER AS receipt_count,
    CASE 
        WHEN po.is_closed = true THEN 'Closed'
        WHEN COALESCE(SUM(r.received_quantity), 0) = 0 THEN 'Open'
        WHEN COALESCE(SUM(r.received_quantity), 0) < poi.ordered_quantity THEN 'Partially Received'
        WHEN COALESCE(SUM(r.received_quantity), 0) = poi.ordered_quantity THEN 'Received'
        ELSE 'Over Received'
    END AS calculated_status,
    COALESCE(poi.expected_delivery_date, po.expected_delivery_date) AS expected_delivery_date,
    CASE 
        WHEN (poi.ordered_quantity - COALESCE(SUM(r.received_quantity), 0)) > 0 
             AND CURRENT_DATE > COALESCE(poi.expected_delivery_date, po.expected_delivery_date) 
        THEN true 
        ELSE false 
    END AS is_overdue,
    CASE 
        WHEN (poi.ordered_quantity - COALESCE(SUM(r.received_quantity), 0)) > 0 
             AND CURRENT_DATE > COALESCE(poi.expected_delivery_date, po.expected_delivery_date) 
        THEN (CURRENT_DATE - COALESCE(poi.expected_delivery_date, po.expected_delivery_date))::INTEGER
        ELSE 0 
    END AS days_overdue,
    poi.created_at
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.purchase_order_id
LEFT JOIN suppliers sup ON sup.id = po.supplier_id
LEFT JOIN master_grades mg ON mg.id = poi.grade_id
LEFT JOIN master_sections ms ON ms.id = poi.section_id
LEFT JOIN master_conditions mc ON mc.id = poi.condition_id
LEFT JOIN receipts r ON r.purchase_order_item_id = poi.id
GROUP BY poi.id, po.id, sup.id, mg.id, ms.id, mc.id;

-- View: Aggregated PO Summary View
CREATE OR REPLACE VIEW v_purchase_order_summary AS
SELECT 
    po.id AS po_id,
    po.po_number,
    po.order_date,
    po.supplier_id,
    sup.supplier_name,
    sup.country AS supplier_country,
    po.reference,
    po.currency,
    po.payment_terms,
    po.delivery_terms,
    po.destination,
    po.oc_number,
    po.oc_date,
    po.expected_delivery_date,
    po.is_closed,
    po.close_reason,
    COUNT(b.item_id)::INTEGER AS total_items,
    COALESCE(SUM(b.ordered_quantity), 0)::NUMERIC(14, 3) AS total_ordered_quantity,
    COALESCE(SUM(b.received_quantity), 0)::NUMERIC(14, 3) AS total_received_quantity,
    COALESCE(SUM(b.balance_quantity), 0)::NUMERIC(14, 3) AS total_balance_quantity,
    COALESCE(SUM(b.ordered_quantity * b.purchase_price), 0)::NUMERIC(16, 2) AS total_order_value,
    COALESCE(SUM(b.balance_quantity * b.purchase_price), 0)::NUMERIC(16, 2) AS total_pending_value,
    BOOL_OR(b.is_overdue) AS has_overdue_items,
    MAX(b.days_overdue)::INTEGER AS max_days_overdue,
    CASE 
        WHEN po.is_closed = true THEN 'Closed'
        WHEN COUNT(b.item_id) = 0 THEN 'Open'
        WHEN COALESCE(SUM(b.received_quantity), 0) = 0 THEN 'Open'
        WHEN COALESCE(SUM(b.balance_quantity), 0) <= 0 THEN 'Received'
        ELSE 'Partially Received'
    END AS derived_status,
    po.created_at,
    po.updated_at
FROM purchase_orders po
LEFT JOIN suppliers sup ON sup.id = po.supplier_id
LEFT JOIN v_purchase_order_item_balances b ON b.purchase_order_id = po.id
GROUP BY po.id, sup.id;

-- View: Lot Inventory & Movements
CREATE OR REPLACE VIEW v_lot_inventory AS
SELECT 
    l.id AS lot_id,
    l.lot_number,
    poi.id AS item_id,
    po.po_number,
    sup.supplier_name,
    mg.code AS grade_code,
    ms.name AS section_name,
    poi.diameter_width,
    poi.thickness,
    poi.length,
    mc.name AS condition_name,
    COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE_RECEIPT' THEN it.quantity ELSE 0 END), 0)::NUMERIC(14, 3) AS total_received_quantity,
    COALESCE(SUM(CASE WHEN it.transaction_type IN ('SALE', 'CUSTOMER_ALLOCATION') THEN ABS(it.quantity) ELSE 0 END), 0)::NUMERIC(14, 3) AS total_allocated_sold_quantity,
    COALESCE(SUM(it.quantity), 0)::NUMERIC(14, 3) AS available_quantity,
    l.warehouse_location,
    l.status,
    l.created_at
FROM lots l
LEFT JOIN purchase_order_items poi ON poi.id = l.purchase_order_item_id
LEFT JOIN purchase_orders po ON po.id = poi.purchase_order_id
LEFT JOIN suppliers sup ON sup.id = po.supplier_id
LEFT JOIN master_grades mg ON mg.id = poi.grade_id
LEFT JOIN master_sections ms ON ms.id = poi.section_id
LEFT JOIN master_conditions mc ON mc.id = poi.condition_id
LEFT JOIN inventory_transactions it ON it.lot_id = l.id
GROUP BY l.id, poi.id, po.id, sup.id, mg.id, ms.id, mc.id;

-- View: Dynamic Equivalent of Excel Sheet4 (Order No + Lot No Summary)
CREATE OR REPLACE VIEW v_order_lot_summary AS
SELECT 
    po.po_number,
    COALESCE(l.lot_number, '(unassigned)') AS lot_number,
    COALESCE(SUM(poi.ordered_quantity), 0)::NUMERIC(14, 3) AS sum_ordered_qty,
    COALESCE(SUM(r.received_quantity), 0)::NUMERIC(14, 3) AS sum_received_qty,
    (COALESCE(SUM(poi.ordered_quantity), 0) - COALESCE(SUM(r.received_quantity), 0))::NUMERIC(14, 3) AS sum_balance_qty
FROM purchase_orders po
JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
LEFT JOIN receipts r ON r.purchase_order_item_id = poi.id
LEFT JOIN lots l ON l.id = r.lot_id
GROUP BY po.po_number, l.lot_number
ORDER BY po.po_number, l.lot_number;

-- ----------------------------------------------------------------------------
-- 9. MASTER DATA SEED STATEMENTS
-- ----------------------------------------------------------------------------

-- Insert Master Grades
INSERT INTO master_grades (code) VALUES ('1.208') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2083') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2085') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2311') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2316') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2327') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2343') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2344') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2365') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2379') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.251') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2581') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2714') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2738') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.3243') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.3247') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.3343') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.3505') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.4057') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2083 ESR') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2316 HH') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2344 ESR') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2738 HH') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('1.2738 H') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('690QL') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('718 HH') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-303') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-304') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-316') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-410') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-416') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-420') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AISI-O1') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AR-400') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AR-450') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('AR-500') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('BLADES') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('C-45') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('C-50') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('E-410') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-19') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-1A') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-1B') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-24') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-353') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-36') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-36B') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-36C') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-41B') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-8') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('EN-9') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('GUN METAL') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('INSERTS') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('P20') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('K-310') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('MACHINE') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('MS') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('NAK-80') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('QCM 8') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('QC-11') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('QDH') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('QDN') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('QHZ') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('S-700MC') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('SAE 52100') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('SAE-8620') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('SKD 11') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('SR-4') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('SX 105V') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('SX ACE') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('VR16') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('VR16HH') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('VR-300') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('VR-400') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('S50C') ON CONFLICT (code) DO NOTHING;
INSERT INTO master_grades (code) VALUES ('Cr12Mov') ON CONFLICT (code) DO NOTHING;

-- Insert Master Conditions
INSERT INTO master_conditions (name) VALUES ('BLACK FORGED') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_conditions (name) VALUES ('BLACK ROLLED') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_conditions (name) VALUES ('BRIGHT ROLLED') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_conditions (name) VALUES ('BRIGHT FORGED') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_conditions (name) VALUES ('GRINDED FORGED') ON CONFLICT (name) DO NOTHING;

-- Insert Master Makes
INSERT INTO master_makes (name) VALUES ('ACRONI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('AICHI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('AMNS') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('ARCELOR') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('ASO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BALCO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BANSAL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BAOSHAN') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BEIMAN') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BGH') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BOHLER') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('BREITENFELD') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('CHINA') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('DEW') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('DONGBEI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('DSS') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('ERA') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('ET') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('ETTAR') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('FARO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('GERMANY') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('GLORIA') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('HITACHI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('HR') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('HT') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('IMP') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('JFE') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('JINDAL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('JSPL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('KALYANI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('KANOI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('KAPOOR') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('KEWI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('KISCO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('KMR') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('LAXON') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('LOCAL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('LSR') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('MANDREL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('MANGALAM') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('MMS') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('MUKUND') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('MUSCO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('NIPPON') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('NLMK') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('PARWATI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('PILLSEN') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('POLDI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('POSCO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('POWMEX') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('RAVNE') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('REMI') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SAIL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SANYO') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SCRAP') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SDF') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SEAH') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SHARU') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SHORT PC') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SKW') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SSAB') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('SUNFLAG') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('TG') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('TOOLMAN') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('UNIWAY') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('UTTAM') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('VALIN') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('VERONA') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('VILLARES') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('VISL') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('VSP') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('XINGCHENG') ON CONFLICT (name) DO NOTHING;
INSERT INTO master_makes (name) VALUES ('ZUHONG') ON CONFLICT (name) DO NOTHING;

-- Insert Master Sections
INSERT INTO master_sections (name) VALUES ('Round'), ('Plate'), ('FLAT') ON CONFLICT (name) DO NOTHING;
