import { PurchaseOrder, Receipt } from '@/types';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string;
  itemCount?: number;
  message?: string;
}

let currentStatus: SyncStatus = { state: 'idle' };
let debounceTimer: any = null;
let isSyncInProgress = false;
let hasQueuedChanges = false;
let latestPOsToSync: PurchaseOrder[] = [];

export const googleSync = {
  getSyncStatus(): SyncStatus {
    return currentStatus;
  },

  setStatus(newStatus: Partial<SyncStatus>) {
    currentStatus = { ...currentStatus, ...newStatus };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:sheets-sync-status', { detail: currentStatus }));
    }
  },

  // Called automatically whenever any change is made and saved in dataStore
  queueAutoSync(purchaseOrders: PurchaseOrder[]) {
    latestPOsToSync = purchaseOrders;
    hasQueuedChanges = true;
    this.setStatus({ state: 'syncing', message: 'Saving changes & syncing...' });

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      this.executeQueuedSync();
    }, 1200); // 1.2s debounce to gracefully batch quick edits
  },

  async executeQueuedSync() {
    if (isSyncInProgress) {
      return; // Will re-run after current request finishes because hasQueuedChanges is true
    }

    if (!hasQueuedChanges || latestPOsToSync.length === 0) {
      return;
    }

    isSyncInProgress = true;
    hasQueuedChanges = false;
    const posToSync = [...latestPOsToSync];

    this.setStatus({ state: 'syncing', message: 'Syncing changes to Google Sheet...' });

    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_ALL', purchaseOrders: posToSync }),
      });
      const data = await res.json();

      if (data.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.setStatus({
          state: 'synced',
          lastSyncedAt: timeStr,
          itemCount: posToSync.length,
          message: `Auto-synced ${posToSync.length} orders to Google Sheet at ${timeStr}`
        });
      } else {
        this.setStatus({
          state: 'error',
          message: data.error || 'Failed to sync with Google Sheet'
        });
      }
    } catch (err: any) {
      console.warn('Auto-sync to Google Sheet failed:', err);
      this.setStatus({
        state: 'error',
        message: err.message || 'Network error during sync'
      });
    } finally {
      isSyncInProgress = false;
      if (hasQueuedChanges) {
        this.executeQueuedSync();
      }
    }
  },

  async syncCreatePO(po: PurchaseOrder): Promise<boolean> {
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_PO', po }),
      });
      const data = await res.json();
      return !!data.success;
    } catch (err) {
      console.warn('Background Google Sheets sync failed:', err);
      return false;
    }
  },

  async syncReceipts(poNumber: string, receipts: Receipt[]): Promise<boolean> {
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RECORD_RECEIPT', po_number: poNumber, receipts }),
      });
      const data = await res.json();
      return !!data.success;
    } catch (err) {
      console.warn('Background Google Sheets receipt sync failed:', err);
      return false;
    }
  },

  async syncAllPOs(purchaseOrders: PurchaseOrder[]): Promise<{ success: boolean; count?: number; error?: string }> {
    this.setStatus({ state: 'syncing', message: 'Manual sync in progress...' });
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_ALL', purchaseOrders }),
      });
      const data = await res.json();
      if (data.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.setStatus({
          state: 'synced',
          lastSyncedAt: timeStr,
          itemCount: purchaseOrders.length,
          message: `Synced to Google Sheet at ${timeStr}`
        });
        return { success: true, count: purchaseOrders.length };
      }
      this.setStatus({ state: 'error', message: data.error || 'Sync failed' });
      return { success: false, error: data.error || 'Sync failed' };
    } catch (err: any) {
      this.setStatus({ state: 'error', message: err.message || 'Sync failed' });
      return { success: false, error: err.message || 'Sync failed' };
    }
  }
};
