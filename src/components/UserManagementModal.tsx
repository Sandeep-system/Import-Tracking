'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserRole, AppUser } from '@/types/auth';
import { DEFAULT_ADMIN_EMAIL } from '@/lib/authService';
import { 
  X, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  Edit3, 
  Eye, 
  EyeOff, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Mail, 
  Clock, 
  KeyRound, 
  Lock, 
  Check 
} from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { user, users, addUser, updateUserRole, updateUserPassword, removeUser } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline Password Change state for existing user
  const [changingPassEmail, setChangingPassEmail] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }
    if (!newPassword.trim() || newPassword.trim().length < 4) {
      setFeedback({ type: 'error', message: 'Password must be at least 4 characters long.' });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await addUser(newEmail.trim(), newPassword.trim(), newRole, newName.trim());
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setNewEmail('');
        setNewPassword('');
        setNewName('');
        setNewRole('editor');
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to add user.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (targetEmail: string, role: UserRole) => {
    setFeedback(null);
    const res = await updateUserRole(targetEmail, role);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleUpdatePassword = async (targetEmail: string) => {
    if (!newPasswordValue.trim() || newPasswordValue.trim().length < 4) {
      setFeedback({ type: 'error', message: 'Password must be at least 4 characters.' });
      return;
    }

    setFeedback(null);
    const res = await updateUserPassword(targetEmail, newPasswordValue.trim());
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setChangingPassEmail(null);
      setNewPasswordValue('');
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleDelete = async (targetEmail: string) => {
    if (!confirm(`Are you sure you want to revoke access for "${targetEmail}"?`)) return;

    setFeedback(null);
    const res = await removeUser(targetEmail);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <ShieldCheck className="h-3 w-3 text-indigo-600" />
            <span>Admin</span>
          </span>
        );
      case 'editor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Edit3 className="h-3 w-3 text-blue-600" />
            <span>Editor</span>
          </span>
        );
      case 'viewer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Eye className="h-3 w-3 text-slate-500" />
            <span>Viewer</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">User Access & Role Management</h2>
              <p className="text-xs text-slate-400">Set email & password for team members and assign Editor or Viewer access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-3 rounded-xl flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{feedback.message}</div>
              <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Add User Section */}
          <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <UserPlus className="h-4 w-4 text-blue-600" />
                <span>Add Authorized User & Set Credentials</span>
              </div>
              <span className="text-[11px] text-slate-500">All fields saved securely to cloud</span>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Email */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="user@sandeepedgetech.com"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 2. Password */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create user password"
                      className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* 3. Role */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Access Role *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="editor">Editor (Create & Update Orders)</option>
                    <option value="viewer">Viewer (Read-Only Dashboards)</option>
                    <option value="admin">Admin (Full Control)</option>
                  </select>
                </div>

                {/* 4. Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Operations Manager"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-200">
                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                  <span><strong>Editor:</strong> Record receipts, create POs, track sea cargo</span>
                  <span><strong>Viewer:</strong> View-only across all shipment & order pages</span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 disabled:opacity-50 cursor-pointer text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? 'Granting Access...' : 'Save User & Password'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Current Users Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-600" />
                <span>Authorized Team Members ({users.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">Synced in Real-time via Supabase Cloud DB</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-bold">User / Email</th>
                    <th className="py-2.5 px-3 font-bold">Current Role</th>
                    <th className="py-2.5 px-3 font-bold">Password</th>
                    <th className="py-2.5 px-3 font-bold">Status</th>
                    <th className="py-2.5 px-3 font-bold">Last Sign-In</th>
                    <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.map((u) => {
                    const isMasterAdmin = u.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase();

                    return (
                      <tr key={u.email} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{u.name || u.email.split('@')[0]}</span>
                            {isMasterAdmin && (
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                                Master Admin
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">{u.email}</div>
                        </td>

                        <td className="py-3 px-3">
                          {isMasterAdmin ? (
                            getRoleBadge('admin')
                          ) : (
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.email, e.target.value as UserRole)}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-semibold text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            >
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          )}
                        </td>

                        {/* Password Column */}
                        <td className="py-3 px-3">
                          {changingPassEmail === u.email ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newPasswordValue}
                                onChange={(e) => setNewPasswordValue(e.target.value)}
                                placeholder="New password"
                                className="w-28 px-2 py-1 bg-white border border-blue-400 rounded text-xs focus:outline-none font-mono"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdatePassword(u.email)}
                                className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                title="Save Password"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setChangingPassEmail(null);
                                  setNewPasswordValue('');
                                }}
                                className="p-1 text-slate-400 hover:text-slate-600"
                                title="Cancel"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-700 text-[11px]">
                                {revealedPasswords[u.email] ? (u.password || '••••••••') : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedPasswords(prev => ({
                                    ...prev,
                                    [u.email]: !prev[u.email]
                                  }))
                                }
                                className="p-0.5 text-slate-400 hover:text-slate-600"
                                title={revealedPasswords[u.email] ? 'Hide Password' : 'Show Password'}
                              >
                                {revealedPasswords[u.email] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setChangingPassEmail(u.email);
                                  setNewPasswordValue(u.password || '');
                                }}
                                className="text-[10px] text-blue-600 hover:underline font-semibold ml-1 cursor-pointer"
                                title="Change Password"
                              >
                                Change
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span>Active</span>
                          </span>
                        </td>

                        <td className="py-3 px-3 text-slate-500 text-[11px]">
                          {u.last_login_at ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>{new Date(u.last_login_at).toLocaleDateString()}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Never</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isMasterAdmin ? (
                            <span className="text-[10px] text-slate-400 italic font-medium">Protected</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDelete(u.email)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title={`Revoke access for ${u.email}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500">
            Logged in as: <strong className="text-slate-800">{user?.email}</strong> ({user?.role.toUpperCase()})
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
