'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { 
  Layers, 
  Search, 
  Download, 
  Truck, 
  PackageCheck, 
  X, 
  ExternalLink, 
  Filter, 
  Building2, 
  MapPin,
  ArrowRight,
  ArrowUpDown
} from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { Lot } from '@/types';
import { formatWeight, formatDate, getStatusBadgeClass } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function StockPage() {
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'IN_STOCK' | 'DEPLETED'>('ALL');

  // Inspection Modal for viewing all lots of a specific stock specification
  const [selectedSpec, setSelectedSpec] = useState<{
    grade: string;
    section: string;
    lots: Lot[];
  } | null>(null);

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const lots = useMemo(() => dataStore.getLots(), [dataVersion]);

  // Unique options for dropdown filters
  const uniqueGrades = useMemo(() => {
    const set = new Set(lots.map(l => l.grade_code).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [lots]);

  const uniqueSections = useMemo(() => {
    const set = new Set(lots.map(l => l.section_name).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [lots]);

  // Group by Grade and Section, preserving individual lots
  const specMap: Record<string, {
    grade: string;
    section: string;
    lotsCount: number;
    totalLanded: number;
    totalAvailable: number;
    dimensions: Set<string>;
    lots: Lot[];
  }> = {};

  for (const l of lots) {
    const key = `${l.grade_code}__${l.section_name}`;
    if (!specMap[key]) {
      specMap[key] = {
        grade: l.grade_code || 'Other',
        section: l.section_name || 'Standard',
        lotsCount: 0,
        totalLanded: 0,
        totalAvailable: 0,
        dimensions: new Set(),
        lots: []
      };
    }
    specMap[key].lotsCount++;
    specMap[key].totalLanded += (l.total_received_qty || 0);
    specMap[key].totalAvailable += (l.available_qty || 0);
    specMap[key].lots.push(l);
    if (l.dimensions_display) specMap[key].dimensions.add(l.dimensions_display);
  }

  // Filter specs according to dropdown filters and search
  const specsList = useMemo(() => {
    return Object.values(specMap).filter(s => {
      // Search text filter
      if (search) {
        const q = search.toLowerCase();
        const matchesGrade = s.grade.toLowerCase().includes(q);
        const matchesSection = s.section.toLowerCase().includes(q);
        const matchesDim = Array.from(s.dimensions).some(d => d.toLowerCase().includes(q));
        const matchesLot = s.lots.some(l => l.lot_number.toLowerCase().includes(q));
        if (!matchesGrade && !matchesSection && !matchesDim && !matchesLot) {
          return false;
        }
      }

      // Grade dropdown filter
      if (selectedGrade !== 'ALL' && s.grade !== selectedGrade) {
        return false;
      }

      // Section dropdown filter
      if (selectedSection !== 'ALL' && s.section !== selectedSection) {
        return false;
      }

      // Stock Availability filter
      if (availabilityFilter === 'IN_STOCK' && s.totalAvailable <= 0) {
        return false;
      }
      if (availabilityFilter === 'DEPLETED' && s.totalAvailable > 0) {
        return false;
      }

      return true;
    });
  }, [specMap, search, selectedGrade, selectedSection, availabilityFilter]);

  const totalYardAvailable = useMemo(() => {
    return lots.reduce((acc, l) => acc + (l.available_qty || 0), 0);
  }, [lots]);

  const hasActiveFilters = search !== '' || selectedGrade !== 'ALL' || selectedSection !== 'ALL' || availabilityFilter !== 'ALL';

  const handleResetFilters = () => {
    setSearch('');
    setSelectedGrade('ALL');
    setSelectedSection('ALL');
    setAvailabilityFilter('ALL');
  };

  const handleExport = () => {
    const exportData = specsList.map(s => ({
      'Steel Grade': s.grade,
      'Product Section': s.section,
      'Lots Count': s.lotsCount,
      'Total Landed Weight (KG)': s.totalLanded,
      'Available Stock (KG)': s.totalAvailable,
      'Active Dimensions': Array.from(s.dimensions).join(', ')
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock By Spec');
    XLSX.writeFile(wb, `Stock_By_Spec_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Available Stock by Specification</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Aggregated physical inventory grouped by steel grade, product profile, and dimensions with lot drilldowns
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inventory/lots"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 card-shadow transition-colors"
          >
            <Truck className="h-3.5 w-3.5 text-blue-600" />
            <span>Open Lot Directory</span>
          </Link>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Stock Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search grade, section, size, lot #..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Grade Dropdown Filter */}
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Grades ({uniqueGrades.length})</option>
            {uniqueGrades.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* Section Dropdown Filter */}
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Sections ({uniqueSections.length})</option>
            {uniqueSections.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Availability Filter */}
          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as any)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Inventory Status</option>
            <option value="IN_STOCK">In Stock Only (&gt; 0 KG)</option>
            <option value="DEPLETED">Depleted (0 KG)</option>
          </select>

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-slate-600 font-medium">
          <span>Specs: <strong className="text-slate-900">{specsList.length}</strong></span>
          <span>•</span>
          <span>
            Total Stock in Yard: <strong className="text-emerald-600">{formatWeight(totalYardAvailable)}</strong>
          </span>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-285px)] min-h-[340px] relative w-full">
          <table className="w-full text-left border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="table-header">Steel Grade</th>
              <th className="table-header">Section Profile</th>
              <th className="table-header text-center">Active Lots</th>
              <th className="table-header text-right">Total Landed Qty</th>
              <th className="table-header text-right">Available in Yard</th>
              <th className="table-header">Active Dimension Sizes</th>
              <th className="table-header text-right">Inspect Stock Lots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {specsList.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <Layers className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600">No stock specifications found.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Try adjusting your filters or search term.</p>
                </td>
              </tr>
            ) : (
              specsList.map((s, idx) => (
                <tr 
                  key={idx} 
                  className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                  onClick={() => setSelectedSpec({ grade: s.grade, section: s.section, lots: s.lots })}
                >
                  <td className="table-cell font-bold text-slate-900">{s.grade}</td>
                  <td className="table-cell font-semibold text-slate-700">{s.section}</td>
                  <td className="table-cell text-center">
                    <span className="px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {s.lotsCount} Lot{s.lotsCount > 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="table-cell text-right font-medium text-slate-700">{formatWeight(s.totalLanded)}</td>
                  <td className="table-cell text-right font-bold text-emerald-600 text-sm">
                    {formatWeight(s.totalAvailable)}
                  </td>
                  <td className="table-cell text-slate-500 font-mono text-[11px] truncate max-w-xs">
                    {Array.from(s.dimensions).slice(0, 3).join(', ')}
                    {s.dimensions.size > 3 ? ` +${s.dimensions.size - 3} more` : ''}
                  </td>
                  <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedSpec({ grade: s.grade, section: s.section, lots: s.lots })}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1 transition-colors shadow-sm"
                        title="View all individual lots of this stock"
                      >
                        <Truck className="h-3 w-3" />
                        <span>View Lots ({s.lotsCount})</span>
                      </button>

                      <Link
                        href={`/inventory/lots?grade=${encodeURIComponent(s.grade)}&section=${encodeURIComponent(s.section)}`}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Open filtered lots in Lot Directory"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* MODAL: VIEW ALL LOTS OF THIS STOCK SPECIFICATION */}
      {selectedSpec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span>Lots for Steel Grade: {selectedSpec.grade}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 font-semibold">{selectedSpec.section}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Showing all individual warehouse lots and current stock allocations for this specification
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedSpec(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal KPI Highlights */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50/50 border-b border-slate-200 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 card-shadow">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Available Stock</span>
                <span className="text-base font-extrabold text-emerald-600">
                  {formatWeight(selectedSpec.lots.reduce((acc, l) => acc + (l.available_qty || 0), 0))}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 card-shadow">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Landed Qty</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatWeight(selectedSpec.lots.reduce((acc, l) => acc + (l.total_received_qty || 0), 0))}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 card-shadow flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Lots</span>
                  <span className="text-base font-extrabold text-blue-700">
                    {selectedSpec.lots.length} Lots
                  </span>
                </div>
                <Link
                  href={`/inventory/lots?grade=${encodeURIComponent(selectedSpec.grade)}&section=${encodeURIComponent(selectedSpec.section)}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition-colors"
                >
                  <span>Lot Directory</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Lots Table */}
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="table-header">Lot Number</th>
                    <th className="table-header">PO Number</th>
                    <th className="table-header">Supplier</th>
                    <th className="table-header">Dimensions</th>
                    <th className="table-header text-right">Landed Qty</th>
                    <th className="table-header text-right">Allocated / Sold</th>
                    <th className="table-header text-right">Available in Yard</th>
                    <th className="table-header">Warehouse Location</th>
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedSpec.lots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell">
                        <span className="font-mono font-bold text-slate-900 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                          {lot.lot_number}
                        </span>
                      </td>

                      <td className="table-cell">
                        {lot.po_number ? (
                          <Link
                            href={`/purchasing/purchase-orders/${lot.po_number}`}
                            className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <span>PO #{lot.po_number}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="table-cell font-medium text-slate-800 truncate max-w-[140px]" title={lot.supplier_name || ''}>
                        {lot.supplier_name || 'Standard Supplier'}
                      </td>

                      <td className="table-cell font-mono text-slate-600">
                        {lot.dimensions_display || '—'}
                      </td>

                      <td className="table-cell text-right font-medium text-slate-700">
                        {formatWeight(lot.total_received_qty)}
                      </td>

                      <td className="table-cell text-right text-slate-500 font-medium">
                        {formatWeight(lot.total_allocated_sold_qty || 0)}
                      </td>

                      <td className="table-cell text-right font-bold text-emerald-600">
                        {formatWeight(lot.available_qty)}
                      </td>

                      <td className="table-cell">
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{lot.warehouse_location || 'Main Yard'}</span>
                        </div>
                      </td>

                      <td className="table-cell text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(lot.status)}`}>
                          {lot.status}
                        </span>
                      </td>

                      <td className="table-cell text-right">
                        <Link
                          href={`/inventory/lots?search=${encodeURIComponent(lot.lot_number)}`}
                          className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] rounded border border-slate-200 transition-colors"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Found <strong className="text-slate-900">{selectedSpec.lots.length}</strong> lot records for this stock specification.
              </span>
              <button
                onClick={() => setSelectedSpec(null)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
