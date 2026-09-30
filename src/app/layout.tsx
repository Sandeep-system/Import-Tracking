'use client';

import React, { useState } from 'react';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { AddReceiptModal } from '@/components/AddReceiptModal';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAddReceiptOpen, setIsAddReceiptOpen] = useState(false);

  return (
    <html lang="en">
      <head>
        <title>Import Tracking System - Steel & Materials ERP</title>
        <meta name="description" content="Import Purchase Order & Material Tracking System" />
      </head>
      <body className="flex h-screen overflow-hidden bg-slate-100 font-sans">
        {/* Main Navigation Sidebar */}
        <Sidebar />

        {/* Content Shell */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <Navbar onOpenAddReceipt={() => setIsAddReceiptOpen(true)} />

          {/* Main Body */}
          <main className="flex-1 overflow-y-auto p-6">
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
      </body>
    </html>
  );
}
