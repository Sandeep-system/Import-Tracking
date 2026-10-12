'use client';

import React, { useState } from 'react';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { AddReceiptModal } from '@/components/AddReceiptModal';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LoginScreen } from '@/components/LoginScreen';

function AppContent({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [isAddReceiptOpen, setIsAddReceiptOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center text-white">
        <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400 font-medium tracking-wide">Loading Sandeep Edgetech ERP...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans w-full">
      {/* Main Navigation Sidebar */}
      <Sidebar />

      {/* Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Navbar onOpenAddReceipt={() => setIsAddReceiptOpen(true)} />

        {/* Viewer Mode Banner */}
        {user.role === 'viewer' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-xs text-amber-800 shrink-0">
            <span className="font-semibold flex items-center gap-1.5">
              <span>Viewer Mode:</span>
              <span className="font-normal text-amber-700">You have read-only access. Viewing reports, shipments, and orders is enabled.</span>
            </span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Read-Only
            </span>
          </div>
        )}

        {/* Main Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 min-w-0 max-w-full">
          {children}
        </main>
      </div>

      {/* Global Add Receipt Modal */}
      <AddReceiptModal
        isOpen={isAddReceiptOpen}
        onClose={() => setIsAddReceiptOpen(false)}
        onReceiptAdded={() => {
          // Trigger refresh event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('app:data-updated'));
          }
        }}
      />
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Import Tracking System - Steel & Materials ERP</title>
        <meta name="description" content="Import Purchase Order & Material Tracking System" />
      </head>
      <body className="bg-slate-100 font-sans antialiased">
        <AuthProvider>
          <AppContent>{children}</AppContent>
        </AuthProvider>
      </body>
    </html>
  );
}
