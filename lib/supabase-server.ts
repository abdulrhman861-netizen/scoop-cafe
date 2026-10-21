import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:SupabaseClient|undefined;
export function databaseConfigured(){return !!((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)&&process.env.SUPABASE_SERVICE_ROLE_KEY);}
export function getSupabase(){if(client)return client;const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('لم يكتمل إعداد قاعدة بيانات الموقع');client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});return client;}
