'use client';

import React from 'react';
import { ClipboardList, ShieldCheck, Clock, User } from 'lucide-react';
import { dataStore } from '@/lib/dataStore';
import { formatDate } from '@/lib/utils';

export default function AuditLogPage() {
  const logs = dataStore.getAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Log & Traceability</h1>
        <p className="text-xs text-slate-500">Immutable chronological audit trail of all purchase orders, receipt entries, and data migrations</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 card-shadow overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr>
              <th className="table-header">Timestamp</th>
              <th className="table-header">Action</th>
              <th className="table-header">Target Entity</th>
              <th className="table-header">User / Operator</th>
              <th className="table-header">Audit Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="table-cell text-slate-500 font-mono text-[11px]">{new Date(log.created_at).toLocaleString()}</td>
                <td className="table-cell">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                    {log.action}
                  </span>
                </td>
                <td className="table-cell font-semibold text-slate-700">{log.entity_type}</td>
                <td className="table-cell text-slate-600 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{log.user_name || 'System'}</span>
                </td>
                <td className="table-cell text-slate-800 font-medium">{log.remarks || log.entity_display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
