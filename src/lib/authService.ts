import { supabase, isSupabaseConfigured } from './supabase';
import { AppUser, UserRole } from '@/types/auth';

const STORAGE_KEY_USER = 'import_tracking_current_user';
const STORAGE_KEY_ACCESS_LIST = 'import_tracking_access_list';

// Master default admin configured for the system
export const DEFAULT_ADMIN_EMAIL = 'tech2@sandeepedgetech.com';

const INITIAL_USERS: AppUser[] = [
  {
    email: DEFAULT_ADMIN_EMAIL,
    name: 'Tech Admin',
    role: 'admin',
    status: 'active',
    added_by: 'system',
    created_at: '2026-10-12T00:00:00.000Z'
  }
];

export const authService = {
  // Get cached access list from localStorage or defaults
  getLocalUsers(): AppUser[] {
    if (typeof window === 'undefined') return INITIAL_USERS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ACCESS_LIST);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Always ensure DEFAULT_ADMIN_EMAIL is present as admin
          if (!parsed.some(u => u.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase())) {
            parsed.unshift(INITIAL_USERS[0]);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading local access list:', e);
    }
    return INITIAL_USERS;
  },

  // Save access list locally
  setLocalUsers(users: AppUser[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_ACCESS_LIST, JSON.stringify(users));
    } catch (e) {
      console.warn('Error saving local access list:', e);
    }
  },

  // Fetch access list from Supabase cloud
  async fetchCloudUsers(): Promise<AppUser[]> {
    if (!isSupabaseConfigured()) return this.getLocalUsers();

    try {
      const { data, error } = await supabase
        .from('app_cloud_state')
        .select('data')
        .eq('id', 'access_control')
        .single();

      if (!error && data?.data?.users && Array.isArray(data.data.users)) {
        let users: AppUser[] = data.data.users;
        // Ensure default admin is always present and active
        const adminIdx = users.findIndex(u => u.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase());
        if (adminIdx === -1) {
          users.unshift(INITIAL_USERS[0]);
        } else {
          users[adminIdx].role = 'admin';
          users[adminIdx].status = 'active';
        }
        this.setLocalUsers(users);
        return users;
      }
    } catch (err) {
      console.warn('Failed to fetch cloud access list:', err);
    }

    return this.getLocalUsers();
  },

  // Push updated access list to Supabase cloud
  async saveCloudUsers(users: AppUser[]): Promise<boolean> {
    this.setLocalUsers(users);

    if (!isSupabaseConfigured()) return true;

    try {
      const { error } = await supabase
        .from('app_cloud_state')
        .upsert({
          id: 'access_control',
          data: { users },
          updated_at: new Date().toISOString(),
          updated_by: 'admin'
        });

      if (error) {
        console.error('Failed to sync access control list to cloud:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error in saveCloudUsers:', err);
      return false;
    }
  },

  // Get currently logged-in user session
  getCurrentUser(): AppUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_USER);
      if (stored) {
        const user: AppUser = JSON.parse(stored);
        // Verify user against active access list
        const activeUsers = this.getLocalUsers();
        const found = activeUsers.find(u => u.email.toLowerCase() === user.email.toLowerCase());
        if (found) {
          if (found.status === 'suspended') {
            this.logout();
            return null;
          }
          // Update role if changed
          user.role = found.role;
          user.name = found.name || user.name;
          return user;
        }
      }
    } catch (e) {
      console.warn('Error reading current user session:', e);
    }
    return null;
  },

  // Log in user by email
  async login(emailRaw: string): Promise<{ success: boolean; message: string; user?: AppUser }> {
    const email = emailRaw.trim().toLowerCase();
    if (!email) {
      return { success: false, message: 'Please enter a valid email address.' };
    }

    // Refresh access list from cloud
    const users = await this.fetchCloudUsers();
    const foundUser = users.find(u => u.email.toLowerCase() === email);

    if (!foundUser) {
      return {
        success: false,
        message: `Access Denied: "${email}" is not authorized. Please contact tech2@sandeepedgetech.com for access.`
      };
    }

    if (foundUser.status === 'suspended') {
      return {
        success: false,
        message: `Account Suspended: "${email}" has been temporarily deactivated. Please contact an Administrator.`
      };
    }

    // Update last login timestamp
    foundUser.last_login_at = new Date().toISOString();
    await this.saveCloudUsers(users);

    // Save session locally
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(foundUser));
    }

    return {
      success: true,
      message: `Signed in successfully as ${foundUser.role.toUpperCase()}`,
      user: foundUser
    };
  },

  // Sign out user
  logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  },

  // Add a new user (Admin only)
  async addUser(
    currentUser: AppUser,
    emailRaw: string,
    role: UserRole,
    name?: string
  ): Promise<{ success: boolean; message: string }> {
    if (currentUser.role !== 'admin') {
      return { success: false, message: 'Permission Denied: Only Admins can add new users.' };
    }

    const email = emailRaw.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { success: false, message: 'Please enter a valid email address.' };
    }

    const users = await this.fetchCloudUsers();
    if (users.some(u => u.email.toLowerCase() === email)) {
      return { success: false, message: `User "${email}" is already registered. You can update their role instead.` };
    }

    const newUser: AppUser = {
      email,
      name: name?.trim() || email.split('@')[0],
      role,
      status: 'active',
      added_by: currentUser.email,
      created_at: new Date().toISOString()
    };

    users.push(newUser);
    const saved = await this.saveCloudUsers(users);
    if (!saved) {
      return { success: false, message: 'Failed to save new user to cloud database.' };
    }

    return { success: true, message: `User "${email}" successfully added with ${role.toUpperCase()} access!` };
  },

  // Update existing user role (Admin only)
  async updateUserRole(
    currentUser: AppUser,
    targetEmail: string,
    newRole: UserRole
  ): Promise<{ success: boolean; message: string }> {
    if (currentUser.role !== 'admin') {
      return { success: false, message: 'Permission Denied: Only Admins can update roles.' };
    }

    const email = targetEmail.trim().toLowerCase();
    if (email === DEFAULT_ADMIN_EMAIL.toLowerCase() && newRole !== 'admin') {
      return { success: false, message: 'The primary tech admin role cannot be downgraded.' };
    }

    const users = await this.fetchCloudUsers();
    const user = users.find(u => u.email.toLowerCase() === email);
    if (!user) {
      return { success: false, message: `User "${email}" not found.` };
    }

    user.role = newRole;
    const saved = await this.saveCloudUsers(users);
    if (!saved) {
      return { success: false, message: 'Failed to update user role in cloud database.' };
    }

    return { success: true, message: `Updated "${email}" role to ${newRole.toUpperCase()}.` };
  },

  // Remove a user (Admin only)
  async removeUser(
    currentUser: AppUser,
    targetEmail: string
  ): Promise<{ success: boolean; message: string }> {
    if (currentUser.role !== 'admin') {
      return { success: false, message: 'Permission Denied: Only Admins can remove users.' };
    }

    const email = targetEmail.trim().toLowerCase();
    if (email === DEFAULT_ADMIN_EMAIL.toLowerCase()) {
      return { success: false, message: 'The primary tech admin cannot be removed.' };
    }

    if (currentUser.email.toLowerCase() === email) {
      return { success: false, message: 'You cannot remove your own admin account.' };
    }

    const users = await this.fetchCloudUsers();
    const filtered = users.filter(u => u.email.toLowerCase() !== email);
    if (filtered.length === users.length) {
      return { success: false, message: `User "${email}" not found.` };
    }

    const saved = await this.saveCloudUsers(filtered);
    if (!saved) {
      return { success: false, message: 'Failed to remove user from cloud database.' };
    }

    return { success: true, message: `User "${email}" has been removed from access list.` };
  }
};
