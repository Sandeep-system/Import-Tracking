import { PurchaseOrder, Receipt } from '@/types';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string;
  itemCount?: number;
  message?: string;
}

const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyDrEcj9bW9EDs7Gx_9nMru76YMELyodpNW-68EPh5VC7NwiibCyD1UfmWDi2mIIHWg/exec';

let currentStatus: SyncStatus = { state: 'idle' };
let debounceTimer: any = null;
let isSyncInProgress = false;
let hasQueuedChanges = false;
let latestPOsToSync: PurchaseOrder[] = [];

async function postWebhook(payload: any): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { success: data.status === 'success' || !!data.success, data };
  } catch (err: any) {
    try {
      // In case browser blocks CORS on 302 redirect, fallback to no-cors mode so Google Apps Script still executes
      await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || err.message };
    }
  }
}

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
      return;
    }

    if (!hasQueuedChanges || latestPOsToSync.length === 0) {
      return;
    }

    isSyncInProgress = true;
    hasQueuedChanges = false;
    const posToSync = [...latestPOsToSync];

    this.setStatus({ state: 'syncing', message: 'Syncing changes to Google Sheet...' });

    try {
      const res = await postWebhook({ action: 'SYNC_ALL', purchaseOrders: posToSync });

      if (res.success) {
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
          message: res.error || 'Failed to sync with Google Sheet'
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
      const res = await postWebhook({ action: 'CREATE_PO', po });
      return !!res.success;
    } catch (err) {
      console.warn('Background Google Sheets sync failed:', err);
      return false;
    }
  },

  async syncReceipts(poNumber: string, receipts: Receipt[]): Promise<boolean> {
    try {
      const res = await postWebhook({ action: 'RECORD_RECEIPT', po_number: poNumber, receipts });
      return !!res.success;
    } catch (err) {
      console.warn('Background Google Sheets receipt sync failed:', err);
      return false;
    }
  },

  async syncAllPOs(purchaseOrders: PurchaseOrder[]): Promise<{ success: boolean; count?: number; error?: string }> {
    this.setStatus({ state: 'syncing', message: 'Manual sync in progress...' });
    try {
      const res = await postWebhook({ action: 'SYNC_ALL', purchaseOrders });
      if (res.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.setStatus({
          state: 'synced',
          lastSyncedAt: timeStr,
          itemCount: purchaseOrders.length,
          message: `Synced to Google Sheet at ${timeStr}`
        });
        return { success: true, count: purchaseOrders.length };
      }
      this.setStatus({ state: 'error', message: res.error || 'Sync failed' });
      return { success: false, error: res.error || 'Sync failed' };
    } catch (err: any) {
      this.setStatus({ state: 'error', message: err.message || 'Sync failed' });
      return { success: false, error: err.message || 'Sync failed' };
    }
  }
};
