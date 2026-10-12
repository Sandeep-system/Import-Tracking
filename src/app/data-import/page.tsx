'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  ArrowRight, 
  RotateCcw,
  Database,
  Trash2,
  Download,
  ShoppingBag,
  Receipt as ReceiptIcon,
  Ship,
  FileCheck,
  Eye,
  Check,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { dataStore } from '@/lib/dataStore';
import { PurchaseOrder, PurchaseOrderItem, Receipt, IncomingStockItem } from '@/types';
import { formatWeight, formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

export default function DataImportPage() {
  const { isViewer, isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  
  // Parsed Data
  const [parsedPOs, setParsedPOs] = useState<PurchaseOrder[]>([]);
  const [parsedReceipts, setParsedReceipts] = useState<Receipt[]>([]);
  const [parsedIncoming, setParsedIncoming] = useState<IncomingStockItem[]>([]);
  
  // Preview Tab
  const [activePreviewTab, setActivePreviewTab] = useState<'pos' | 'receipts' | 'incoming'>('pos');
  
  // Import Execution State
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<{
    poCount: number;
    receiptCount: number;
    stockCount: number;
  } | null>(null);
  
  // Purge Dialog State
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [purgeSuccess, setPurgeSuccess] = useState<boolean>(false);

  // Handle Purge All Data
  const handlePurgeAllData = () => {
    dataStore.purgeAllData();
    setShowPurgeModal(false);
    setPurgeSuccess(true);
    setParsedPOs([]);
    setParsedReceipts([]);
    setParsedIncoming([]);
    setImportResult(null);
    setFileName('');
    setTimeout(() => setPurgeSuccess(false), 5000);
  };

  // Helper to parse dates from Excel serial or string
  const parseExcelDate = (val: any): string | null => {
    if (!val) return null;
    if (typeof val === 'number') {
      try {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
      } catch (e) {
        return null;
      }
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    return str;
  };

  // Parse Uploaded File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsParsing(true);
    setParseError(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true, cellStyles: true });
        
        let extractedPOs: PurchaseOrder[] = [];
        let extractedReceipts: Receipt[] = [];
        let extractedIncoming: IncomingStockItem[] = [];

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (!rawRows || rawRows.length === 0) return;

          const sLower = sheetName.toLowerCase();

          // 1. Purchase Orders Sheet Detection (Matches 'order', 'po', 'pending')
          if (sLower.includes('order') || sLower.includes('po') || sLower.includes('pending')) {
            const poGroups = new Map<string, {
              orderNo: string;
              orderDate: string;
              supplier: string;
              origin: string;
              destination: string;
              customer: string;
              terms: string;
              payment: string;
              deliveryDate: string | null;
              ref: string;
              ocNo: string;
              items: PurchaseOrderItem[];
            }>();

            rawRows.forEach((row, idx) => {
              const orderNo = String(row['ORDER NO.'] || row['ORDER NO'] || row['Order No'] || row['PO Number'] || row['S.No.'] || row['S.No'] || '').trim();
              if (!orderNo || orderNo.toLowerCase().includes('total') || orderNo.toLowerCase().includes('sum')) return;

              const orderDate = parseExcelDate(row['ORDER DATE'] || row['Order Date'] || row['DATE']) || new Date().toISOString().split('T')[0];
              const supplier = String(row['SUPPLIER'] || row['Supplier'] || row['SUPPLIER NAME'] || 'Standard Supplier').trim();
              const origin = String(row['ORIGIN'] || row['Origin'] || row['Make'] || '').trim();
              const grade = String(row['GRADE'] || row['Grade'] || 'Standard Grade').trim();
              const section = String(row['SECTION'] || row['Section'] || 'Round').trim();
              const diaW = row['DIA/W'] || row['DIA'] || row['WIDTH'] || row['Diameter'] || '';
              const t = row['T'] || row['THICKNESS'] || row['Thickness'] || '';
              const length = row['LENGTH'] || row['Length'] || row['L'] || '';
              const treatment = String(row['TREATMENT'] || row['Treatment'] || '').trim();
              const condition = String(row['surface condition'] || row['condition'] || row['Condition'] || '').trim();
              const orQty = Number(row['OR. QTY.'] || row['OR. QTY'] || row['Ordered Qty'] || row['QTY'] || 0);
              const price = Number(row['PRICE'] || row['Price'] || 0);
              const currency = String(row['CURRENCY'] || row['Currency'] || 'USD').trim();
              const destination = String(row['DESTINATION'] || row['Destination'] || 'Nhava Sheva').trim();
              const customer = String(row['CUSTOMER'] || row['Customer'] || 'SE').trim();
              const terms = String(row['TERMS'] || row['Delivery Terms'] || row['DELIVERY'] || 'FOB').trim();
              const payment = String(row['PAYMENT'] || row['Payment Terms'] || row['PAYMENT TERMS'] || 'DP at sight').trim();
              const deliveryDate = parseExcelDate(row['CONTRACT DELIVERY DATE'] || row['Contract Delivery Date'] || row['DELIVERY DATE']);
              const ref = String(row['REFRENCE'] || row['REFERENCE'] || row['Reference'] || '').trim();
              const ocNo = String(row['O/C NO'] || row['O/C NO.'] || row['OC.NO.'] || '').trim();
              const lotNo = String(row['LOT No.'] || row['LOT NO.'] || row['LOT NO'] || row['Lot No.'] || '').trim();
              const remarks = String(row['REMARKS'] || row['Remarks'] || '').trim();
              const itemNo = Number(row['ITEM NO.'] || row['ITEM NO'] || row['Item No'] || 0) || (poGroups.get(orderNo)?.items.length || 0) + 1;

              // Exact Business Status Rules:
              const closeVal = String(row['Close'] || row['CLOSE'] || '').trim().toLowerCase();
              const cellAddress = XLSX.utils.encode_cell({ r: idx + 2, c: 1 });
              const cellStyle = ws[cellAddress]?.s;
              const isYellow = (cellStyle?.fgColor?.rgb === 'FFFF00') || (cellStyle?.fgColor?.rgb === 'ffff00');

              let itemStatus: any = 'Open';
              if (closeVal === 'y') {
                itemStatus = 'In Transit';
              } else if (isYellow && lotNo) {
                itemStatus = 'Ready to Ship';
              } else if (!isYellow && lotNo) {
                itemStatus = 'Pending';
              } else {
                itemStatus = 'Open';
              }

              const newItem: PurchaseOrderItem = {
                id: `poi-${orderNo}-${itemNo}-${idx}`,
                purchase_order_id: `po-${orderNo}`,
                po_number: orderNo,
                line_number: itemNo,
                grade_code: grade,
                section_name: section,
                diameter_width: diaW !== '' ? (Number(diaW) || null) : null,
                thickness: t !== '' ? (Number(t) || null) : null,
                length: length !== '' ? (Number(length) || null) : null,
                treatment: treatment || null,
                condition_name: condition || null,
                ordered_quantity: orQty,
                received_quantity: 0,
                ready_quantity: itemStatus === 'Ready to Ship' ? orQty : 0,
                balance_quantity: orQty,
                unit: 'KG',
                purchase_price: price,
                currency: currency,
                expected_delivery_date: deliveryDate,
                destination_port: destination,
                delivery_terms: terms,
                payment_terms: payment,
                lot_number: lotNo || null,
                remarks: remarks || null,
                status: itemStatus
              };

              if (!poGroups.has(orderNo)) {
                poGroups.set(orderNo, {
                  orderNo,
                  orderDate,
                  supplier,
                  origin,
                  destination,
                  customer,
                  terms,
                  payment,
                  deliveryDate,
                  ref,
                  ocNo,
                  items: [newItem]
                });
              } else {
                poGroups.get(orderNo)!.items.push(newItem);
              }
            });

            Array.from(poGroups.values()).forEach(group => {
              const totalOrd = group.items.reduce((s, it) => s + (it.ordered_quantity || 0), 0);
              extractedPOs.push({
                id: `po-${group.orderNo}`,
                po_number: group.orderNo,
                order_date: group.orderDate,
                supplier_id: `sup-${group.supplier.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'default'}`,
                supplier_name: group.supplier,
                customer_name: group.customer,
                reference_person: group.ref,
                origin: group.origin,
                destination: group.destination,
                delivery_terms: group.terms,
                payment_terms: group.payment,
                currency: group.items[0]?.currency || 'USD',
                expected_delivery_date: group.deliveryDate,
                oc_number: group.ocNo,
                status: 'Open',
                total_ordered_qty: totalOrd,
                total_received_qty: 0,
                total_ready_qty: 0,
                total_balance_qty: totalOrd,
                is_closed: false,
                items: group.items,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            });
          }

          // 2. Receipts Sheet Detection (Matches 'receipt', 'recd', or 'closed')
          if (sLower.includes('receipt') || sLower.includes('recd') || sLower.includes('closed')) {
            rawRows.forEach((row, idx) => {
              const orderNo = String(row['ORDER NO.'] || row['ORDER NO'] || row['S.No.'] || row['S.No'] || '').trim();
              const recdQty = Number(row['RECD. QTY.'] || row['RECD. QTY'] || row['Received Qty'] || row['RECD QTY'] || 0);
              if (!orderNo || recdQty <= 0) return;

              const lotNo = String(row['LOT NO.'] || row['LOT NO'] || row['LOT No.'] || row['Lot No'] || row['LOT'] || '').trim();
              const invNo = String(row['INV NO.'] || row['INV NO'] || row['Inv. No'] || row['Invoice No'] || `INV-${orderNo}-${idx + 1}`).trim();
              const invDate = parseExcelDate(row['INV DATE'] || row['Inv. Date'] || row['Invoice Date'] || row['ORDER DATE']) || new Date().toISOString().split('T')[0];
              const containerNo = String(row['CONTAINER NO.'] || row['CONTAINER NO'] || row['Container No'] || '').trim();
              const portLoading = String(row['PORT OF LOADING'] || row['Port of Loading'] || '').trim();
              const yard = String(row['WAREHOUSE LOCATION'] || row['Warehouse Location'] || 'Nhava Sheva Yard').trim();
              const remarks = String(row['REMARKS'] || row['Remarks'] || '').trim();
              const lineNo = Number(row['ITEM NO.'] || row['ITEM NO'] || row['Line Number'] || 1);

              extractedReceipts.push({
                id: `rc-${orderNo}-${lineNo}-${idx + 1}`,
                purchase_order_item_id: `poi-${orderNo}-${lineNo}-1`,
                po_number: orderNo,
                lot_number: lotNo || `LOT-${orderNo}-${lineNo}`,
                receipt_number: `RC-${orderNo}-${idx + 1}`,
                receipt_date: invDate,
                received_quantity: recdQty,
                unit: 'KG',
                supplier_invoice_number: invNo,
                supplier_invoice_date: invDate,
                container_no: containerNo || null,
                port_of_loading: portLoading || null,
                warehouse_location: yard,
                remarks: remarks || null,
                created_at: new Date().toISOString()
              });
            });
          }

          // 3. Incoming Stock Sheet Detection (Matches 'incoming' or 'shipment' or 'stock')
          if (sLower.includes('incoming') || sLower.includes('shipment') || sLower.includes('stock')) {
            rawRows.forEach((row, idx) => {
              const lotNo = String(row['LOT'] || row['Lot'] || row['LOT NO.'] || row['LOT NO'] || '').trim();
              if (!lotNo || lotNo.toLowerCase().includes('total') || lotNo.toLowerCase().includes('sum')) return;

              const supplier = String(row['Supplier'] || row['SUPPLIER'] || 'Standard Supplier').trim();
              const make = String(row['Make'] || row['MAKE'] || row['Origin'] || '').trim();
              const grade = String(row['Grade'] || row['GRADE'] || 'Standard Grade').trim();
              const condition = String(row['Condition'] || row['CONDITION'] || row['Section'] || '').trim();
              const diaW = row['DIA/W'] || row['DIA'] || '';
              const t = row['T'] || '';
              const l = row['L'] || row['LENGTH'] || '';
              const pc = row['pc'] || row['PC'] || row['PIECES'] || null;
              const weight = Number(row['Weight'] || row['WEIGHT'] || row['Weight (KG)'] || 0);
              const port = String(row['Port'] || row['PORT'] || 'Nhava Sheva').trim();
              const customer = String(row['customer'] || row['CUSTOMER'] || 'SE').trim();
              const dateOfShipment = parseExcelDate(row['Date of Shipment'] || row['Shipment Date']);
              const etaSeaport = parseExcelDate(row['ETA (sea port)'] || row['ETA Seaport'] || row['ETA']);
              const recdStatusRaw = String(row['RECEIVED'] || row['Status'] || row['Stage'] || 'IN_TRANSIT').toUpperCase();
              const heatNo = String(row['HEAT NO'] || row['HEAT NO.'] || row['Heat No'] || '').trim();
              const sims = String(row['SIMS'] || row['SIMS Reg'] || '').trim();
              const containerNo = String(row['CONTAINER NO'] || row['Container No'] || '').trim();
              const delTerms = String(row['DEL TERMS'] || row['Delivery Terms'] || 'FOB').trim();
              const payTerms = String(row['PAYMENT TERMS'] || row['Payment Terms'] || 'DP at sight').trim();
              const linkedPo = String(row['ORDER NO.'] || row['ORDER NO'] || row['Linked PO'] || '').trim();

              const stage: 'READY' | 'IN_TRANSIT' | 'RECEIVED' = 
                recdStatusRaw.includes('REC') ? 'RECEIVED' : 
                recdStatusRaw.includes('READY') ? 'READY' : 'IN_TRANSIT';

              extractedIncoming.push({
                id: `inc-bulk-${lotNo}-${idx + 1}`,
                lot_number: lotNo,
                supplier,
                make,
                grade,
                condition: condition || null,
                dia_w: diaW !== '' ? diaW : null,
                t: t !== '' ? t : null,
                l: l !== '' ? l : null,
                pieces: pc ? Number(pc) || pc : null,
                weight: weight,
                port,
                customer: customer || 'SE',
                date_of_shipment: dateOfShipment,
                eta_seaport: etaSeaport,
                received_status: stage,
                heat_no: heatNo || null,
                sims: sims || null,
                container_no: containerNo || null,
                delivery_terms: delTerms,
                payment_terms: payTerms,
                source_sheet: 'INCOMING SE',
                linked_po_number: linkedPo || null
              });
            });
          }
        });

        setParsedPOs(extractedPOs);
        setParsedReceipts(extractedReceipts);
        setParsedIncoming(extractedIncoming);

        if (extractedPOs.length === 0 && extractedReceipts.length === 0 && extractedIncoming.length === 0) {
          setParseError(`Could not detect recognized sheets in "${file.name}". Please ensure sheet names include "Order" (for POs), "Receipt" / "Closed" (for Receipts), or "Incoming" (for Shipments), or download our standard template below.`);
        } else {
          if (extractedPOs.length > 0) setActivePreviewTab('pos');
          else if (extractedReceipts.length > 0) setActivePreviewTab('receipts');
          else setActivePreviewTab('incoming');
        }
      } catch (err: any) {
        console.error('File parsing error:', err);
        setParseError(`Failed to parse Excel file: ${err.message || 'Unknown format error'}`);
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Execute Bulk Commit to Database
  const handleCommitToDatabase = () => {
    setIsImporting(true);
    try {
      const result = dataStore.bulkImportData({
        purchaseOrders: parsedPOs,
        receipts: parsedReceipts,
        incomingStock: parsedIncoming
      });
      setImportResult(result);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            <span>Bulk Data Migration & Upload Engine</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Import your 3 operational worksheets (Purchase Orders, Invoices/Receipts, and Incoming Shipments) directly into the cloud database.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowPurgeModal(true)}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Delete all existing data and reset database to 0"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
              <span>Clear All Data (Reset to 0)</span>
            </button>
          )}
        </div>
      </div>

      {/* Purge Success Banner */}
      {purgeSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="text-xs">
            <strong className="block font-bold">Database Wiped Clean!</strong>
            All previous purchase orders, receipts, and shipments have been deleted from local state and the Supabase cloud database. The system is ready for fresh data.
          </div>
        </div>
      )}

      {/* Template Download Section */}
      <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white border border-blue-200/80 rounded-xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            <span>Official Bulk Upload Templates for Your 3 Sheets</span>
          </div>
          <span className="text-[11px] text-blue-700 bg-blue-100/70 font-semibold px-2 py-0.5 rounded border border-blue-200">
            Pre-Formatted Column Headers
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Download our pre-structured template containing all 3 required sheets. You can fill in your real business data and upload the single workbook below.
        </p>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <a
            href="/templates/Sandeep_Edgetech_Bulk_Upload_Template.xlsx"
            download="Sandeep_Edgetech_Bulk_Upload_Template.xlsx"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-2xs transition-all hover:shadow"
          >
            <Download className="h-4 w-4" />
            <span>Download 3-in-1 Excel Template (.xlsx)</span>
          </a>

          <a
            href="/templates/1_Purchase_Orders_Template.csv"
            download="1_Purchase_Orders_Template.csv"
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>PO Sheet (CSV)</span>
          </a>

          <a
            href="/templates/2_Receipts_Template.csv"
            download="2_Receipts_Template.csv"
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Receipts Sheet (CSV)</span>
          </a>

          <a
            href="/templates/3_Incoming_Stock_Template.csv"
            download="3_Incoming_Stock_Template.csv"
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Incoming Stock (CSV)</span>
          </a>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-blue-600" />
          <span>Upload Excel Workbook or CSV File</span>
        </h2>

        {isViewer ? (
          <div className="border border-dashed border-slate-200 bg-slate-50 rounded-xl p-8 text-center space-y-2">
            <p className="font-semibold text-slate-700 text-sm">Read-Only Mode</p>
            <p className="text-xs text-slate-500">You are logged in with Viewer privileges. File uploads and bulk data imports are disabled.</p>
          </div>
        ) : (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/20 hover:bg-blue-50/40 transition-colors rounded-xl p-8 text-center cursor-pointer space-y-3"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
            />
            <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">
                {fileName ? fileName : 'Click to browse or drag & drop your Excel file here'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports .xlsx, .xls, and .csv containing <strong>Pending Order</strong>, <strong>Closed Order</strong>, and <strong>INCOMING SE</strong> worksheets
              </p>
            </div>
          </div>
        )}

        {isParsing && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center text-xs text-blue-700 font-medium animate-pulse">
            Parsing worksheets, normalizing purchase order items, and reconciling lot records...
          </div>
        )}

        {parseError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Import Warning:</strong>
              <span>{parseError}</span>
            </div>
          </div>
        )}
      </div>

      {/* Parsed Data Preview & Commit Action */}
      {(parsedPOs.length > 0 || parsedReceipts.length > 0 || parsedIncoming.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-600" />
                <span>Extracted Records Ready for Database Commit</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review extracted records from your workbook before committing to the cloud database.
              </p>
            </div>

            {!isViewer && (
              <button
                type="button"
                onClick={handleCommitToDatabase}
                disabled={isImporting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-sm transition-all"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{isImporting ? 'Saving to Database...' : 'Commit & Save to Cloud Database'}</span>
              </button>
            )}
          </div>

          {/* Statistics summary chips */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div 
              onClick={() => setActivePreviewTab('pos')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                activePreviewTab === 'pos' ? 'bg-blue-50/80 border-blue-300 shadow-2xs' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <div className="p-2 bg-blue-600 text-white rounded-lg">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Purchase Orders</span>
                <span className="font-bold text-slate-900 text-sm">
                  {parsedPOs.length} POs <span className="text-xs font-normal text-slate-500">({parsedPOs.reduce((s, p) => s + (p.items?.length || 0), 0)} items)</span>
                </span>
              </div>
            </div>

            <div 
              onClick={() => setActivePreviewTab('receipts')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                activePreviewTab === 'receipts' ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <div className="p-2 bg-emerald-600 text-white rounded-lg">
                <ReceiptIcon className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Receipts & Invoices</span>
                <span className="font-bold text-slate-900 text-sm">
                  {parsedReceipts.length} Receipts
                </span>
              </div>
            </div>

            <div 
              onClick={() => setActivePreviewTab('incoming')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                activePreviewTab === 'incoming' ? 'bg-purple-50/80 border-purple-300 shadow-2xs' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <div className="p-2 bg-purple-600 text-white rounded-lg">
                <Ship className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Incoming Shipments</span>
                <span className="font-bold text-slate-900 text-sm">
                  {parsedIncoming.length} Shipment Lots
                </span>
              </div>
            </div>
          </div>

          {/* Preview Tables */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
            {activePreviewTab === 'pos' && (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b">
                    <tr>
                      <th className="py-2.5 px-3 font-bold text-slate-700">PO Number</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Order Date</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Supplier</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Origin / Make</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700 text-center">Items</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700 text-right">Total Qty (KG)</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Destination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedPOs.length === 0 ? (
                      <tr><td colSpan={7} className="py-6 text-center text-slate-400">No PO rows detected in workbook.</td></tr>
                    ) : (
                      parsedPOs.map((po, idx) => (
                        <tr key={`${po.po_number}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-blue-600 font-mono">{po.po_number}</td>
                          <td className="py-2 px-3 text-slate-600">{formatDate(po.order_date)}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{po.supplier_name}</td>
                          <td className="py-2 px-3 text-slate-600">{po.origin || '—'}</td>
                          <td className="py-2 px-3 text-center font-bold text-slate-700">{po.items?.length || 0}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">{formatWeight(po.total_ordered_qty)}</td>
                          <td className="py-2 px-3 text-slate-600">{po.destination || 'N.S.'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activePreviewTab === 'receipts' && (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b">
                    <tr>
                      <th className="py-2.5 px-3 font-bold text-slate-700">PO Number</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Lot Number</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Invoice Number</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Invoice Date</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700 text-right">Received Qty (KG)</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Container No.</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Yard / Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedReceipts.length === 0 ? (
                      <tr><td colSpan={7} className="py-6 text-center text-slate-400">No receipt rows detected in workbook.</td></tr>
                    ) : (
                      parsedReceipts.map((rc, idx) => (
                        <tr key={`${rc.id}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-blue-600 font-mono">{rc.po_number}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">{rc.lot_number}</td>
                          <td className="py-2 px-3 text-slate-700">{rc.supplier_invoice_number || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">{formatDate(rc.receipt_date)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{formatWeight(rc.received_quantity)}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{rc.container_no || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">{rc.warehouse_location || 'Nhava Sheva Yard'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activePreviewTab === 'incoming' && (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b">
                    <tr>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Lot Number</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Supplier</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Grade & Specs</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700 text-right">Cargo Weight (KG)</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Destination Port</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700">Sea Port ETA</th>
                      <th className="py-2.5 px-3 font-bold text-slate-700 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedIncoming.length === 0 ? (
                      <tr><td colSpan={7} className="py-6 text-center text-slate-400">No incoming stock rows detected in workbook.</td></tr>
                    ) : (
                      parsedIncoming.map((inc, idx) => (
                        <tr key={`${inc.id}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900 font-mono">{inc.lot_number}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{inc.supplier}</td>
                          <td className="py-2 px-3 text-slate-700">{inc.grade} • {inc.dia_w ? `DIA ${inc.dia_w}` : ''} {inc.t ? `T${inc.t}` : ''}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">{formatWeight(inc.weight)}</td>
                          <td className="py-2 px-3 text-slate-600">{inc.port || 'Nhava Sheva'}</td>
                          <td className="py-2 px-3 text-slate-600 font-semibold">{formatDate(inc.eta_seaport)}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inc.received_status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              inc.received_status === 'READY' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {inc.received_status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Success Modal / Banner */}
      {importResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-950">Bulk Import Successfully Committed to Cloud Database!</h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                All records have been parsed, cross-referenced, and saved to Supabase.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/80 p-4 rounded-xl border border-emerald-200/60 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px] font-semibold">Purchase Orders Added:</span>
              <strong className="text-base font-bold text-slate-900">{importResult.poCount} POs</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px] font-semibold">Receipts Recorded:</span>
              <strong className="text-base font-bold text-emerald-700">{importResult.receiptCount} Receipts</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px] font-semibold">Shipment Lots Active:</span>
              <strong className="text-base font-bold text-blue-700">{importResult.stockCount} Lots</strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/purchasing/purchase-orders"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Go to Purchase Orders →</span>
            </Link>
            <Link
              href="/purchasing/shipments"
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Ship className="h-4 w-4 text-blue-600" />
              <span>Go to Shipments & Ports →</span>
            </Link>
            <Link
              href="/inventory/lots"
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <span>Go to Lot Directory →</span>
            </Link>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Database */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-full">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Clear All Data (Reset to 0)?</h3>
                <p className="text-xs text-slate-500">This action will delete all existing POs and receipts.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
              This will permanently delete all <strong>purchase orders</strong>, <strong>receipts</strong>, <strong>inventory lots</strong>, and <strong>incoming shipments</strong> from both memory and the Supabase cloud database so you can start completely fresh with zero records.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeAllData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-2xs"
              >
                Yes, Delete All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Reference Details Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow space-y-4 text-xs">
        <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Info className="h-4 w-4 text-blue-600" />
          <span>Format Reference Guide for Bulk Upload Sheets</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs text-blue-700">
              <ShoppingBag className="h-4 w-4" />
              <span>Sheet 1: Purchase Orders</span>
            </div>
            <p className="text-[11px] text-slate-500">Sheet name can be <code>1_Purchase_Orders</code> or <code>Pending Order</code>.</p>
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
              <li><strong>ORDER NO.</strong> (Required) - e.g. <code>PO-1093</code></li>
              <li><strong>ORDER DATE</strong> (Required) - <code>YYYY-MM-DD</code></li>
              <li><strong>SUPPLIER</strong> (Required) - Vendor name</li>
              <li><strong>ITEM NO.</strong> (Required) - 1, 2, 3...</li>
              <li><strong>GRADE</strong> (Required) - e.g. <code>QC-11</code>, <code>304</code></li>
              <li><strong>OR. QTY.</strong> (Required) - Contract weight in KG</li>
              <li><strong>SECTION</strong> - Round, Flat, Square</li>
              <li><strong>DIA/W, T, LENGTH</strong> - Dimensions in mm</li>
              <li><strong>PRICE & CURRENCY</strong> - Rate & currency</li>
              <li><strong>DESTINATION</strong> - Port of discharge</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs text-emerald-700">
              <ReceiptIcon className="h-4 w-4" />
              <span>Sheet 2: Receipts / Invoices</span>
            </div>
            <p className="text-[11px] text-slate-500">Sheet name can be <code>2_Receipts</code> or <code>Closed Order</code>.</p>
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
              <li><strong>ORDER NO.</strong> (Required) - PO number to link to</li>
              <li><strong>RECD. QTY.</strong> (Required) - Landed weight in KG</li>
              <li><strong>LOT NO.</strong> (Required) - Assigned physical lot ID</li>
              <li><strong>INV NO.</strong> - Supplier invoice number</li>
              <li><strong>INV DATE</strong> - Invoice or receipt date</li>
              <li><strong>CONTAINER NO.</strong> - Shipping container ID</li>
              <li><strong>WAREHOUSE LOCATION</strong> - Storage yard</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs text-purple-700">
              <Ship className="h-4 w-4" />
              <span>Sheet 3: Incoming Shipments</span>
            </div>
            <p className="text-[11px] text-slate-500">Sheet name can be <code>3_Incoming_Stock</code> or <code>INCOMING SE</code>.</p>
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
              <li><strong>LOT</strong> (Required) - Cargo lot identifier</li>
              <li><strong>Supplier</strong> (Required) - Supplier name</li>
              <li><strong>Grade</strong> (Required) - Steel grade code</li>
              <li><strong>Weight</strong> (Required) - Total cargo weight in KG</li>
              <li><strong>Port</strong> (Required) - Destination sea port</li>
              <li><strong>ETA (sea port)</strong> (Required) - Vessel ETA</li>
              <li><strong>RECEIVED</strong> (Required) - <code>IN_TRANSIT</code> / <code>READY</code></li>
              <li><strong>HEAT NO & SIMS</strong> - Mill cert & SIMS ID</li>
              <li><strong>ORDER NO.</strong> - (Optional) Auto-links cargo to PO</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
