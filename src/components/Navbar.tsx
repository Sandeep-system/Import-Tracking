'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell, Plus, ShieldCheck, User, X, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { googleSync, SyncStatus } from '@/lib/googleSync';
import { dataStore } from '@/lib/dataStore';

export function Navbar({ onOpenAddReceipt }: { onOpenAddReceipt?: () => void }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(googleSync.getSyncStatus());

  useEffect(() => {
    const handleSyncUpdate = (e: any) => {
      if (e.detail) setSyncStatus(e.detail);
      else setSyncStatus(googleSync.getSyncStatus());
    };
    window.addEventListener('app:sheets-sync-status', handleSyncUpdate);
    return () => window.removeEventListener('app:sheets-sync-status', handleSyncUpdate);
  }, []);

  const handleManualSyncClick = () => {
    googleSync.syncAllPOs(dataStore.getOperationalPurchaseOrders());
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/traceability?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 card-shadow">
      {/* Search Input (Global Search for PO, Lot, Invoice, Supplier, Grade) */}
      <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Global Search (PO#, Lot#, Invoice#, Grade, Supplier)..."
          className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 placeholder-slate-400 transition-all"
        />
        {searchTerm && (
          <button 
            type="button" 
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Google Sheets Live Status Indicator */}
        <div 
          onClick={handleManualSyncClick}
          className="cursor-pointer"
          title="Google Sheets Auto-Sync: Automatically synchronizes whenever you make changes. Click to sync now."
        >
          {syncStatus.state === 'syncing' ? (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full border border-blue-200 transition-colors animate-pulse">
              <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
              <span>Syncing with Sheet...</span>
            </div>
          ) : syncStatus.state === 'synced' ? (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full border border-emerald-200 transition-colors">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Sheet in Sync {syncStatus.lastSyncedAt ? `(${syncStatus.lastSyncedAt})` : ''}</span>
            </div>
          ) : syncStatus.state === 'error' ? (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-full border border-rose-200 transition-colors">
              <AlertTriangle className="h-3 w-3 text-rose-500" />
              <span>Sync Failed (Retry)</span>
            </div>
          ) : (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 transition-colors">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>Sheet Auto-Sync Ready</span>
            </div>
          )}
        </div>

        {/* Quick Action Buttons */}
        <Link
          href="/purchasing/purchase-orders?new=true"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New PO</span>
        </Link>

        {onOpenAddReceipt && (
          <button
            onClick={onOpenAddReceipt}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Receipt</span>
          </button>
        )}

        <div className="h-5 w-[1px] bg-slate-200 mx-1" />

        {/* User Role Badge */}
        <div className="relative">
          <button
            onClick={() => setShowRoleInfo(!showRoleInfo)}
            className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="text-left text-xs">
              <span className="font-semibold text-slate-800">Admin</span>
              <span className="text-[10px] text-slate-400 block leading-none">Full Access</span>
            </div>
          </button>

          {showRoleInfo && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 p-3 z-50 text-xs text-slate-600 space-y-2">
              <p className="font-semibold text-slate-800 border-b pb-1">Role-Based Access (Active)</p>
              <p className="text-[11px]">Current user: <span className="text-slate-900 font-medium">Operations Manager (Admin)</span></p>
              <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border">
                Roles configured: Admin, Purchase, Warehouse, Sales, Viewer.
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
