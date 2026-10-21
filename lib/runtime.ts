import {getSupabase,databaseConfigured} from './supabase-server';
type Row=Record<string,unknown>;
function normalize(sql:string){return sql.replace(/\s+/g,' ').trim().toLowerCase();}
export function translateStatement(sql:string,args:unknown[]):{op:string,args:unknown[]}{const s=normalize(sql);
if(s==='select data from records where id=?')return {op:'record_get',args};
if(s.startsWith('insert into records(id,kind,data) values(?,?,?) on conflict(id)'))return {op:'record_put',args};
if(s==='insert or ignore into records(id,kind,data) values(?,?,?)')return {op:'record_seed',args};
if(s===`insert or ignore into records(id,kind,data) values(?,'login',?)`)return {op:'record_seed',args:[args[0],'login',args[1]]};
const kind=s.match(/^select (?:id,data|data) from records where kind='([a-z]+)'$/);if(kind)return {op:'records_kind',args:[kind[1]]};
if(s==='select id,data,status,created from orders where token=?')return {op:'order_track',args};
if(s==='select id,token from orders where nonce=?')return {op:'order_nonce',args};
if(s==='select * from orders order by id desc limit 200')return {op:'orders_list',args:[]};
if(s==='select status,data from orders where id=?'||s==='select data from orders where id=?')return {op:'order_get',args};
const insert=s.match(/^insert or ignore into orders\(token,nonce,data,status,created\) values\(\?,\?,\?,'(new|received)',\?\)$/);if(insert)return {op:'order_insert',args:[args[0],args[1],args[2],insert[1],args[3]]};
if(s==='update orders set status=? where id=? and status=? returning id')return {op:'order_status',args};
if(s==='update orders set data=? where id=?')return {op:'order_data',args};
if(s==='delete from records where id=? and kind=?')return {op:'record_delete',args};
if(s===`delete from records where id=? and kind='session'`)return {op:'record_delete',args:[args[0],'session']};
if(s.startsWith(`delete from records where kind='session' and cast(json_extract`))return {op:'sessions_cleanup',args};
if(s.startsWith(`insert into records(id,kind,data) values(?,'authlimit',json_object`))return {op:'login_attempt',args};
throw Error('Unsupported database operation');
}
class Statement{private values:unknown[]=[];constructor(private sql:string){}bind(...values:unknown[]){this.values=values;return this;}private async execute():Promise<Row[]>{const {op,args}=translateStatement(this.sql,this.values);const {data,error}=await getSupabase().rpc('scoop_db',{p_op:op,p_args:args});if(error)throw Error('Database request failed: '+error.message);return (data??[]) as Row[];}async first<T=Row>():Promise<T|null>{return ((await this.execute())[0]??null) as T|null;}async all(){return {results:await this.execute()};}async run(){await this.execute();return {success:true};}}
const bucketName='scoop-images';
export const env={get CONFIGURED(){return databaseConfigured();},DB:{prepare:(sql:string)=>new Statement(sql)},get STAFF_ADMIN_BOOTSTRAP(){return process.env.STAFF_ADMIN_BOOTSTRAP;},BUCKET:{async put(id:string,body:ArrayBuffer,{httpMetadata}:{httpMetadata:{contentType:string}}){const {error}=await getSupabase().storage.from(bucketName).upload(id,Buffer.from(body),{contentType:httpMetadata.contentType,upsert:false});if(error)throw Error('Image upload failed');},async get(id:string){if(!/^[a-f0-9-]{36}$/.test(id))return null;const {data,error}=await getSupabase().storage.from(bucketName).download(id);if(error||!data)return null;return {body:data.stream(),httpMetadata:{contentType:data.type||'image/jpeg'}};}}};
