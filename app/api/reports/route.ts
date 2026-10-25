import {staffFromHeaders} from '../../staff-auth';
import {databaseConfigured,getSupabase} from '../../../lib/supabase-server';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export async function GET(req:Request){
 try{
  if(!databaseConfigured())return json({error:'اتصال قاعدة البيانات غير جاهز'},503);
  const staff=await staffFromHeaders(req.headers);
  if(!staff)return json({error:'يرجى تسجيل الدخول'},401);
  if(staff.role!=='manager')return json({error:'التقارير متاحة للمدير فقط'},403);
  const q=new URL(req.url).searchParams,from=q.get('from')??'',to=q.get('to')??'',source=q.get('source')??'web';
  if(!validDate(from)||!validDate(to)||to<from||Date.parse(to)-Date.parse(from)>365*86400000||!['web','all'].includes(source))return json({error:'اختر فترة صحيحة لا تتجاوز ٣٦٦ يومًا'},400);
  const {data,error}=await getSupabase().rpc('scoop_reports',{p_from:from,p_to:to,p_source:source});
  if(error)return json({error:error.code==='PGRST202'||error.code==='42883'?'يلزم تشغيل ملف 003_scoop_reports.sql مرة واحدة في Supabase لتفعيل التقارير':'تعذر تحميل التقرير، تحقق من اتصال قاعدة البيانات'},503);
  return json({report:data});
 }catch{return json({error:'تعذر تحميل التقرير، أعد المحاولة'},500);}
}
