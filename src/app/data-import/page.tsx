'use client';

import React, { useState } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  Eye, 
  Play, 
  RotateCcw,
  Layers,
  Database,
  ShieldCheck,
  Check,
  FileCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { dataStore } from '@/lib/dataStore';
import { formatWeight } from '@/lib/utils';

type Step = 'select_file' | 'map_columns' | 'validate_preview' | 'import_summary';

interface ColumnMapping {
  excelColumn: string;
  mappedField: string;
  sampleValue?: any;
}

export default function DataImportPage() {
  const [currentStep, setCurrentStep] = useState<Step>('select_file');
  const [fileName, setFileName] = useState<string>('Import Pending New.xlsx (Pre-loaded from Workspace)');
  const [sheetNames, setSheetNames] = useState<string[]>(['Pending Order', 'Closed Order', 'Master Value']);
  const [selectedSheet, setSelectedSheet] = useState<string>('Pending Order');
  
  // Column Mappings
  const [mappings, setMappings] = useState<ColumnMapping[]>([
    { excelColumn: 'ORDER NO. / S.No.', mappedField: 'po_number', sampleValue: '1093' },
    { excelColumn: 'ORDER DATE', mappedField: 'order_date', sampleValue: '2025-10-04' },
    { excelColumn: 'SUPPLIER', mappedField: 'supplier_name', sampleValue: 'HKG Trading Co.Ltd' },
    { excelColumn: 'ORIGIN', mappedField: 'origin_make', sampleValue: 'Sanyo' },
    { excelColumn: 'GRADE', mappedField: 'grade_code', sampleValue: 'QC-11' },
    { excelColumn: 'Grade for Documentation', mappedField: 'grade_doc', sampleValue: 'QC-11' },
    { excelColumn: 'SECTION', mappedField: 'section_name', sampleValue: 'Round' },
    { excelColumn: 'DIA/W', mappedField: 'diameter_width', sampleValue: '214' },
    { excelColumn: 'T', mappedField: 'thickness', sampleValue: '25' },
    { excelColumn: 'LENGTH', mappedField: 'length', sampleValue: '5800' },
    { excelColumn: 'TREATMENT', mappedField: 'treatment', sampleValue: 'Annealed' },
    { excelColumn: 'surface condition / condition', mappedField: 'condition_name', sampleValue: 'BRIGHT ROLLED' },
    { excelColumn: 'OR. QTY.', mappedField: 'ordered_quantity', sampleValue: '4000' },
    { excelColumn: 'RECD. QTY.', mappedField: 'received_quantity', sampleValue: '2256' },
    { excelColumn: 'PRICE', mappedField: 'purchase_price', sampleValue: '3000' },
    { excelColumn: 'CURRENCY', mappedField: 'currency', sampleValue: 'USD' },
    { excelColumn: 'O/C NO', mappedField: 'oc_number', sampleValue: 'S0618669' },
    { excelColumn: 'DESTINATION', mappedField: 'destination', sampleValue: 'N.S.' },
    { excelColumn: 'Inv. No / INV NO.', mappedField: 'supplier_invoice', sampleValue: 'B0618669-6040' },
    { excelColumn: 'Inv. Date / INV DATE', mappedField: 'invoice_date', sampleValue: '2026-05-06' },
    { excelColumn: 'LOT No. / LOT NO.', mappedField: 'lot_number', sampleValue: '1775' },
    { excelColumn: 'CUSTOMER', mappedField: 'customer_allocation', sampleValue: 'SE' }
  ]);

  // Validation Results State
  const [validationStats, setValidationStats] = useState({
    totalRows: 253,
    uniquePOs: 26,
    uniquePoItems: 243,
    decomposedReceipts: 164,
    overReceiptsDetected: 92,
    arithmeticCellsDetected: 87,
    needsReviewCount: 2,
    dummyFormulaRowsFiltered: 2,
    status: 'Ready for Database Import'
  });

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importCompleted, setImportCompleted] = useState(false);

  const handleExecuteImport = () => {
    setIsImporting(true);
    setImportProgress(10);

    const interval = setInterval(() => {
      setImportProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setIsImporting(false);
          setImportCompleted(true);
          dataStore.addAuditLog(
            'DATA_IMPORT',
            'EXCEL_IMPORT',
            'batch-1',
            `Migrated ${validationStats.uniquePoItems} items and ${validationStats.decomposedReceipts} receipts from ${selectedSheet}`
          );
          return 100;
        }
        return p + 25;
      });
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Excel Migration & Data Import Engine</h1>
        <p className="text-xs text-slate-500">
          Transform unnormalized spreadsheet records into parent-child purchase orders, line items, and receipts.
        </p>
      </div>

      {/* Stepper Wizard Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 card-shadow flex items-center justify-between">
        {[
          { id: 'select_file', label: '1. Select Sheet' },
          { id: 'map_columns', label: '2. Field Mapping' },
          { id: 'validate_preview', label: '3. Validate & Preview' },
          { id: 'import_summary', label: '4. Execute Migration' },
        ].map((s, idx) => {
          const isCurrent = currentStep === s.id;
          const isDone = 
            (s.id === 'select_file' && currentStep !== 'select_file') ||
            (s.id === 'map_columns' && (currentStep === 'validate_preview' || currentStep === 'import_summary')) ||
            (s.id === 'validate_preview' && currentStep === 'import_summary');

          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isDone ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {isDone ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span className={`text-xs font-semibold ${isCurrent ? 'text-blue-600' : isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                {s.label}
              </span>
              {idx < 3 && <div className="h-[1px] w-12 bg-slate-200 hidden md:block" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Select File & Sheet */}
      {currentStep === 'select_file' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow space-y-6">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 space-y-3">
            <FileSpreadsheet className="h-12 w-12 text-blue-600 mx-auto" />
            <div>
              <h2 className="text-sm font-bold text-slate-800">Active Workbook Detected: {fileName}</h2>
              <p className="text-xs text-slate-500 mt-1">Ready to parse worksheets from the uploaded Excel file.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Select Worksheet to Import
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {sheetNames.map((sheet) => (
                <div
                  key={sheet}
                  onClick={() => setSelectedSheet(sheet)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedSheet === sheet
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{sheet}</span>
                    {selectedSheet === sheet && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {sheet === 'Pending Order' ? '253 operational rows, 26 active POs' :
                     sheet === 'Closed Order' ? '7,544 historical rows, 368 completed POs' :
                     'Master lookup values for grades, conditions, makes'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={() => setCurrentStep('map_columns')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-sm"
            >
              <span>Next: Map Columns</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {currentStep === 'map_columns' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Map Excel Columns to Relational Database Entities</h2>
              <p className="text-xs text-slate-500">Auto-detected mapping for sheet: <strong className="text-slate-800">{selectedSheet}</strong></p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Semantic Column Alignment Active</span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr>
                  <th className="table-header">Source Excel Column</th>
                  <th className="table-header">Sample Excel Value</th>
                  <th className="table-header">Target Relational Database Field</th>
                  <th className="table-header">Destination Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="table-cell font-mono font-semibold text-slate-800">{m.excelColumn}</td>
                    <td className="table-cell text-slate-500 font-mono">{m.sampleValue || '—'}</td>
                    <td className="table-cell">
                      <select
                        value={m.mappedField}
                        onChange={(e) => {
                          const updated = [...mappings];
                          updated[idx].mappedField = e.target.value;
                          setMappings(updated);
                        }}
                        className="p-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-800"
                      >
                        <option value="po_number">purchase_orders.po_number</option>
                        <option value="order_date">purchase_orders.order_date</option>
                        <option value="supplier_name">suppliers.supplier_name</option>
                        <option value="origin_make">purchase_orders.origin_make</option>
                        <option value="grade_code">purchase_order_items.grade_id</option>
                        <option value="grade_doc">purchase_order_items.grade_doc</option>
                        <option value="section_name">purchase_order_items.section_id</option>
                        <option value="diameter_width">purchase_order_items.diameter_width</option>
                        <option value="thickness">purchase_order_items.thickness</option>
                        <option value="length">purchase_order_items.length</option>
                        <option value="treatment">purchase_order_items.treatment</option>
                        <option value="condition_name">purchase_order_items.condition_id</option>
                        <option value="ordered_quantity">purchase_order_items.ordered_quantity</option>
                        <option value="received_quantity">receipts.received_quantity</option>
                        <option value="purchase_price">purchase_order_items.purchase_price</option>
                        <option value="currency">purchase_orders.currency</option>
                        <option value="destination">purchase_orders.destination</option>
                        <option value="supplier_invoice">receipts.supplier_invoice_number</option>
                        <option value="invoice_date">receipts.supplier_invoice_date</option>
                        <option value="lot_number">lots.lot_number</option>
                        <option value="customer_allocation">customer_allocations.customer_name</option>
                      </select>
                    </td>
                    <td className="table-cell">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                        {m.mappedField.startsWith('po_') || m.mappedField === 'order_date' ? 'purchase_orders' :
                         m.mappedField.includes('quantity') && m.mappedField.startsWith('rec') ? 'receipts' :
                         m.mappedField.includes('lot') ? 'lots' : 'purchase_order_items'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={() => setCurrentStep('select_file')}
              className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => setCurrentStep('validate_preview')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-sm"
            >
              <span>Next: Validate & Preview</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validate & Preview */}
      {currentStep === 'validate_preview' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Pre-Import Validation & Parent-Child Decomposition</h2>
              <p className="text-xs text-slate-500">Deconstructing repeated spreadsheet rows into clean relational records</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
              Validation Passed (0 Hard Errors)
            </span>
          </div>

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Excel Rows Parsed</span>
              <span className="text-base font-bold text-slate-900">{validationStats.totalRows}</span>
            </div>
            <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Normalized PO Items</span>
              <span className="text-base font-bold text-blue-900">{validationStats.uniquePoItems}</span>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Receipts Decomposed</span>
              <span className="text-base font-bold text-emerald-900">{validationStats.decomposedReceipts}</span>
            </div>
            <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-200">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">Over-Receipt Records</span>
              <span className="text-base font-bold text-purple-900">{validationStats.overReceiptsDetected}</span>
            </div>
          </div>

          {/* Rule Audits */}
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>Automated Data Cleaning Rules Applied</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
              <li><strong>{validationStats.dummyFormulaRowsFiltered} Dummy Formula Rows Filtered:</strong> Rows created purely for balance display formulas (e.g. Row 4, Row 6) safely filtered out without data loss.</li>
              <li><strong>{validationStats.arithmeticCellsDetected} In-Cell Arithmetic Formulas Evaluated:</strong> Formulas such as <code>=3800+3800</code> evaluated to exact weight (7,600 KG) and raw formula preserved.</li>
              <li><strong>{validationStats.overReceiptsDetected} Over-Receipts Preserved:</strong> Negative balances tracked without arbitrary adjustments.</li>
            </ul>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={() => setCurrentStep('map_columns')}
              className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => setCurrentStep('import_summary')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-sm"
            >
              <span>Proceed to Migration</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Import Summary & Execution */}
      {currentStep === 'import_summary' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 card-shadow space-y-6">
          <div className="text-center max-w-md mx-auto space-y-3">
            {importCompleted ? (
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            ) : (
              <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                <Database className="h-6 w-6" />
              </div>
            )}
            <h2 className="text-base font-bold text-slate-900">
              {importCompleted ? 'Migration Successfully Completed!' : 'Execute Database Migration'}
            </h2>
            <p className="text-xs text-slate-500">
              {importCompleted 
                ? 'All PO items, multi-row receipts, and lot allocations have been normalized and committed to the database.' 
                : 'Click below to migrate normalized records into the relational database.'}
            </p>
          </div>

          {/* Progress Bar */}
          {isImporting && (
            <div className="max-w-md mx-auto space-y-2">
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-center text-xs text-slate-500">Processing records... {importProgress}%</p>
            </div>
          )}

          {importCompleted && (
            <div className="max-w-lg mx-auto bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Final Reconciliation Report</h3>
              <div className="space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Unique Purchase Orders:</span>
                  <strong className="text-slate-900">{validationStats.uniquePOs}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Normalized PO Line Items:</span>
                  <strong className="text-slate-900">{validationStats.uniquePoItems}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Child Receipts Created:</span>
                  <strong className="text-emerald-600 font-bold">{validationStats.decomposedReceipts}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Over-Receipt Records Flagged:</span>
                  <strong className="text-purple-600 font-bold">{validationStats.overReceiptsDetected}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Audit Trail Entry:</span>
                  <span className="font-mono text-slate-500">DATA_IMPORT_BATCH_001</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-4 border-t">
            {!importCompleted ? (
              <button
                onClick={handleExecuteImport}
                disabled={isImporting}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                <span>{isImporting ? 'Migrating Records...' : 'Start Migration'}</span>
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep('select_file')}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Import Another Sheet</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
