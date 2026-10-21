import {databaseConfigured,getSupabase} from '../../../lib/supabase-server';
export const dynamic='force-dynamic';
export async function GET(){if(!databaseConfigured())return Response.json({status:'setup_required',database:false,admin:!!process.env.STAFF_ADMIN_BOOTSTRAP},{status:503});const {error}=await getSupabase().rpc('scoop_db',{p_op:'record_get',p_args:['settings']});return Response.json({status:error?'database_setup_required':'ready',database:!error,admin:!!process.env.STAFF_ADMIN_BOOTSTRAP},{status:error?503:200});}
