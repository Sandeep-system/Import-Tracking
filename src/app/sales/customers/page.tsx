'use client';

import React, { useState, useEffect } from 'react';
import { Users, Search, Plus, Phone, Mail, Building2, X, ShieldCheck } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';

export default function CustomersPage() {
  const [dataVersion, setDataVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // New Customer Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1);
    window.addEventListener('app:data-updated', handleUpdate);
    return () => window.removeEventListener('app:data-updated', handleUpdate);
  }, []);

  const customers = dataStore.getCustomers();

  const filtered = customers.filter(c => 
    c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_code?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_person?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    dataStore.createCustomer({
      customer_name: name.trim(),
      customer_code: code.trim() || undefined,
      contact_person: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
    });

    setName('');
    setCode('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setIsAddOpen(false);

    setDataVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:data-updated'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Registry</h1>
          <p className="text-xs text-slate-500">Corporate clients, internal entities (Sandeep Edgetech - SE), and allocation destinations</p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 card-shadow flex items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, code, contact..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
          />
        </div>
        <span className="text-slate-500 font-medium">
          Total Customers: <strong className="text-slate-900">{filtered.length}</strong>
        </span>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const isSelf = c.customer_code === 'SE' || c.customer_name.toLowerCase().includes('sandeep edgetech');

          return (
            <div 
              key={c.id} 
              className={`p-5 rounded-xl border card-shadow space-y-3 transition-all ${
                isSelf 
                  ? 'bg-gradient-to-br from-blue-50/80 to-white border-blue-300 ring-2 ring-blue-500/10' 
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg border ${
                    isSelf 
                      ? 'bg-blue-600 text-white border-blue-700' 
                      : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                  }`}>
                    {isSelf ? <ShieldCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      {c.customer_name}
                    </h2>
                    <span className="text-[10px] font-mono font-bold text-blue-700">{c.customer_code}</span>
                  </div>
                </div>
                {isSelf ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Self / Internal Entity
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Designation / Role:</span>
                  <span className="font-semibold text-slate-800">
                    {isSelf ? 'Parent Company (Self)' : (c.contact_person || 'Client')}
                  </span>
                </div>
                {c.phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-700">{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Email:</span>
                    <span className="text-slate-700">{c.email}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Customer Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                <Users className="h-5 w-5" />
                <span>Add Customer / Entity</span>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700">Customer / Entity Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Machine Tools Pvt Ltd"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Customer Code</label>
                  <input
                    type="text"
                    placeholder="e.g. APEX-01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Procurement Manager"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Phone</label>
                  <input
                    type="text"
                    placeholder="+91 ..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Email Address</label>
                  <input
                    type="email"
                    placeholder="sales@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Plant / Office Address</label>
                <input
                  type="text"
                  placeholder="Delivery address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm"
                >
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
