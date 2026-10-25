import ts from 'typescript';import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_pretty_terrax.sql','utf8').replaceAll('--> statement-breakpoint',''));
const DB={prepare(s){let args=[];const b={bind(...a){args=a;return b},async first(){return sql.prepare(s).get(...args)??null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){return sql.prepare(s).run(...args)}};return b}};
let currentHeaders=new Headers();const env={DB};const modules=new Map();
function load(path){if(modules.has(path))return modules.get(path);const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const require=n=>n.endsWith('promotions')?load('lib/promotions.ts'):n.endsWith('site-url')?{siteOrigin:req=>new URL(req.url).origin}:n.endsWith('/runtime')?{env}:n==='next/headers'?{headers:async()=>currentHeaders}:n.endsWith('staff-auth')?load('app/staff-auth.ts'):(()=>{throw Error(n)})();vm.runInNewContext(code,{exports,require,Response,Request,URL,crypto,File,TextEncoder,Headers,console});modules.set(path,exports);return exports;}
const auth=load('app/staff-auth.ts'),route=load('app/api/auth/route.ts'),shop=load('app/api/shop/route.ts');
const secret=await auth.newPassword('Initial-Test-Password');env.STAFF_ADMIN_BOOTSTRAP=JSON.stringify({username:'admin',name:'مدير الاختبار',role:'manager',...secret,version:crypto.randomUUID()});
async function request(module,body,cookie='',method='POST',origin='https://test.local',query=''){const h=new Headers({origin,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.1'});if(cookie)h.set('cookie',cookie);currentHeaders=h;const req=new Request('https://test.local/api/'+(module===shop?'shop':'auth')+query,{method,headers:h,...(method==='POST'?{body:JSON.stringify(body)}:{})});const r=await module[method](req);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
const cookie=r=>r.cookie.split(';')[0];
let r=await request(shop,null,'','GET');assert.equal(r.status,200);assert.equal(r.data.role,null);assert.equal(sql.prepare("SELECT * FROM records WHERE id='owner'").get(),undefined);
assert.equal((await request(shop,null,'','GET','https://test.local','?admin=1')).status,403);
assert.equal((await request(shop,{action:'queueTicket',nonce:'anon'})).status,403);
assert.equal((await request(route,{action:'login',username:'admin',password:'Initial-Test-Password'},'','POST','https://evil.local')).status,403);
assert.equal((await request(route,{action:'login',username:'admin',password:'wrong'})).status,401);
r=await request(route,{action:'login',username:'admin',password:'Initial-Test-Password'});assert.equal(r.status,200);let manager=cookie(r);assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/Secure/);assert.match(r.cookie,/SameSite=Strict/);assert.equal(r.data.user.role,'manager');assert.equal(r.data.user.hash,undefined);
assert.equal((await request(shop,null,manager,'GET','https://test.local','?admin=1')).status,200);
assert.equal((await request(route,{action:'createStaff',username:'9647701234567',name:'الكاشير',password:'Cashier-Test-Password',role:'cashier'},manager)).status,200);
assert.equal((await request(route,{action:'createStaff',username:'9647801234567',name:'الموظف',password:'Employee-Test-Password',role:'employee'},manager)).status,200);
assert.equal((await request(route,{action:'createStaff',username:'admin2',name:'غير مسموح',password:'Admin-Test-Password',role:'manager'},manager)).status,400);
r=await request(route,{action:'login',username:'9647701234567',password:'Cashier-Test-Password'});let cashier=cookie(r);assert.equal((await request(shop,{action:'queueTicket',nonce:'cashier-ticket'},cashier)).status,200);assert.equal((await request(shop,{action:'settings',settings:{}},cashier)).status,403);assert.equal((await request(route,null,cashier,'GET','https://test.local','?staff=1')).status,403);
r=await request(route,{action:'login',username:'9647801234567',password:'Employee-Test-Password'});const employee=cookie(r);assert.equal((await request(shop,{action:'queueTicket',nonce:'employee-ticket'},employee)).status,403);
r=await request(route,null,manager,'GET','https://test.local','?staff=1');assert.equal(r.status,200);assert.equal(r.data.staff.length,3);assert.ok(r.data.staff.every(u=>!u.hash&&!u.salt));
const change=await request(route,{action:'password',currentPassword:'Cashier-Test-Password',newPassword:'Changed-Cashier-Password'},cashier);assert.equal(change.status,200);const newCashier=cookie(change);assert.equal((await request(route,null,cashier,'GET')).status,401);assert.equal((await request(route,null,newCashier,'GET')).status,200);
assert.equal((await request(route,{action:'logout'},newCashier)).status,200);assert.equal((await request(route,null,newCashier,'GET')).status,401);
assert.equal((await request(route,{action:'removeStaff',username:'9647801234567'},manager)).status,200);assert.equal((await request(route,null,employee,'GET')).status,401);
assert.equal((await request(route,{action:'removeStaff',username:'admin'},manager)).status,400);
assert.equal((await request(route,{action:'createStaff',phone:'٠٧٧٠١٢٣٤٥٦٧',name:'مكرر',password:'Duplicate-Password',role:'cashier'},manager)).status,400);
assert.equal((await request(route,{action:'createStaff',phone:'123',name:'غير صحيح',password:'Invalid-Password',role:'employee'},manager)).status,400);
assert.equal((await request(route,{action:'deleteStaff',username:'9647701234567'},employee)).status,401);
assert.equal((await request(route,{action:'resetPassword',username:'9647801234567',password:'Reset-Employee-Password'},manager)).status,200);
assert.equal((await request(route,{action:'login',username:'07801234567',password:'Reset-Employee-Password'})).status,401);
assert.equal((await request(route,{action:'unlockStaff',username:'07801234567'},manager)).status,200);
r=await request(route,{action:'login',username:'+964 780 123 4567',password:'Reset-Employee-Password'});assert.equal(r.status,200);const unlocked=cookie(r);
assert.equal((await request(route,{action:'createStaff',phone:'٠٧٩٠١٢٣٤٥٦٧',name:'موظف جديد',password:'Another-Employee-Password',role:'captain'},manager)).status,200);
assert.equal((await request(route,{action:'deleteStaff',username:'9647901234567'},unlocked)).status,403);
assert.equal((await request(route,{action:'deleteStaff',username:'9647801234567'},manager)).status,200);
assert.equal((await request(route,null,unlocked,'GET')).status,401);
assert.equal((await request(route,{action:'login',username:'07801234567',password:'Reset-Employee-Password'})).status,401);
assert.equal(sql.prepare("SELECT * FROM records WHERE id='login:9647801234567'").get(),undefined);
assert.equal((await request(route,{action:'lockStaff',username:'admin'},manager)).status,400);

assert.equal((await request(route,{action:'password',currentPassword:'Initial-Test-Password',newPassword:'Changed-Manager-Password'},manager)).status,200);assert.equal((await request(route,null,manager,'GET')).status,401);
// Rate limiting is checked against a separate requester so earlier successful logins do not affect it.
for(let i=0;i<11;i++){currentHeaders=new Headers();const req=new Request('https://test.local/api/auth',{method:'POST',headers:{origin:'https://test.local','Content-Type':'application/json','cf-connecting-ip':'192.0.2.22'},body:JSON.stringify({action:'login',username:'unknown',password:'incorrect'})});r=await route.POST(req);assert.equal(r.status,i<10?401:429);}
console.log('PASS: anonymous menu, no ownership takeover, credential login, protected admin APIs, cashier/employee roles, password changes, session revocation, logout, login throttling, and no password-hash disclosure');
