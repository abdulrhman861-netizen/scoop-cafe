import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';
const pg=new PGlite();await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');await pg.exec(fs.readFileSync('supabase/001_scoop_schema.sql','utf8'));await pg.exec(fs.readFileSync('supabase/004_scoop_categories.sql','utf8'));
const fake={async rpc(name,{p_op,p_args,p_action,p_payload}){try{if(name==='scoop_catalog'){const {rows}=await pg.query('SELECT public.scoop_catalog($1,$2::jsonb) AS row',[p_action,JSON.stringify(p_payload)]);return {data:rows[0].row,error:null}}const {rows}=await pg.query('SELECT public.scoop_db($1,$2::jsonb) AS row',[p_op,JSON.stringify(p_args)]);return {data:rows.map(r=>r.row),error:null}}catch(error){return {data:null,error}}}};
let reqHeaders=new Headers();const exported=new Map();function load(file){if(exported.has(file))return exported.get(file);const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,require:n=>n.endsWith('product-sizes')?load('lib/product-sizes.ts'):n.endsWith('supabase-server')?{getSupabase:()=>fake,databaseConfigured:()=>true}:n.endsWith('promotions')?load('lib/promotions.ts'):n.endsWith('site-url')?{siteOrigin:req=>new URL(req.url).origin}:n.endsWith('/runtime')?load('lib/runtime.ts'):n.endsWith('staff-auth')?load('app/staff-auth.ts'):n==='next/headers'?{headers:async()=>reqHeaders}:null,Response,Request,URL,Headers,TextEncoder,crypto,File,Buffer,process:{env:{}},console});exported.set(file,exports);return exports;}
const runtime=load('lib/runtime.ts'),auth=load('app/staff-auth.ts'),shop=load('app/api/shop/route.ts');
async function call(method,body=null,cookie='',query=''){reqHeaders=new Headers({origin:'https://new-cafe.example','Content-Type':'application/json',cookie});const req=new Request('https://new-cafe.example/api/shop'+query,{method,headers:reqHeaders,...(body?{body:JSON.stringify(body)}:{})});const response=await shop[method](req);return {status:response.status,data:await response.json()};}
let r=await call('GET');assert.equal(r.status,200);assert.equal(r.data.products.length,3);assert.equal(r.data.role,null);
const pass=await auth.newPassword('Test-Manager-Password');await auth.writeRecord('login:admin','login',{username:'admin',name:'مدير',role:'manager',...pass,version:'v1'});const user=await auth.account('admin');const cookie=(await auth.createSession(user)).split(';')[0];
r=await call('POST',{action:'queueTicket',nonce:'pg-queue'},cookie);assert.equal(r.status,200);const ticket=r.data.order;assert.ok(ticket.id>0);assert.equal((await call('POST',{action:'queueTicket',nonce:'pg-queue'},cookie)).data.order.id,ticket.id);
r=await call('GET',null,'','?token='+ticket.token);assert.equal(r.data.order.data.total,null);assert.equal(r.data.order.status,'received');assert.equal((await call('POST',{action:'status',id:ticket.id,status:'preparing'},cookie)).status,200);
const p=(await call('GET')).data.products.find(p=>p.id==='turkish');assert.equal((await call('POST',{action:'product',product:{...p,price:2000}},cookie)).status,200);await call('POST',{action:'settings',settings:{open:true,phone:'',instagram:'',deliveryFee:0,deliveryEnabled:true}},cookie);
r=await call('POST',{action:'order',name:'طالب',phone:'',method:'pickup',items:[{id:'turkish',qty:2,sweetness:'وسط',extras:[],unit:1}],nonce:'pg-web'});assert.equal(r.status,200);const web=r.data.order;r=await call('GET',null,'','?token='+web.token);assert.equal(r.data.order.data.total,4000);
const limits=await Promise.all(Array.from({length:12},()=>runtime.env.DB.prepare("INSERT INTO records(id,kind,data) VALUES(?,'authLimit',json_object('count',1,'until',?)) ON CONFLICT(id) DO UPDATE SET data=CASE WHEN CAST(json_extract(data,'$.until') AS INTEGER)<? THEN excluded.data ELSE json_set(data,'$.count',json_extract(data,'$.count')+1) END RETURNING data").bind('limit-test',Date.now()+60000,Date.now()).first()));assert.equal(Math.max(...limits.map(x=>JSON.parse(x.data).count)),12);
await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query("SELECT public.scoop_db('orders_list','[]'::jsonb)"),/permission denied/i);await assert.rejects(()=>pg.query('SELECT * FROM public.scoop_orders'),/permission denied/i);await pg.exec('RESET ROLE');
console.log('PASS: PostgreSQL migrations/RPC, shared sequence/idempotency, queue without amount, authenticated CAS status, server pricing, atomic login limits, and anonymous access restrictions');
// Category IDs survive renaming; occupied categories cannot be removed, including hidden products.
r=await call('GET');assert.equal(r.data.categories.length,3);
assert.equal((await call('POST',{action:'category',category:{name:'عصائر'}},'')).status,403);
const cashierPass=await auth.newPassword('Cashier-Test-Password');await auth.writeRecord('login:cashier','login',{username:'cashier',name:'كاشير',role:'cashier',...cashierPass,version:'cashier-v1'});
const cashier=(await auth.createSession(await auth.account('cashier'))).split(';')[0];
assert.equal((await call('POST',{action:'category',category:{name:'عصائر'}},cashier)).status,403);
assert.equal((await call('POST',{action:'removeCategory',id:'hot'},cashier)).status,403);
assert.equal((await call('POST',{action:'category',category:{name:'   '}},cookie)).status,400);
assert.equal((await call('POST',{action:'category',category:{name:'عصائر طبيعية'}},cookie)).status,200);
assert.equal((await call('POST',{action:'category',category:{name:' عصائر طبيعية '}},cookie)).status,409);
let cats=(await call('GET')).data.categories;let juice=cats.find(c=>c.name==='عصائر طبيعية');assert.ok(juice.id);
assert.equal((await call('POST',{action:'category',category:{id:juice.id,name:'عصائر طازجة'}},cookie)).status,200);
cats=(await call('GET')).data.categories;assert.equal(cats.find(c=>c.id===juice.id).name,'عصائر طازجة');
assert.equal((await call('POST',{action:'removeCategory',id:'hot'},cookie)).status,409);
assert.equal((await call('POST',{action:'category',category:{id:'missing',name:'غير موجود'}},cookie)).status,409);
assert.equal((await call('POST',{action:'product',product:{...p,id:'juice',name:'عصير برتقال',category:juice.id,price:2500}},cookie)).status,200);
assert.equal((await call('POST',{action:'product',product:{...p,category:'missing'}},cookie)).status,400);
assert.equal((await call('POST',{action:'removeCategory',id:juice.id},cookie)).status,409);
assert.equal((await call('POST',{action:'product',product:{...p,id:'juice',name:'عصير برتقال',category:'cold',price:2500}},cookie)).status,200);
assert.equal((await call('POST',{action:'removeCategory',id:juice.id},cookie)).status,200);
assert.equal((await call('GET')).data.categories.some(c=>c.id===juice.id),false);
assert.equal((await call('POST',{action:'product',product:{...p,category:juice.id}},cookie)).status,400);
// The database itself also rejects a stale product save after category removal.
await assert.rejects(()=>pg.query('SELECT public.scoop_catalog($1,$2)', ['product',JSON.stringify({...p,category:juice.id})]),/invalid_category/);
// Move the original products before deleting an original category; GET must not resurrect it.
assert.equal((await call('POST',{action:'product',product:{...p,price:2000,category:'cold'}},cookie)).status,200);
assert.equal((await call('POST',{action:'removeCategory',id:'hot'},cookie)).status,200);
assert.equal((await call('GET')).data.categories.some(c=>c.id==='hot'),false);
assert.equal((await call('GET')).data.products.find(x=>x.id==='turkish').category,'cold');
const bakery=(await call('GET')).data.products.find(x=>x.id==='croissant');
assert.equal((await call('POST',{action:'product',product:{...bakery,price:3000,category:'cold'}},cookie)).status,200);
assert.equal((await call('POST',{action:'removeCategory',id:'bakery'},cookie)).status,200);
assert.equal((await call('POST',{action:'removeCategory',id:'cold'},cookie)).status,409);
// SQL execution is restricted to the service role, and reset preserves catalog/account data.
await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query("SELECT public.scoop_catalog('save','{}'::jsonb)"),/permission denied/);await pg.exec('RESET ROLE');
const beforeRecords=(await pg.query('SELECT count(*)::int AS n FROM public.scoop_records')).rows[0].n;
const beforeOrders=(await pg.query('SELECT count(*)::int AS n FROM public.scoop_orders')).rows[0].n;assert.ok(beforeOrders>0);
await pg.exec(fs.readFileSync('supabase/START_FRESH_ONCE.sql','utf8'));
assert.equal((await pg.query('SELECT count(*)::int AS n FROM public.scoop_orders')).rows[0].n,0);
assert.equal((await pg.query('SELECT count(*)::int AS n FROM public.scoop_launch_order_archive')).rows[0].n,beforeOrders);
assert.equal((await pg.query('SELECT count(*)::int AS n FROM public.scoop_records')).rows[0].n,beforeRecords);
assert.equal((await call('GET')).data.settings.open,false);
assert.equal((await call('GET',null,'','?token='+web.token)).data.order,null);
assert.equal((await call('GET',null,cookie,'?admin=1')).data.role,'manager');
const fresh=await call('POST',{action:'queueTicket',nonce:'launch-first'},cookie);assert.equal(fresh.status,200);assert.equal(fresh.data.order.id,1);assert.notEqual(fresh.data.order.token,ticket.token);
await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query('SELECT * FROM public.scoop_launch_order_archive'),/permission denied/);await pg.exec('RESET ROLE');
console.log('PASS: manager-only categories, rename/move/delete, persistent deletion, stale saves rejected, private launch archive, reset to 1 with accounts and menu retained');

// Sizes: prices and labels are authoritative on the server and snapshot into old orders.
const sizeProduct={...(await call('GET')).data.products.find(x=>x.id==='turkish'),price:1,extras:[{id:'shot',name:'شوت إضافي',price:500,available:true}],sizes:[{id:'small',name:'صغير',price:2000,available:true},{id:'large',name:'كبير',price:4000,available:true},{id:'off',name:'جامبو',price:5000,available:false}]};
assert.equal((await call('POST',{action:'product',product:sizeProduct},cashier)).status,403);
assert.equal((await call('POST',{action:'product',product:sizeProduct},cookie)).status,200);
let sized=(await call('GET')).data.products.find(x=>x.id==='turkish');assert.equal(sized.price,2000);assert.equal(sized.sizes.length,3);
for(const sizes of [[{id:'bad',name:'',price:1000}],[{id:'bad',name:'حجم',price:-1}],[{id:'bad',name:'حجم',price:1.5}],[{id:'bad',name:'حجم',price:1000},{id:'bad2',name:'حجم',price:1500}],[{id:'dup',name:'أ',price:1000},{id:'dup',name:'ب',price:1500}],Array.from({length:11},(_,i)=>({id:''+i,name:''+i,price:1000}))])assert.equal((await call('POST',{action:'product',product:{...sizeProduct,sizes}},cookie)).status,400);
await call('POST',{action:'settings',settings:{open:true,phone:'',instagram:'',deliveryFee:1000,deliveryEnabled:true}},cookie);
await call('POST',{action:'coupon',coupon:{code:'SIZ10',type:'percent',value:10,minOrder:0,startDate:'',endDate:'',enabled:true}},cookie);
const sizedOrder={action:'order',name:'طالب الأحجام',phone:'07701234567',location:'كلية الهندسة',method:'delivery',promoCode:'SIZ10',nonce:'size-order',items:[{id:'turkish',sizeId:'large',sizeName:'صغير مزور',qty:2,sweetness:'وسط',extras:['shot'],unit:1}]};
for(const sizeId of [undefined,'missing','off'])assert.equal((await call('POST',{...sizedOrder,nonce:'bad-size-'+sizeId,items:[{...sizedOrder.items[0],sizeId}]})).status,400);
let sr=await call('POST',sizedOrder);assert.equal(sr.status,200);const sizeOrderToken=sr.data.order.token;
let sizeData=(await call('GET',null,'','?token='+sizeOrderToken)).data.order.data;
assert.equal(sizeData.items[0].sizeName,'كبير');assert.equal(sizeData.items[0].basePrice,4000);assert.equal(sizeData.items[0].unit,4500);assert.equal(sizeData.subtotal,9000);assert.equal(sizeData.discount,900);assert.equal(sizeData.total,9100);
assert.equal((await call('POST',sizedOrder)).data.order.id,sr.data.order.id);
const water=(await call('GET')).data.products.find(x=>x.id==='water');await call('POST',{action:'product',product:{...water,price:500}},cookie);
const sizeOffer={name:'باقة لاتيه كبير وماء',price:4000,description:'',enabled:true,startDate:'',endDate:'',items:[{productId:'turkish',qty:1,sizeId:'large'},{productId:'water',qty:1}]};
assert.equal((await call('POST',{action:'offer',offer:{...sizeOffer,items:[{productId:'turkish',qty:1},{productId:'water',qty:1}]}},cookie)).status,400);
assert.equal((await call('POST',{action:'offer',offer:sizeOffer},cookie)).status,200);
let sizeBundle=(await call('GET',null,cookie,'?admin=1')).data.offers.find(x=>x.name===sizeOffer.name);assert.equal(sizeBundle.originalTotal,4500);assert.equal(sizeBundle.items[0].sizeName,'كبير');
const sizeBundleReq={...sizedOrder,nonce:'size-bundle',promoCode:'',method:'pickup',items:[{id:sizeBundle.id,offer:true,qty:2,sweetness:'سادة'}]};
sr=await call('POST',sizeBundleReq);assert.equal(sr.status,200);const bundleData=(await call('GET',null,'','?token='+sr.data.order.token)).data.order.data;assert.equal(bundleData.total,8000);assert.equal(bundleData.items[0].bundleItems[0].sizeName,'كبير');
await call('POST',{action:'product',product:{...sizeProduct,sizes:sizeProduct.sizes.map(x=>x.id==='large'?{...x,available:false}:x)}},cookie);
assert.equal((await call('POST',{...sizedOrder,nonce:'disabled-large'})).status,400);
assert.equal((await call('POST',{...sizeBundleReq,nonce:'disabled-bundle'})).status,400);
sizeBundle=(await call('GET',null,cookie,'?admin=1')).data.offers.find(x=>x.name===sizeOffer.name);assert.equal(sizeBundle.available,false);
assert.equal((await call('GET',null,'','?token='+sizeOrderToken)).data.order.data.items[0].unit,4500);
await call('POST',{action:'product',product:{...sizeProduct,sizes:sizeProduct.sizes.filter(x=>x.id==='small')}},cookie);
assert.equal((await call('POST',{...sizedOrder,nonce:'removed-large'})).status,400);
const pricing=load('lib/product-sizes.ts');assert.equal(pricing.startingPrice({sizes:[{id:'a',price:1000,available:false},{id:'b',price:3000,available:true}]}),3000);assert.equal(pricing.productOrderable({available:true,sizes:[{id:'a',price:1000,available:false}]}),false);
// Single-size products remain valid; a stale removed variant ID must never fall back to a base price.
await call('POST',{action:'product',product:{...sizeProduct,sizes:[],price:1500,size:'فنجان واحد'}},cookie);
assert.equal((await call('POST',{...sizedOrder,nonce:'old-multi-id'})).status,400);
sr=await call('POST',{...sizedOrder,nonce:'single-size',promoCode:'',method:'pickup',items:[{id:'turkish',qty:1,sweetness:'سادة',extras:[]}]});assert.equal(sr.status,200);
sizeData=(await call('GET',null,'','?token='+sr.data.order.token)).data.order.data;assert.equal(sizeData.total,1500);assert.equal(sizeData.items[0].sizeName,'فنجان واحد');
console.log('PASS: size validation and permissions, server size prices, extras/promo/delivery totals, required/disabled/removed sizes, bundle size selection, immutable order snapshots and legacy single-size products');
await pg.close();


