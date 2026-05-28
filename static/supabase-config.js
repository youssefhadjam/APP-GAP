// Configuration Supabase. L'anon key est publique (front).
const SUPABASE_URL = "https://fajleadrdtfszxsidzgd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhamxlYWRyZHRmc3p4c2lkemdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjUzMTAsImV4cCI6MjA5NTU0MTMxMH0.dLvvSBAGE97cHfKYn9Y0U2sJvbKuDGOkr0LEfnyfUK4";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
