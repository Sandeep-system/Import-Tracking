'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Search, Plus, MapPin, Globe, Phone, Mail, ShoppingBag, X } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatWeight } from '@/lib/utils';

export default function SuppliersPage() {
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // New Supplier Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [terms, setTerms] = useState('DP at sight');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const suppliers = dataStore.getSuppliers();
  const allPOs = dataStore.getPurchaseOrders();

  const filtered = suppliers.filter(s => 
    s.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    s.country?.toLowerCase().includes(search.toLowerCase()) ||
    s.supplier_code?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    dataStore.createSupplier({
      supplier_name: name.trim(),
      supplier_code: code.trim() || undefined,
      country: country.trim() || 'Overseas',
      default_currency: currency,
      payment_terms: terms.trim() || undefined,
      contact_person: contactPerson.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
    });

    // Reset Form
    setName('');
    setCode('');
    setCountry('');
    setCurrency('USD');
    setTerms('DP at sight');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setAddress('');
    setIsAddOpen(false);

    setDataVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:data-updated'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Overseas Suppliers & Mills</h1>
          <p className="text-xs text-slate-500">Manage international steel suppliers, terms, and purchase volumes</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Search and Count Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by name, country, code..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
          />
        </div>
        <span className="text-slate-500 font-medium">
          Total Suppliers: <strong className="text-slate-900">{filtered.length}</strong>
        </span>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s) => {
          const supplierPOs = allPOs.filter(p => p.supplier_id === s.id || p.supplier_name === s.supplier_name);
          const totalOrd = supplierPOs.reduce((acc, p) => acc + (p.total_ordered_qty || 0), 0);
          const totalPend = supplierPOs.reduce((acc, p) => acc + (p.total_balance_qty || 0), 0);

          return (
            <div key={s.id} className="bg-white p-5 rounded-xl border border-slate-200 card-shadow flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-xs">{s.supplier_name}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-slate-400">{s.supplier_code || 'SUP-ACTIVE'}</span>
                        {s.country && (
                          <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.2 rounded">
                            {s.country}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>

                {/* Contact info if present */}
                {(s.contact_person || s.email || s.phone) && (
                  <div className="mt-2.5 pt-2 text-[11px] text-slate-500 space-y-0.5">
                    {s.contact_person && <div>Contact: <span className="text-slate-700 font-medium">{s.contact_person}</span></div>}
                    {s.email && <div className="text-slate-600 truncate">{s.email}</div>}
                    {s.phone && <div className="text-slate-600">{s.phone}</div>}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Total Orders</span>
                    <strong className="text-slate-800">{supplierPOs.length} Contracts</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Pending Weight</span>
                    <strong className="text-blue-700">{formatWeight(totalPend)}</strong>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-[11px]">
                  Terms: <strong className="text-slate-700">{s.payment_terms || 'DP at sight'}</strong> ({s.default_currency || 'USD'})
                </span>
                <Link
                  href={`/purchasing/purchase-orders?supplier=${encodeURIComponent(s.supplier_name)}`}
                  className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>View Orders</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Supplier Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Building2 className="h-5 w-5" />
                <h2 className="text-base font-bold text-slate-900">Add Overseas Supplier / Mill</h2>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold mb-1 text-slate-700">Supplier / Mill Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BGH Edelstahlwerke GmbH"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Supplier Code</label>
                  <input
                    type="text"
                    placeholder="e.g. BGH-GER"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Country / Origin</label>
                  <input
                    type="text"
                    placeholder="e.g. Germany, Japan, China"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Default Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">Euro (€)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="YEN">Yen (¥)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Payment Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. DP at sight, LC 90 days"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Export Sales Manager"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Phone</label>
                  <input
                    type="text"
                    placeholder="+49 ..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold mb-1 text-slate-700">Email Address</label>
                  <input
                    type="email"
                    placeholder="export@supplier.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold mb-1 text-slate-700">Address / Plant Location</label>
                  <input
                    type="text"
                    placeholder="Factory / Headquarters address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm"
                >
                  Create Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
