import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qghgxaridrhqglcdwjxc.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnaGd4YXJpZHJocWdsY2R3anhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNzAzMDMsImV4cCI6MjEwNjc0NjMwM30.4mieQHNDUERCYej8Jrd3hehTEh6QKGwm9BvGdGQ-zJE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};
