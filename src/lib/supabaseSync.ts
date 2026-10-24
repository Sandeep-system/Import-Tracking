import { supabase, isSupabaseConfigured } from './supabase';
import { DataState, PurchaseOrder, Lot, Receipt, IncomingStockItem } from '@/types';
import initialDataRaw from './initialData.json';

export interface CloudSyncStatus {
  state: 'idle' | 'connecting' | 'connected' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string;
  itemCount?: number;
  message?: string;
}

let currentCloudStatus: CloudSyncStatus = { state: 'idle' };
let debounceTimer: any = null;
let isSyncing = false;
let hasPendingChanges = false;
let pendingState: DataState | null = null;
let pendingMeta: { deletedPoIds?: string[]; deletedReceiptIds?: string[] } = {};
let realtimeSubscription: any = null;

export const supabaseSync = {
  getStatus(): CloudSyncStatus {
    return currentCloudStatus;
  },

  setStatus(newStatus: Partial<CloudSyncStatus>) {
    currentCloudStatus = { ...currentCloudStatus, ...newStatus };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:cloud-sync-status', { detail: currentCloudStatus }));
    }
  },

  // Initialize Cloud Sync & Realtime Subscription
  async init(onRemoteUpdate?: (remoteData: Partial<DataState> & { userPurchaseOrders?: PurchaseOrder[]; deletedPoIds?: string[]; deletedReceiptIds?: string[] }) => void) {
    if (!isSupabaseConfigured()) {
      this.setStatus({ state: 'error', message: 'Supabase credentials not configured' });
      return;
    }

    this.setStatus({ state: 'connecting', message: 'Connecting to Cloud Database...' });

    try {
      // 1. Fetch initial state from Supabase app_cloud_state
      const { data: stateData, error: stateError } = await supabase
        .from('app_cloud_state')
        .select('data, updated_at')
        .eq('id', 'master_state')
        .single();

      // 2. Also fetch any relational PO rows from cloud_purchase_orders
      let relationalPOs: any[] = [];
      try {
        const { data: poRows } = await supabase.from('cloud_purchase_orders').select('*');
        if (Array.isArray(poRows)) {
          relationalPOs = poRows;
        }
      } catch (e) {}

      if (!stateError && stateData?.data) {
        const timeStr = stateData.updated_at ? new Date(stateData.updated_at).toLocaleTimeString() : 'just now';
        this.setStatus({
          state: 'synced',
          lastSyncedAt: timeStr,
          message: `Connected to Cloud Database (Synced at ${timeStr})`
        });

        const mergedRemote = { ...stateData.data };
        if (relationalPOs.length > 0) {
          const uMap = new Map<string, any>();
          for (const p of (mergedRemote.userPurchaseOrders || [])) {
            const key = p.id || `po-${p.po_number}`;
            uMap.set(key, p);
          }
          for (const r of relationalPOs) {
            const key = r.id || `po-${r.po_number}`;
            if (!uMap.has(key)) {
              uMap.set(key, r);
            }
          }
          const uniqueList: PurchaseOrder[] = [];
          const seen = new Set<string>();
          for (const po of uMap.values()) {
            const idKey = po.id || `po-${po.po_number}`;
            const numKey = po.po_number ? String(po.po_number).trim() : '';
            if (!seen.has(idKey) && (!numKey || !seen.has(numKey))) {
              seen.add(idKey);
              if (numKey) seen.add(numKey);
              uniqueList.push(po);
            }
          }
          mergedRemote.userPurchaseOrders = uniqueList;
        }

        if (onRemoteUpdate) {
          onRemoteUpdate(mergedRemote);
        }
      } else {
        this.setStatus({
          state: 'connected',
          message: 'Cloud Database Connected (Ready for entries)'
        });
      }

      // 3. Setup Realtime Subscription to listen for changes from any client
      if (!realtimeSubscription && typeof window !== 'undefined') {
        realtimeSubscription = supabase
          .channel('app_cloud_state_changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'app_cloud_state', filter: 'id=eq.master_state' },
            (payload: any) => {
              if (payload.new?.data && onRemoteUpdate) {
                console.log('[Supabase Realtime] Received remote update from database');
                onRemoteUpdate(payload.new.data);
                const time = new Date().toLocaleTimeString();
                this.setStatus({
                  state: 'synced',
                  lastSyncedAt: time,
                  message: `Live update received from server at ${time}`
                });
              }
            }
          )
          .subscribe();
      }
    } catch (err: any) {
      console.warn('Failed to initialize Supabase cloud sync:', err);
      this.setStatus({ state: 'error', message: err.message || 'Cloud connection error' });
    }
  },

  // Called automatically whenever dataStore saves any change
  queueSync(state: DataState, meta?: { deletedPoIds?: string[]; deletedReceiptIds?: string[] }) {
    if (!isSupabaseConfigured()) return;

    pendingState = state;
    if (meta) {
      pendingMeta = {
        deletedPoIds: Array.from(new Set([...(pendingMeta.deletedPoIds || []), ...(meta.deletedPoIds || [])])),
        deletedReceiptIds: Array.from(new Set([...(pendingMeta.deletedReceiptIds || []), ...(meta.deletedReceiptIds || [])]))
      };
    }
    hasPendingChanges = true;
    this.setStatus({ state: 'syncing', message: 'Saving changes to Cloud Database...' });

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      this.executeSync();
    }, 1000); // Debounce 1s
  },

  async executeSync() {
    if (isSyncing || !hasPendingChanges || !pendingState) return;

    isSyncing = true;
    hasPendingChanges = false;
    const stateToSync = pendingState;
    const metaToSync = { ...pendingMeta };

    try {
      const allPOs = stateToSync.purchaseOrders || [];
      const baselineClosedIds = new Set(
        (initialDataRaw.purchaseOrders || [])
          .filter((p: any) => p.is_closed)
          .map((p: any) => p.id)
      );

      // Operational POs: All active orders + any newly created or modified user orders
      const operationalPOs = allPOs.filter(p => !p.is_closed || !baselineClosedIds.has(p.id));
      const operationalPoNumbers = new Set(operationalPOs.map(p => String(p.po_number)));

      // Operational Receipts: Only receipts linked to operational POs
      const operationalReceipts = (stateToSync.receipts || []).filter(r =>
        operationalPoNumbers.has(String(r.po_number))
      );

      // Operational Incoming Stock: Active in-transit stock or non-received items
      const operationalIncomingStock = (stateToSync.incomingStock || []).filter(
        (item: any) => item.received_status !== 'RECEIVED'
      );

      const syncPayload = {
        version: 2,
        purchaseOrders: operationalPOs,
        userPurchaseOrders: operationalPOs,
        modifiedPurchaseOrders: [],
        deletedPoIds: metaToSync.deletedPoIds || [],
        receipts: operationalReceipts,
        userReceipts: operationalReceipts,
        deletedReceiptIds: metaToSync.deletedReceiptIds || [],
        suppliers: stateToSync.suppliers || [],
        customers: stateToSync.customers || [],
        lots: stateToSync.lots || [],
        inventoryTransactions: stateToSync.inventoryTransactions || [],
        customerAllocations: stateToSync.customerAllocations || [],
        sales: stateToSync.sales || [],
        auditLogs: (stateToSync.auditLogs || []).slice(0, 100),
        balanceResolutions: stateToSync.balanceResolutions || [],
        incomingStock: operationalIncomingStock
      };

      // 1. Upsert master operational cloud state
      const { error: stateError } = await supabase
        .from('app_cloud_state')
        .upsert({
          id: 'master_state',
          data: syncPayload,
          updated_at: new Date().toISOString(),
          updated_by: 'system_user'
        });

      if (stateError) {
        console.error('Supabase app_cloud_state sync error:', stateError);
        const errDetails = stateError.message || stateError.details || JSON.stringify(stateError);
        const isRlsError = stateError.code === '42501' || String(errDetails).toLowerCase().includes('row-level security');
        this.setStatus({
          state: 'error',
          message: isRlsError
            ? 'Cloud DB RLS Policy Required: Please run the SQL policy in Supabase SQL Editor.'
            : `Cloud Database Error: ${errDetails}`
        });
        return;
      }

      // 2. Also upsert operational PO rows to cloud_purchase_orders relational table
      if (operationalPOs.length > 0) {
        try {
          const poRows = operationalPOs.map(po => ({
            id: po.id,
            po_number: po.po_number,
            order_date: po.order_date,
            supplier_name: po.supplier_name,
            customer_name: po.customer_name,
            reference_person: po.reference_person || po.reference,
            origin: po.origin || po.origin_make_name,
            currency: po.currency,
            payment_terms: po.payment_terms,
            delivery_terms: po.delivery_terms,
            destination: po.destination,
            oc_number: po.oc_number,
            oc_date: po.oc_date,
            expected_delivery_date: po.expected_delivery_date,
            status: po.status,
            is_closed: po.is_closed || false,
            total_ordered_qty: po.total_ordered_qty || 0,
            total_received_qty: po.total_received_qty || 0,
            total_ready_qty: po.total_ready_qty || 0,
            total_balance_qty: po.total_balance_qty || 0,
            items: po.items || [],
            updated_at: new Date().toISOString()
          }));

          await supabase.from('cloud_purchase_orders').upsert(poRows, { onConflict: 'id' });
        } catch (poErr) {
          console.warn('Notice on cloud_purchase_orders upsert:', poErr);
        }
      } else {
        try {
          await supabase.from('cloud_purchase_orders').delete().neq('id', 'keep_none_placeholder');
        } catch (poErr) {}
      }

      // 3. Clean any deleted POs from cloud_purchase_orders table
      if (metaToSync.deletedPoIds && metaToSync.deletedPoIds.length > 0) {
        try {
          await supabase.from('cloud_purchase_orders').delete().in('id', metaToSync.deletedPoIds);
        } catch (delErr) {}
      }

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.setStatus({
        state: 'synced',
        lastSyncedAt: timeStr,
        itemCount: operationalPOs.length,
        message: `Saved to Cloud Database at ${timeStr}`
      });
    } catch (err: any) {
      console.error('Cloud sync error:', err);
      this.setStatus({
        state: 'error',
        message: err.message || 'Failed to save to Cloud Database'
      });
    } finally {
      isSyncing = false;
      if (hasPendingChanges) {
        this.executeSync();
      }
    }
  },

  // Manual one-click push of all operational data
  async pushAll(state: DataState, meta?: { deletedPoIds?: string[]; deletedReceiptIds?: string[] }): Promise<{ success: boolean; message: string }> {
    this.setStatus({ state: 'syncing', message: 'Uploading all records to Cloud Database...' });
    try {
      pendingState = state;
      if (meta) {
        pendingMeta = {
          deletedPoIds: Array.from(new Set([...(pendingMeta.deletedPoIds || []), ...(meta.deletedPoIds || [])])),
          deletedReceiptIds: Array.from(new Set([...(pendingMeta.deletedReceiptIds || []), ...(meta.deletedReceiptIds || [])]))
        };
      }
      hasPendingChanges = true;
      await this.executeSync();
      if (currentCloudStatus.state === 'error') {
        return { success: false, message: currentCloudStatus.message || 'Failed to save to Cloud Database' };
      }
      return { success: true, message: 'All operational records successfully saved to Supabase Cloud Database!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to upload to Cloud Database' };
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (hasPendingChanges) {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabaseSync.executeSync();
    }
  });
}
