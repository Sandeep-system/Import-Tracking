'use client';

import React, { useState } from 'react';
import { Database, Plus, Search, Layers, CheckCircle2, ShieldCheck } from 'lucide-react';
import masterSeeds from '@/lib/master_seeds.json';

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<'grades' | 'conditions' | 'makes' | 'sections'>('grades');
  const [search, setSearch] = useState('');

  const grades = masterSeeds.grades.filter(g => g.toLowerCase().includes(search.toLowerCase()));
  const conditions = masterSeeds.conditions.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const makes = masterSeeds.makes.filter(m => m.toLowerCase().includes(search.toLowerCase()));
  const sections = ['Round', 'Plate', 'FLAT'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Master Reference Values</h1>
          <p className="text-xs text-slate-500">Standardized dictionaries extracted directly from Master Value sheet in workbook</p>
        </div>
      </div>

      <div className="flex border-b border-slate-200 text-xs font-semibold space-x-2 bg-white px-4 rounded-t-xl card-shadow">
        {[
          { id: 'grades', label: `Steel Grades (${masterSeeds.grades.length})` },
          { id: 'conditions', label: `Surface Conditions (${masterSeeds.conditions.length})` },
          { id: 'makes', label: `Makes & Mills (${masterSeeds.makes.length})` },
          { id: 'sections', label: `Product Sections (${sections.length})` },
        ].map((tab: any) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 px-3.5 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-b-xl border border-slate-200 card-shadow p-6 space-y-4">
        <div className="max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search master values..."
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        {activeTab === 'grades' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {grades.map((g, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 flex items-center justify-between">
                <span>{g}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'conditions' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {conditions.map((c, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>{c}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-medium">Standard Spec</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'makes' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {makes.map((m, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 flex items-center justify-between">
                <span>{m}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sections' && (
          <div className="grid grid-cols-3 gap-4">
            {sections.map((s, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="text-sm">{s}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800">Profile</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
