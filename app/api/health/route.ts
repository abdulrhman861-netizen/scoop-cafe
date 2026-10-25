import {databaseConfigured,getSupabase} from '../../../lib/supabase-server';
export const dynamic='force-dynamic';
export async function GET(){
  const base={admin:!!process.env.STAFF_ADMIN_BOOTSTRAP,diagnostic_version:2};
  const reply=(body:object,ok=false)=>Response.json({...base,...body},{status:ok?200:503,headers:{'Cache-Control':'no-store'}});
  if(!databaseConfigured())return reply({status:'setup_required',database:false,reason:'missing_environment_variables'});
  try{
    const {error}=await getSupabase().rpc('scoop_db',{p_op:'record_get',p_args:['settings']});
    if(!error)return reply({status:'ready',database:true},true);
    const code=error.code||'';
    const message=error.message.toLowerCase();
    let reason='database_request_failed';
    if(code==='PGRST202'||code==='42883')reason='missing_function_or_schema_cache';
    else if(code==='42P01')reason='missing_database_tables';
    else if(code==='42501')reason='insufficient_database_permissions';
    else if(['PGRST301','PGRST302','PGRST303'].includes(code)||/invalid api key|invalid jwt|jwt expired/.test(message))reason='invalid_or_expired_api_key';
    else if(/fetch failed|network|enotfound|timeout/.test(message))reason='connection_failed';
    else if(/schema cache/.test(message))reason='schema_cache_error';
    return reply({status:'database_setup_required',database:false,reason,error_code:/^[A-Z0-9_]{1,20}$/.test(code)?code:null});
  }catch{
    return reply({status:'database_setup_required',database:false,reason:'invalid_connection_configuration'});
  }
}
