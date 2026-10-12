const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Reference Date for Option 2: 2026-10-07
const TODAY_STR = '2026-10-07';

// Date parser helper
function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date || (typeof val === 'object' && val !== null && typeof val.getTime === 'function')) {
    if (!isNaN(val.getTime())) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  if (typeof val === 'number') {
    try {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      return null;
    }
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

function canonicalSupplierKey(name) {
  if (!name) return '';
  let str = name.toLowerCase();
  str = str.replace(/[.,/()\\&_\-]+/g, ' ');
  str = str.replace(/\b(d\s+o\s+o|l\s+l\s+c|s\s+r\s+l|s\s+p\s+a|doo|llc|srl|spa|co|ltd|corp|corporation|inc|pvt|limited|company|trading|group|sa)\b/gi, ' ');
  str = str.replace(/[^a-z0-9]+/g, '').trim();
  return str || name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

console.log('--- Step 1: Parsing INCOMING STOCK.xlsx ---');
const wbStock = xlsx.readFile('INCOMING STOCK.xlsx', { cellDates: true });

// 1A: Parse INCOMING CLOSE (Received in warehouse lots)
const sheetCloseStock = wbStock.Sheets['INCOMING CLOSE'];
const rangeCloseStock = xlsx.utils.decode_range(sheetCloseStock['!ref'] || 'A1');

const incomingCloseLots = new Set();
const incomingClosedStock = [];

for (let r = 2; r <= rangeCloseStock.e.r; r++) {
  const getV = (c) => sheetCloseStock[xlsx.utils.encode_cell({r, c})]?.v;
  const lotRaw = getV(2);
  if (!lotRaw) continue;
  const lot = String(lotRaw).trim();
  incomingCloseLots.add(lot);

  const make = String(getV(0) || '').trim();
  const sup = String(getV(1) || '').trim();
  const grade = String(getV(3) || '').trim();
  const cond = String(getV(4) || '').trim();
  const t = getV(5) !== undefined && getV(5) !== '' ? Number(getV(5)) || null : null;
  const w = getV(6) !== undefined && getV(6) !== '' ? Number(getV(6)) || null : null;
  const l = getV(7) !== undefined && getV(7) !== '' ? Number(getV(7)) || null : null;
  const pc = getV(8) !== undefined && getV(8) !== '' ? Number(getV(8)) || 1 : 1;
  const weight = Number(getV(9)) || 0;
  const cust = String(getV(10) || 'SE').trim();
  const port = String(getV(11) || '').trim();
  const dateShip = parseExcelDate(getV(12));
  const etaSea = parseExcelDate(getV(13));
  const heat = String(getV(15) || '').trim();
  const terms = String(getV(17) || '').trim();
  const price = Number(getV(18)) || 0;
  const curr = String(getV(19) || 'USD').trim();

  incomingClosedStock.push({
    id: `inc-close-${r}`,
    lot_number: lot,
    make,
    supplier_name: sup,
    supplier_id: `sup-${canonicalSupplierKey(sup)}`,
    grade_code: grade,
    condition: cond,
    thickness: t,
    width_diameter: w,
    length: l,
    pieces: pc,
    weight,
    customer: cust,
    port,
    date_of_shipment: dateShip,
    eta_seaport: etaSea,
    received_status: 'RECEIVED',
    heat_number: heat || null,
    delivery_terms: terms || null,
    price,
    currency: curr,
    created_at: new Date().toISOString()
  });
}
console.log(`Unique Lots in INCOMING CLOSE: ${incomingCloseLots.size}`);
console.log(`Total Warehouse Received Stock Items: ${incomingClosedStock.length}`);

// 1B: Parse INCOMING SE (In-Transit & Ready lots according to Option 2)
const sheetSe = wbStock.Sheets['INCOMING SE'];
const rangeSe = xlsx.utils.decode_range(sheetSe['!ref'] || 'A1');

const incomingSeLots = new Map(); // lot -> info
const incomingInTransitStock = [];

for (let r = 2; r <= rangeSe.e.r; r++) {
  const getV = (c) => sheetSe[xlsx.utils.encode_cell({r, c})]?.v;
  const lotRaw = getV(2);
  if (!lotRaw) continue;
  const lot = String(lotRaw).trim();

  const make = String(getV(0) || '').trim();
  const sup = String(getV(1) || '').trim();
  const grade = String(getV(3) || '').trim();
  const cond = String(getV(4) || '').trim();
  const diaW = getV(5) !== undefined && getV(5) !== '' ? Number(getV(5)) || null : null;
  const t = getV(6) !== undefined && getV(6) !== '' ? Number(getV(6)) || null : null;
  const l = getV(7) !== undefined && getV(7) !== '' ? Number(getV(7)) || null : null;
  const pc = getV(8) !== undefined && getV(8) !== '' ? Number(getV(8)) || 1 : 1;
  const weight = Number(getV(9)) || 0;
  const cust = String(getV(10) || 'SE').trim();
  const port = String(getV(11) || '').trim();
  const dateShip = parseExcelDate(getV(12));
  const etaSea = parseExcelDate(getV(13));
  const heat = String(getV(15) || '').trim();
  const terms = String(getV(17) || '').trim();
  const price = Number(getV(18)) || 0;
  const curr = String(getV(19) || 'USD').trim();

  // OPTION 2 RULE:
  // If date of shipment is blank OR in future (> TODAY_STR) -> Ready to Ship
  // If date of shipment <= TODAY_STR (already departed) -> In Transit
  const isReady = !dateShip || dateShip > TODAY_STR;
  const status = isReady ? 'Ready to Ship' : 'In Transit';

  if (!incomingSeLots.has(lot)) {
    incomingSeLots.set(lot, {
      lot,
      isReady,
      status,
      dateShip,
      etaSea,
      port,
      terms,
      supplier: sup,
      rows: 0,
      totalWeight: 0
    });
  }
  const seLotEntry = incomingSeLots.get(lot);
  seLotEntry.rows++;
  seLotEntry.totalWeight += weight;

  incomingInTransitStock.push({
    id: `inc-se-${r}`,
    lot_number: lot,
    make,
    supplier_name: sup,
    supplier_id: `sup-${canonicalSupplierKey(sup)}`,
    grade_code: grade,
    condition: cond,
    width_diameter: diaW,
    thickness: t,
    length: l,
    pieces: pc,
    weight,
    customer: cust,
    port,
    date_of_shipment: dateShip,
    eta_seaport: etaSea,
    received_status: isReady ? 'READY' : 'IN_TRANSIT',
    heat_number: heat || null,
    delivery_terms: terms || null,
    price,
    currency: curr,
    created_at: new Date().toISOString()
  });
}
console.log(`Unique Lots in INCOMING SE: ${incomingSeLots.size}`);
console.log(`Total INCOMING SE Stock Items: ${incomingInTransitStock.length}`);

// Step 2: Parsing Import Pending New.xlsx
console.log('\n--- Step 2: Parsing Import Pending New.xlsx ---');
const wbPending = xlsx.readFile('Import Pending New.xlsx', { cellStyles: true, cellDates: true });

// 2A: Parse Pending Order
const sheetPending = wbPending.Sheets['Pending Order'];
const rangePending = xlsx.utils.decode_range(sheetPending['!ref'] || 'A1');

const pendingPoGroups = new Map();
const pendingReceipts = [];
let pendingStats = { inTransit: 0, ready: 0, received: 0, open: 0 };

for (let r = 2; r <= rangePending.e.r; r++) {
  const getV = (c) => sheetPending[xlsx.utils.encode_cell({r, c})]?.v;

  const orderNoRaw = getV(1);
  if (!orderNoRaw) continue;
  const orderNo = String(orderNoRaw).trim();
  if (orderNo.toLowerCase().includes('total') || orderNo.toLowerCase().includes('sum')) continue;

  const closeVal = String(getV(0) || '').trim().toLowerCase();
  const orderDate = parseExcelDate(getV(2)) || '2026-01-01';
  const ref = String(getV(3) || '').trim();
  const supplier = String(getV(4) || 'Standard Supplier').trim();
  const origin = String(getV(5) || '').trim();
  const itemNo = Number(getV(6)) || (pendingPoGroups.get(orderNo)?.items?.length || 0) + 1;
  const grade = String(getV(7) || 'Standard Grade').trim();
  const gradeDoc = String(getV(8) || '').trim();
  const section = String(getV(9) || 'Round').trim();
  const diaW = getV(10) !== undefined && getV(10) !== '' ? Number(getV(10)) || null : null;
  const t = getV(11) !== undefined && getV(11) !== '' ? Number(getV(11)) || null : null;
  const length = getV(12) !== undefined && getV(12) !== '' ? Number(getV(12)) || null : null;
  const treatment = String(getV(13) || '').trim();
  const condition = String(getV(14) || '').trim();
  const orQty = Number(getV(15)) || 0;
  const recdQty = Number(getV(16)) || 0;
  const balQty = Number(getV(17)) || 0;
  const price = Number(getV(18)) || 0;
  const currency = String(getV(19) || 'USD').trim();
  const ocNo = String(getV(20) || '').trim();
  const terms = String(getV(22) || 'FOB').trim();
  const deliveryDate = parseExcelDate(getV(23));
  const payment = String(getV(25) || 'DP at sight').trim();
  const destination = String(getV(26) || 'Nhava Sheva').trim();
  const invNo = String(getV(27) || '').trim();
  const invDate = parseExcelDate(getV(28));
  const lotNo = getV(29) ? String(getV(29)).trim() : '';
  const customer = String(getV(30) || 'SE').trim();
  const remarks = String(getV(32) || '').trim();

  // --- DETERMINE ITEM STATUS (OPTION A: EXACT EXCEL FIDELITY + OPTION 2 LOT TRACKING) ---
  let itemStatus = 'Open';
  let itemEta = null;
  let itemPol = null;

  if (lotNo) {
    if (incomingCloseLots.has(lotNo)) {
      itemStatus = 'Received';
      pendingStats.received++;
    } else if (incomingSeLots.has(lotNo)) {
      const seInfo = incomingSeLots.get(lotNo);
      itemEta = seInfo.etaSea || null;
      itemPol = seInfo.port || null;
      if (seInfo.isReady) {
        itemStatus = 'Ready to Ship';
        pendingStats.ready++;
      } else {
        itemStatus = 'In Transit';
        pendingStats.inTransit++;
      }
    } else {
      if (closeVal === 'y') {
        itemStatus = 'In Transit';
        pendingStats.inTransit++;
      } else {
        itemStatus = 'Ready to Ship';
        pendingStats.ready++;
      }
    }
  } else {
    // No lot assigned
    if (recdQty > 0) {
      itemStatus = 'Ready to Ship';
      pendingStats.ready++;
    } else {
      itemStatus = 'Open';
      pendingStats.open++;
    }
  }

  const itemId = `poi-${orderNo}-${itemNo}-${r}`;
  const poItem = {
    id: itemId,
    purchase_order_id: `po-${orderNo}`,
    po_number: orderNo,
    line_number: itemNo,
    grade_code: grade,
    grade_doc: gradeDoc || null,
    section_name: section,
    diameter_width: diaW,
    thickness: t,
    length: length,
    treatment: treatment || null,
    condition_name: condition || null,
    ordered_quantity: orQty,
    received_quantity: recdQty,
    ready_quantity: recdQty,
    balance_quantity: balQty,
    physical_short_qty: balQty > 0 ? balQty : 0,
    actionable_pending_qty: balQty,
    unit: 'KG',
    purchase_price: price,
    currency: currency,
    expected_delivery_date: deliveryDate,
    destination_port: destination,
    delivery_terms: terms,
    payment_terms: payment,
    lot_number: lotNo || null,
    eta_seaport: itemEta,
    port_of_loading: itemPol,
    remarks: remarks || null,
    status: itemStatus
  };

  // If receipt present or item has recdQty > 0
  if (recdQty > 0 || invNo) {
    const rcId = `rc-pend-${orderNo}-${itemNo}-${r}`;
    pendingReceipts.push({
      id: rcId,
      purchase_order_item_id: itemId,
      po_number: orderNo,
      receipt_number: `RC-${orderNo}-${itemNo}`,
      receipt_date: invDate || orderDate,
      received_quantity: recdQty,
      unit: 'KG',
      supplier_invoice_number: invNo || null,
      supplier_invoice_date: invDate || null,
      lot_number: lotNo || null,
      notes: remarks || (incomingCloseLots.has(lotNo) ? `Received from Lot ${lotNo} (INCOMING CLOSE)` : `Dispatched Lot ${lotNo || 'N/A'}`)
    });
  }

  if (!pendingPoGroups.has(orderNo)) {
    pendingPoGroups.set(orderNo, {
      id: `po-${orderNo}`,
      po_number: orderNo,
      order_date: orderDate,
      supplier_name: supplier,
      customer_name: customer,
      reference_person: ref,
      origin: origin,
      destination: destination,
      delivery_terms: terms,
      payment_terms: payment,
      currency: currency,
      expected_delivery_date: deliveryDate,
      oc_number: ocNo,
      items: [poItem]
    });
  } else {
    pendingPoGroups.get(orderNo).items.push(poItem);
  }
}

const activePurchaseOrders = Array.from(pendingPoGroups.values()).map(po => {
  const totalOrd = po.items.reduce((s, it) => s + (it.ordered_quantity || 0), 0);
  const totalRecd = po.items.reduce((s, it) => s + (it.received_quantity || 0), 0);
  const totalReady = po.items.reduce((s, it) => s + (it.ready_quantity || 0), 0);
  const totalBal = po.items.reduce((s, it) => s + (it.balance_quantity || 0), 0);

  // Compute PO status
  const statuses = po.items.map(i => i.status);
  let poStatus = 'Open';
  if (statuses.length > 0 && statuses.every(s => s === 'Received' || s.startsWith('Closed'))) {
    poStatus = 'Received';
  } else if (statuses.some(s => s === 'In Transit')) {
    poStatus = 'In Transit';
  } else if (statuses.some(s => s === 'Ready to Ship')) {
    poStatus = 'Ready to Ship';
  } else {
    poStatus = 'Open';
  }

  return {
    ...po,
    supplier_id: `sup-${canonicalSupplierKey(po.supplier_name)}`,
    status: poStatus,
    is_closed: false,
    total_ordered_qty: totalOrd,
    total_received_qty: totalRecd,
    total_ready_qty: totalReady,
    total_balance_qty: totalBal,
    total_physical_short_qty: totalBal > 0 ? totalBal : 0,
    total_actionable_pending_qty: totalBal,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
});

console.log('Active POs:', activePurchaseOrders.length);
console.log('Item Status Stats in Pending Order:', pendingStats);

// 2B: Parse Closed Order
console.log('\n--- Step 3: Parsing Closed Order ---');
const sheetClosed = wbPending.Sheets['Closed Order'];
const rangeClosed = xlsx.utils.decode_range(sheetClosed['!ref'] || 'A1');

const closedPoGroups = new Map();
const closedReceipts = [];

for (let r = 2; r <= rangeClosed.e.r; r++) {
  const getV = (c) => sheetClosed[xlsx.utils.encode_cell({r, c})]?.v;

  const orderNoRaw = getV(1);
  if (!orderNoRaw) continue;
  const orderNo = String(orderNoRaw).trim();
  if (orderNo.toLowerCase().includes('total') || orderNo.toLowerCase().includes('sum')) continue;

  const orderDate = parseExcelDate(getV(2)) || '2025-01-01';
  const ref = String(getV(3) || '').trim();
  const supplier = String(getV(4) || 'Standard Supplier').trim();
  const origin = String(getV(5) || '').trim();
  const itemNo = Number(getV(6)) || (closedPoGroups.get(orderNo)?.items?.length || 0) + 1;
  const grade = String(getV(7) || 'Standard Grade').trim();
  const section = String(getV(9) || 'Round').trim();
  const diaW = getV(10) !== undefined && getV(10) !== '' ? Number(getV(10)) || null : null;
  const t = getV(11) !== undefined && getV(11) !== '' ? Number(getV(11)) || null : null;
  const length = getV(12) !== undefined && getV(12) !== '' ? Number(getV(12)) || null : null;
  const treatment = String(getV(13) || '').trim();
  const condition = String(getV(14) || '').trim();
  const orQty = Number(getV(15)) || 0;
  const recdQty = Number(getV(16)) || orQty;
  const rawBal = Number(getV(17));
  const isFullySettled = Math.abs(orQty - recdQty) < 0.001;
  let balQty = 0;
  let physShortQty = 0;
  let actPendingQty = 0;

  if (isFullySettled) {
    balQty = 0;
    physShortQty = 0;
    actPendingQty = 0;
  } else if (recdQty > orQty) {
    balQty = orQty - recdQty;
    physShortQty = 0;
    actPendingQty = balQty;
  } else {
    balQty = !isNaN(rawBal) ? rawBal : Math.max(0, orQty - recdQty);
    physShortQty = 0;
    actPendingQty = 0;
  }

  const price = Number(getV(18)) || 0;
  const currency = String(getV(19) || 'USD').trim();
  const ocNo = String(getV(20) || '').trim();
  const terms = String(getV(22) || 'FOB').trim();
  const payment = String(getV(25) || 'DP at sight').trim();
  const destination = String(getV(26) || 'Nhava Sheva').trim();
  const invNo = String(getV(27) || '').trim();
  const invDate = parseExcelDate(getV(28));
  const lotNo = String(getV(29) || '').trim();
  const customer = String(getV(30) || 'SE').trim();
  const remarks = String(getV(35) || '').trim();

  const itemId = `poi-close-${orderNo}-${itemNo}-${r}`;
  const poItem = {
    id: itemId,
    purchase_order_id: `po-${orderNo}`,
    po_number: orderNo,
    line_number: itemNo,
    grade_code: grade,
    section_name: section,
    diameter_width: diaW,
    thickness: t,
    length: length,
    treatment: treatment || null,
    condition_name: condition || null,
    ordered_quantity: orQty,
    received_quantity: recdQty,
    ready_quantity: 0,
    balance_quantity: balQty,
    physical_short_qty: physShortQty,
    actionable_pending_qty: actPendingQty,
    unit: 'KG',
    purchase_price: price,
    currency: currency,
    destination_port: destination,
    delivery_terms: terms,
    payment_terms: payment,
    lot_number: lotNo || null,
    remarks: remarks || null,
    status: 'Closed — Fully Received'
  };

  if (recdQty > 0 || invNo) {
    const rcId = `rc-close-${orderNo}-${itemNo}-${r}`;
    closedReceipts.push({
      id: rcId,
      purchase_order_item_id: itemId,
      po_number: orderNo,
      receipt_number: `RC-${orderNo}-${itemNo}`,
      receipt_date: invDate || orderDate,
      received_quantity: recdQty,
      unit: 'KG',
      supplier_invoice_number: invNo || null,
      supplier_invoice_date: invDate || null,
      lot_number: lotNo || null,
      notes: remarks || 'Closed order receipt'
    });
  }

  if (!closedPoGroups.has(orderNo)) {
    closedPoGroups.set(orderNo, {
      id: `po-${orderNo}`,
      po_number: orderNo,
      order_date: orderDate,
      supplier_name: supplier,
      customer_name: customer,
      reference_person: ref,
      origin: origin,
      destination: destination,
      delivery_terms: terms,
      payment_terms: payment,
      currency: currency,
      oc_number: ocNo,
      items: [poItem]
    });
  } else {
    closedPoGroups.get(orderNo).items.push(poItem);
  }
}

const closedPurchaseOrders = Array.from(closedPoGroups.values()).map(po => {
  const totalOrd = po.items.reduce((s, it) => s + (it.ordered_quantity || 0), 0);
  const totalRecd = po.items.reduce((s, it) => s + (it.received_quantity || 0), 0);

  return {
    ...po,
    supplier_id: `sup-${canonicalSupplierKey(po.supplier_name)}`,
    status: 'Closed — Fully Received',
    is_closed: true,
    total_ordered_qty: totalOrd,
    total_received_qty: totalRecd,
    total_ready_qty: totalRecd,
    total_balance_qty: 0,
    total_physical_short_qty: 0,
    total_actionable_pending_qty: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
});

console.log('Closed POs:', closedPurchaseOrders.length);
console.log('Total Closed Receipts:', closedReceipts.length);

// Extract Unique Suppliers & Customers
const supplierMap = new Map();
const customerMap = new Map();

function addSupplier(name, origin) {
  if (!name || name === 'Standard Supplier') return;
  const key = canonicalSupplierKey(name);
  if (!supplierMap.has(key)) {
    supplierMap.set(key, {
      id: `sup-${key}`,
      supplier_name: name.trim(),
      country: origin || 'International',
      currency: 'USD',
      lead_time_days: 45,
      is_active: true
    });
  }
}

function addCustomer(name) {
  if (!name) return;
  const code = name.trim();
  const key = code.toLowerCase();
  if (!customerMap.has(key)) {
    const isSE = key === 'se' || key.includes('sandeep') || key === 'cust-001';
    customerMap.set(key, {
      id: isSE ? 'cust-1' : `cust-${key.replace(/[^a-z0-9]/g, '')}`,
      customer_code: isSE ? 'SE' : code,
      customer_name: isSE ? 'Sandeep Edgetech (Self)' : (code === 'SP' ? 'Special Project' : code),
      contact_person: isSE ? 'Head Office / Self' : 'Procurement Manager',
      email: isSE ? 'purchase@sandeepedge.com' : 'client@example.com',
      phone: '+91 22 2847 1111',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      status: 'Active'
    });
  }
}

for (const po of [...activePurchaseOrders, ...closedPurchaseOrders]) {
  addSupplier(po.supplier_name, po.origin);
  addCustomer(po.customer_name);
}

for (const it of incomingInTransitStock) {
  addSupplier(it.supplier_name, it.make);
  addCustomer(it.customer);
}

for (const it of incomingClosedStock) {
  addSupplier(it.supplier_name, it.make);
  addCustomer(it.customer);
}

const suppliers = Array.from(supplierMap.values());
const customers = Array.from(customerMap.values());
const allPurchaseOrders = [...activePurchaseOrders, ...closedPurchaseOrders];
const allReceipts = [...pendingReceipts, ...closedReceipts];

// Save initialData.json
const initialData = {
  purchaseOrders: allPurchaseOrders,
  suppliers: suppliers,
  customers: customers,
  receipts: allReceipts,
  lots: [],
  inventoryTransactions: [],
  customerAllocations: [],
  sales: [],
  auditLogs: [
    {
      id: 'log-ingest-real-1',
      action: 'SYSTEM_DATA_INGEST',
      entity_type: 'SYSTEM',
      entity_id: 'init-real-1',
      entity_display: 'Import Tracking Ingestion Engine',
      remarks: `Ingested ${activePurchaseOrders.length} active POs, ${closedPurchaseOrders.length} closed POs, ${allReceipts.length} receipts, and ${incomingInTransitStock.length} in-transit lots according to Option 2 rules.`,
      user_id: 'system',
      created_at: new Date().toISOString()
    }
  ],
  balanceResolutions: []
};

fs.writeFileSync(path.resolve(__dirname, '../src/lib/initialData.json'), JSON.stringify(initialData, null, 2));
console.log('Saved src/lib/initialData.json');

// Save incomingStockData.json
const incomingStockData = {
  inTransit: incomingInTransitStock,
  received: incomingClosedStock
};
fs.writeFileSync(path.resolve(__dirname, '../src/lib/incomingStockData.json'), JSON.stringify(incomingStockData, null, 2));
console.log('Saved src/lib/incomingStockData.json');

console.log('--- Ingestion Complete! ---');
console.log(`Total POs: ${allPurchaseOrders.length} (${activePurchaseOrders.length} Active + ${closedPurchaseOrders.length} Closed)`);
console.log(`Total Receipts: ${allReceipts.length}`);
console.log(`In-Transit Stock items: ${incomingInTransitStock.length}`);
console.log(`Warehouse Received Stock items: ${incomingClosedStock.length}`);
