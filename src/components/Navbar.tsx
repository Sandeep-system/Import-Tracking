import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, ShieldCheck, User, X, RefreshCw, AlertTriangle, Database, Users, LogOut, Eye, Edit3 } from 'lucide-react';
import Link from 'next/link';
import { supabaseSync, CloudSyncStatus } from '@/lib/supabaseSync';
import { dataStore } from '@/lib/dataStore';
import { useAuth } from '@/context/AuthContext';
import { UserManagementModal } from '@/components/UserManagementModal';

export function Navbar({ onOpenAddReceipt }: { onOpenAddReceipt?: () => void }) {
  const router = useRouter();
  const { user, logout, isAdmin, isViewer } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(supabaseSync.getStatus());

  useEffect(() => {
    setMounted(true);
    const handleCloudUpdate = (e: any) => {
      if (e.detail) setCloudStatus(e.detail);
      else setCloudStatus(supabaseSync.getStatus());
    };
    window.addEventListener('app:cloud-sync-status', handleCloudUpdate);
    return () => {
      window.removeEventListener('app:cloud-sync-status', handleCloudUpdate);
    };
  }, []);

  const handleCloudSyncClick = async () => {
    const res = await dataStore.pushToCloud();
    if (res?.message) {
      alert(res.message);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/traceability?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const getRoleIcon = () => {
    if (isAdmin) return <ShieldCheck className="h-3.5 w-3.5 text-indigo-700" />;
    if (isViewer) return <Eye className="h-3.5 w-3.5 text-slate-600" />;
    return <Edit3 className="h-3.5 w-3.5 text-blue-700" />;
  };

  const getRoleBadgeStyle = () => {
    if (isAdmin) return 'bg-indigo-50 border-indigo-200 text-indigo-800';
    if (isViewer) return 'bg-slate-100 border-slate-300 text-slate-700';
    return 'bg-blue-50 border-blue-200 text-blue-800';
  };

  return (
    <>
      <header suppressHydrationWarning className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 card-shadow">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </form>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Cloud Database (Supabase) Live Status Indicator */}
          <div 
            onClick={handleCloudSyncClick}
            className="cursor-pointer"
            title="Cloud Database (PostgreSQL / Supabase): Live multi-device storage. Click to push changes now."
            suppressHydrationWarning
          >
            {!mounted ? (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 transition-colors">
                <Database className="h-3 w-3 text-slate-400" />
                <span>Cloud DB Ready</span>
              </div>
            ) : cloudStatus.state === 'syncing' ? (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full border border-blue-200 transition-colors animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                <span>Saving to Cloud...</span>
              </div>
            ) : cloudStatus.state === 'synced' || cloudStatus.state === 'connected' ? (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full border border-emerald-200 transition-colors">
                <Database className="h-3 w-3 text-emerald-600" />
                <span>Cloud DB Active {cloudStatus.lastSyncedAt ? `(${cloudStatus.lastSyncedAt})` : ''}</span>
              </div>
            ) : cloudStatus.state === 'connecting' ? (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full border border-amber-200">
                <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
                <span>Connecting Cloud...</span>
              </div>
            ) : cloudStatus.state === 'error' ? (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-full border border-rose-200 transition-colors">
                <AlertTriangle className="h-3 w-3 text-rose-500" />
                <span>Cloud DB Error</span>
              </div>
            ) : (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 transition-colors">
                <Database className="h-3 w-3 text-slate-400" />
                <span>Cloud DB Ready</span>
              </div>
            )}
          </div>

          {/* Manage Access Button (Visible to Admins) */}
          {isAdmin && (
            <button
              onClick={() => setIsUserManagementOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 cursor-pointer shadow-2xs"
              title="Manage user emails, grant Editor or Viewer access, and manage team permissions"
            >
              <Users className="h-3.5 w-3.5 text-indigo-600" />
              <span className="hidden md:inline">Manage Access</span>
            </button>
          )}

          {/* Quick Action Buttons (Only for Admin & Editor, hidden for Viewer) */}
          {!isViewer && (
            <>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm shadow-blue-500/20 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Receipt</span>
                </button>
              )}
            </>
          )}

          <div className="h-5 w-[1px] bg-slate-200 mx-1" />

          {/* User Account / Role Badge */}
          <div className="relative">
            <button
              onClick={() => setShowRoleInfo(!showRoleInfo)}
              className={`flex items-center gap-2 pl-2 pr-3 py-1 rounded-full border hover:opacity-90 transition-all cursor-pointer ${getRoleBadgeStyle()}`}
            >
              <div className="h-6 w-6 rounded-full bg-white flex items-center justify-center font-bold text-xs shadow-2xs">
                {getRoleIcon()}
              </div>
              <div className="text-left text-xs max-w-[120px] truncate">
                <span className="font-bold block truncate leading-tight">
                  {user?.name || user?.email?.split('@')[0] || 'User'}
                </span>
                <span className="text-[10px] uppercase font-semibold opacity-80 block leading-none">
                  {user?.role || 'User'}
                </span>
              </div>
            </button>

            {showRoleInfo && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 text-xs text-slate-600 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                <div className="border-b pb-2">
                  <div className="font-bold text-slate-900 text-sm truncate">{user?.name || 'Account'}</div>
                  <div className="text-slate-500 font-mono text-[11px] truncate">{user?.email}</div>
                  <div className="mt-1.5 inline-block">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getRoleBadgeStyle()}`}>
                      {user?.role} Access
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {isAdmin && <p>• Full permissions to edit, delete, resolve balances, and manage team access.</p>}
                  {user?.role === 'editor' && <p>• Operational access to create and edit purchase orders and receipts.</p>}
                  {isViewer && <p>• Read-only access to view shipments, orders, and reports.</p>}
                </div>

                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowRoleInfo(false);
                      setIsUserManagementOpen(true);
                    }}
                    className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Manage User Access List</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowRoleInfo(false);
                    logout();
                  }}
                  className="w-full py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* User Management Modal */}
      {isAdmin && (
        <UserManagementModal
          isOpen={isUserManagementOpen}
          onClose={() => setIsUserManagementOpen(false)}
        />
      )}
    </>
  );
}
