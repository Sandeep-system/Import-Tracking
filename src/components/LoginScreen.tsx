'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, Mail, ArrowRight, Lock, CheckCircle2, AlertCircle, Building2, Eye, Edit3, ShieldAlert } from 'lucide-react';
import { DEFAULT_ADMIN_EMAIL } from '@/lib/authService';

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const res = await login(email.trim());
      if (!res.success) {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLoginAdmin = () => {
    setEmail(DEFAULT_ADMIN_EMAIL);
    setErrorMessage('');
    login(DEFAULT_ADMIN_EMAIL);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Banner */}
        <div className="bg-slate-950 p-6 text-white text-center border-b border-slate-800 relative">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-3 shadow-inner">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Sandeep Edgetech</h1>
          <p className="text-xs text-slate-400 mt-1">Import Tracking & Material Procurement System</p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[10px] text-blue-300 font-mono mt-3">
            <ShieldCheck className="h-3 w-3 text-blue-400" />
            <span>Role-Based Secure Access</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 md:p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="name@sandeepedgetech.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in duration-150">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>{isSubmitting ? 'Verifying Access...' : 'Sign In with Email'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Admin Access Preset */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Primary Admin Account:</span>
            </div>
            <button
              type="button"
              onClick={handleQuickLoginAdmin}
              className="w-full py-2 px-3 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-xl text-xs font-semibold text-slate-800 hover:text-blue-700 transition-colors flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono">{DEFAULT_ADMIN_EMAIL}</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                1-Click Admin Sign-in
              </span>
            </button>
          </div>

          {/* Role Permissions Reference */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2 text-[11px] text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span>Permission Levels:</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 mx-auto mb-1" />
                <div className="font-bold text-slate-800">Admin</div>
                <div className="text-slate-400 text-[9px] mt-0.5">Manage Users & Full Control</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <Edit3 className="h-3.5 w-3.5 text-blue-600 mx-auto mb-1" />
                <div className="font-bold text-slate-800">Editor</div>
                <div className="text-slate-400 text-[9px] mt-0.5">Create & Update Orders</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <Eye className="h-3.5 w-3.5 text-slate-600 mx-auto mb-1" />
                <div className="font-bold text-slate-800">Viewer</div>
                <div className="text-slate-400 text-[9px] mt-0.5">Read-Only Dashboards</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-center text-[11px] text-slate-400">
          To request access, please contact the administrator at <strong className="text-slate-600">{DEFAULT_ADMIN_EMAIL}</strong>
        </div>
      </div>
    </div>
  );
};
