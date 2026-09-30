# Import Purchase Order & Material Tracking System

A full-stack operational management system for tracking import purchase orders, material specifications, physical receipts, inventory lots, balance resolutions, and customer allocations.

Built for **Sandeep Edgetech**.

---

## Key Features

1. **Purchase Order Management**:
   - Create, edit, and track import purchase orders.
   - Comprehensive multi-item specification tracking (grade, section, dimensions, treatment, surface condition, ordered & received quantities).
   - Real-time calculation of pending balances, landed weights, and delivery status.
   - Prominent delivery terms (FOB, CIF, CFR) and payment terms tracking.

2. **Physical Receipts & Inbound Logistics**:
   - Record single or multi-item bulk receipts against purchase orders.
   - Auto-fills remaining pending balances for quick full-order receipts.
   - Shared lot assignment, supplier invoice number, and invoice date management across line items.
   - Edit and delete physical receipts with automated inventory rollback and PO balance restoration.

3. **Balance Resolution Engine**:
   - Handle physical shortages through customizable business rules:
     - **Carry Forward**: Move remaining pending quantity to another order.
     - **Waive / Short Close**: Waive supplier shortage and close out balances without double-counting.
     - **Mixed Resolutions**: Partially carry forward and partially waive remaining balances.
   - Full resolution reversal capabilities.

4. **Inventory & Lot Traceability**:
   - Dynamic lot tracking from inbound PO receipts to warehouse yard locations.
   - Complete inventory transaction ledger (`PURCHASE_RECEIPT`, `DISPATCH`, `TRANSFER`).
   - Lot allocation and sales fulfillment tracking.

5. **Real-Time Google Sheets Integration**:
   - Fully automated bidirectional sync to Google Sheets via Google Apps Script webhooks.
   - Debounced sync queue to prevent rate limits and ensure zero data loss.
   - Live visual synchronization status pill in the navigation header.

6. **Analytics & Reporting**:
   - Executive dashboard with operational summaries, pending order metrics, and overdue order tracking.
   - Excel export for purchase orders, receipts log, and stock levels.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Export / Data Parsing**: XLSX
- **Database / Backend**: Supabase & Next.js API Routes

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Sandeep-system/Import-Tracking.git
cd Import-Tracking

# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the system.

### Production Build

```bash
npm run build
npm run start
```
