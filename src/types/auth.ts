export type UserRole = 'admin' | 'editor' | 'viewer';

export interface AppUser {
  email: string;
  name?: string;
  role: UserRole;
  status: 'active' | 'suspended';
  added_by?: string;
  created_at: string;
  last_login_at?: string;
}

export interface AuthContextType {
  user: AppUser | null;
  users: AppUser[];
  isLoading: boolean;
  login: (email: string) => Promise<{ success: boolean; message: string; role?: UserRole }>;
  logout: () => void;
  addUser: (email: string, role: UserRole, name?: string) => Promise<{ success: boolean; message: string }>;
  updateUserRole: (email: string, role: UserRole) => Promise<{ success: boolean; message: string }>;
  removeUser: (email: string) => Promise<{ success: boolean; message: string }>;
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  canEdit: boolean;
}
