'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser, AuthContextType, UserRole } from '@/types/auth';
import { authService, DEFAULT_ADMIN_EMAIL } from '@/lib/authService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const cloudUsers = await authService.fetchCloudUsers();
        setUsers(cloudUsers);
        const currentUser = authService.getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        console.warn('Failed to initialize auth:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for custom login/logout events if needed
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'import_tracking_current_user') {
        setUser(authService.getCurrentUser());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    const res = await authService.login(email, password);
    if (res.success && res.user) {
      setUser(res.user);
      const updatedUsers = await authService.fetchCloudUsers();
      setUsers(updatedUsers);
    }
    setIsLoading(false);
    return { success: res.success, message: res.message, role: res.user?.role };
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const addUser = async (email: string, password: string, role: UserRole, name?: string) => {
    if (!user) return { success: false, message: 'You must be signed in.' };
    const res = await authService.addUser(user, email, password, role, name);
    if (res.success) {
      const updatedUsers = await authService.fetchCloudUsers();
      setUsers(updatedUsers);
    }
    return res;
  };

  const updateUserRole = async (email: string, role: UserRole) => {
    if (!user) return { success: false, message: 'You must be signed in.' };
    const res = await authService.updateUserRole(user, email, role);
    if (res.success) {
      const updatedUsers = await authService.fetchCloudUsers();
      setUsers(updatedUsers);
      // If updating self
      if (user.email.toLowerCase() === email.toLowerCase()) {
        setUser({ ...user, role });
      }
    }
    return res;
  };

  const updateUserPassword = async (email: string, newPassword: string) => {
    if (!user) return { success: false, message: 'You must be signed in.' };
    const res = await authService.updateUserPassword(user, email, newPassword);
    if (res.success) {
      const updatedUsers = await authService.fetchCloudUsers();
      setUsers(updatedUsers);
    }
    return res;
  };

  const removeUser = async (email: string) => {
    if (!user) return { success: false, message: 'You must be signed in.' };
    const res = await authService.removeUser(user, email);
    if (res.success) {
      const updatedUsers = await authService.fetchCloudUsers();
      setUsers(updatedUsers);
    }
    return res;
  };

  const isAdmin = user?.role === 'admin';
  const isEditor = user?.role === 'editor';
  const isViewer = user?.role === 'viewer';
  const canEdit = isAdmin || isEditor;

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        isLoading,
        login,
        logout,
        addUser,
        updateUserRole,
        updateUserPassword,
        removeUser,
        isAdmin,
        isEditor,
        isViewer,
        canEdit
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
