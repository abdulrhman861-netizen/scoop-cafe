import { env } from '../lib/runtime';
import { headers } from 'next/headers';
export const COOKIE='scoop_staff';
export const SESSION_SECONDS=12*60*60;
export type StaffAccount={username:string,name:string,role:'manager'|'cashier'|'captain'|'employee',salt:string,hash:string,version:string,disabled?:boolean};
const encoder=new TextEncoder();
export const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b instanceof Uint8Array?b.buffer:b),x=>x.toString(16).padStart(2,'0')).join('');
export async function readRecord(id:string){const r=await env.DB!.prepare('SELECT data FROM records WHERE id=?').bind(id).first<{data:string}>();return r?JSON.parse(r.data):null;}
export async function writeRecord(id:string,kind:string,value:unknown){await env.DB!.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,kind,JSON.stringify(value)).run();}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
export async function newPassword(password:string){const salt=crypto.randomUUID();return {salt,hash:await passwordHash(password,salt)};}
export function constantEqual(a:string,b:string){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export async function account(username:string):Promise<StaffAccount|null>{const stored=await readRecord('login:'+username);if(stored)return stored;try{const raw=(env as any).STAFF_ADMIN_BOOTSTRAP;if(!raw)return null;const configured=JSON.parse(raw);if(configured.username===username)return configured;}catch{}return null;}
export async function tokenHash(token:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(token)));}
export function cookieValue(h:Pick<Headers,'get'>){const raw=h.get('cookie')??'';const m=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));return m?.slice(COOKIE.length+1)??'';}
export async function staffFromHeaders(h:Pick<Headers,'get'>):Promise<StaffAccount|null>{const token=cookieValue(h);if(!/^[a-f0-9-]{72}$/.test(token))return null;const session=await readRecord('session:'+await tokenHash(token));if(!session||session.expires<Date.now())return null;const user=await account(session.username);if(!user||user.disabled||user.version!==session.version)return null;return user;}
export async function getStaffIdentity(){return staffFromHeaders(await headers());}
export function publicStaff(user:StaffAccount){return {username:user.username,name:user.name,role:user.role,disabled:!!user.disabled};}
export async function createSession(user:StaffAccount){const token=crypto.randomUUID()+crypto.randomUUID();await writeRecord('session:'+await tokenHash(token),'session',{username:user.username,version:user.version,expires:Date.now()+SESSION_SECONDS*1000});return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;}
export const clearCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export async function revokeSession(h:Pick<Headers,'get'>){const token=cookieValue(h);if(token)await env.DB!.prepare("DELETE FROM records WHERE id=? AND kind='session'").bind('session:'+await tokenHash(token)).run();}
export const validUsername=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9._-]{2,39}$/.test(v);
export const validPassword=(v:unknown):v is string=>typeof v==='string'&&v.length>=10&&v.length<=128;
export async function allowLoginAttempt(req:Request,username:string){const ip=req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()??req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??req.headers.get('cf-connecting-ip')??'unknown';const now=Date.now();const until=now+15*60*1000;for(const scope of ['ip:'+ip,'user:'+username]){const id='authLimit:'+await tokenHash(scope);const r=await env.DB!.prepare("INSERT INTO records(id,kind,data) VALUES(?,'authLimit',json_object('count',1,'until',?)) ON CONFLICT(id) DO UPDATE SET data=CASE WHEN CAST(json_extract(data,'$.until') AS INTEGER)<? THEN excluded.data ELSE json_set(data,'$.count',json_extract(data,'$.count')+1) END RETURNING data").bind(id,until,now).first<{data:string}>();if(!r||JSON.parse(r.data).count>10)return false;}return true;}
