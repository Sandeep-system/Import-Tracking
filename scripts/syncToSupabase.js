const { createClient } = require('@supabase/supabase-js');
const initialDataRaw = require('../src/lib/initialData.json');
const incomingStockRaw = require('../src/lib/incomingStockData.json');

const supabaseUrl = 'https://qghgxaridrhqglcdwjxc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnaGd4YXJpZHJocWdsY2R3anhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNzAzMDMsImV4cCI6MjEwNjc0NjMwM30.4mieQHNDUERCYej8Jrd3hehTEh6QKGwm9BvGdGQ-zJE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function cleanDate(d) {
  if (!d) return null;
  const str = String(d).trim();
  const match = str.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  return null;
}

(async () => {
  console.log('--- Syncing Operational Data to Supabase ---');

  const purchaseOrders = initialDataRaw.purchaseOrders || [];
  const suppliers = initialDataRaw.suppliers || [];
  const customers = initialDataRaw.customers || [];
  const inTransit = incomingStockRaw.inTransit || [];

  // Active POs
  const activePOs = purchaseOrders.filter(p => !p.is_closed);
  const activeReceipts = (initialDataRaw.receipts || []).filter(r => 
    activePOs.some(po => po.po_number === r.po_number)
  );

  // Preserve any existing user balance resolutions in Supabase
  let existingResolutions = [];
  try {
    const { data: curState } = await supabase.from('app_cloud_state').select('data').eq('id', 'master_state').single();
    if (curState?.data?.balanceResolutions && Array.isArray(curState.data.balanceResolutions)) {
      existingResolutions = curState.data.balanceResolutions;
    }
  } catch (e) {}

  const syncPayload = {
    version: 2,
    purchaseOrders: activePOs,
    userPurchaseOrders: activePOs,
    modifiedPurchaseOrders: [],
    deletedPoIds: [],
    receipts: activeReceipts,
    userReceipts: activeReceipts,
    deletedReceiptIds: [],
    suppliers,
    customers,
    lots: [],
    inventoryTransactions: [],
    customerAllocations: [],
    sales: [],
    auditLogs: [
      {
        id: 'log-ingest-cloud-1',
        action: 'DATA_INGEST_COMPLETE',
        entity_type: 'SYSTEM',
        entity_id: 'ingest-init',
        entity_display: 'Import Tracking Cloud Database',
        remarks: `Synchronized ${activePOs.length} active POs and ${inTransit.length} in-transit lots with verified calendar dates.`,
        created_at: new Date().toISOString()
      }
    ],
    balanceResolutions: existingResolutions,
    incomingStock: inTransit
  };

  const { error: stateError } = await supabase
    .from('app_cloud_state')
    .upsert({
      id: 'master_state',
      data: syncPayload,
      updated_at: new Date().toISOString(),
      updated_by: 'system_admin'
    });

  if (stateError) {
    console.error('Error syncing app_cloud_state:', stateError);
  } else {
    console.log('Successfully synced app_cloud_state (master_state)!');
  }

  // Sync active POs to cloud_purchase_orders relational table
  if (activePOs.length > 0) {
    const poRows = activePOs.map(po => ({
      id: po.id,
      po_number: po.po_number,
      order_date: cleanDate(po.order_date) || '2026-01-01',
      supplier_name: po.supplier_name,
      customer_name: po.customer_name,
      reference_person: po.reference_person || po.reference,
      origin: po.origin || po.origin_make_name,
      currency: po.currency || 'USD',
      payment_terms: po.payment_terms,
      delivery_terms: po.delivery_terms,
      destination: po.destination,
      oc_number: po.oc_number,
      expected_delivery_date: cleanDate(po.expected_delivery_date),
      status: po.status,
      is_closed: false,
      total_ordered_qty: po.total_ordered_qty || 0,
      total_received_qty: po.total_received_qty || 0,
      total_ready_qty: po.total_ready_qty || 0,
      total_balance_qty: po.total_balance_qty || 0,
      items: po.items || [],
      updated_at: new Date().toISOString()
    }));

    const { error: poError } = await supabase
      .from('cloud_purchase_orders')
      .upsert(poRows, { onConflict: 'id' });

    if (poError) {
      console.warn('Notice on cloud_purchase_orders:', poError.message);
    } else {
      console.log(`Successfully synced ${poRows.length} active POs to cloud_purchase_orders!`);
    }
  }

  console.log('Supabase Cloud Sync Finished.');
})();
