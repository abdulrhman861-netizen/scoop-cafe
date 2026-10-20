import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uhdwrmfylbqqakwxznds.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoZHdybWZ5bGJxcWFrd3h6bmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5MjE1ODIsImV4cCI6MjA1NDQ5NzU4Mn0.XXXXX' // استكمل الجزء الأخير من المفتاح المنسوخ

export const supabase = createClient(supabaseUrl, supabaseAnonKey)