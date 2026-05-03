import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kixcgiogadkexrbfwmbv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_L8VRDEZY8Zy2sUGD7wzlgA_nW7fDsXz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});
