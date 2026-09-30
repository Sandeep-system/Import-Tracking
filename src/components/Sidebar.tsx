'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Truck, 
  Package, 
  Layers, 
  FileText, 
  Users, 
  Building2, 
  ArrowLeftRight, 
  BarChart3, 
  Database, 
  UploadCloud, 
  ClipboardList, 
  Settings,
  Anchor,
  History
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavSection {
  title: string;
  items: {
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: string;
  }[];
}

const navSections: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    ]
  },
  {
    title: 'PURCHASING',
    items: [
      { label: 'Purchase Orders', href: '/purchasing/purchase-orders', icon: ShoppingBag },
      { label: 'Receipts Log', href: '/purchasing/receipts', icon: Package },
      { label: 'Shipments & Ports', href: '/purchasing/shipments', icon: Anchor },
      { label: 'Suppliers', href: '/purchasing/suppliers', icon: Building2 },
    ]
  },
  {
    title: 'INVENTORY & LOTS',
    items: [
      { label: 'Stock by Spec', href: '/inventory/stock', icon: Layers },
      { label: 'Lot Directory', href: '/inventory/lots', icon: Truck },
      { label: 'Movement Ledger', href: '/inventory/movements', icon: History },
      { label: 'Material Traceability', href: '/traceability', icon: ArrowLeftRight },
    ]
  },
  {
    title: 'SALES & CUSTOMERS',
    items: [
      { label: 'Sales & Allocations', href: '/sales', icon: FileText },
      { label: 'Customer Registry', href: '/sales/customers', icon: Users },
    ]
  },
  {
    title: 'SYSTEM & MIGRATION',
    items: [
      { label: 'Reports & Exports', href: '/reports', icon: BarChart3 },
      { label: 'Data Import Engine', href: '/data-import', icon: UploadCloud, badge: 'Excel' },
      { label: 'Master Data', href: '/master-data', icon: Database },
      { label: 'Audit Trail', href: '/audit-log', icon: ClipboardList },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/60 gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
          <Anchor className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-wide leading-tight">IMPORT TRACK</h1>
          <p className="text-[10px] text-blue-400 font-medium tracking-wider uppercase">Steel & Material ERP</p>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {section.title}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors group",
                    isActive
                      ? "bg-blue-600/90 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-105", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200")} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* System Status Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-900/80 border border-slate-800">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <div className="text-[11px] text-slate-400">
            <span className="text-slate-200 font-medium">Workbook Synced</span>: 243 Items
          </div>
        </div>
      </div>
    </aside>
  );
}
