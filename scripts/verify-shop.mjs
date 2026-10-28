import ts from 'typescript';import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_pretty_terrax.sql','utf8').replaceAll('--> statement-breakpoint',''));
let user={userId:'owner-test',email:'owner@test.com'};
sql.prepare("INSERT INTO records(id,kind,data) VALUES('owner','owner',?)").run(JSON.stringify({id:user.userId}));
const DB={prepare(s){let args=[];const b={bind(...a){args=a;return b},async first(){return sql.prepare(s).get(...args)??null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){return sql.prepare(s).run(...args)}};return b}};
// Minimal adapter for legacy SQLite pricing tests; category transactions are tested with PostgreSQL below.
const fakeSupabase={getSupabase:()=>({async rpc(name,{p_action,p_payload}){if(name==='scoop_catalog'&&p_action==='product'){sql.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run('product:'+p_payload.id,'product',JSON.stringify(p_payload));return {error:null}}throw Error('Unexpected catalog action')}})};
const sizes={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/product-sizes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:sizes,Error,Math,Set,crypto});
const promos={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/promotions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:promos,Error,Math});
const compiled=ts.transpileModule(fs.readFileSync('app/api/shop/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(compiled,{exports,require:n=>n.endsWith('product-sizes')?sizes:n.endsWith('supabase-server')?fakeSupabase:n.endsWith('promotions')?promos:n.endsWith('site-url')?{siteOrigin:req=>new URL(req.url).origin}:n.endsWith('/runtime')?{env:{DB}}:n.endsWith('staff-auth')?{getStaffIdentity:async()=>user?{role:user.userId==='owner-test'?'manager':'employee'}:null}:{getChatGPTUser:async()=>user},Response,Request,URL,crypto,File,console});
const post=async b=>{const r=await exports.POST(new Request('https://test.local/api/shop',{method:'POST',headers:{origin:'https://test.local','Content-Type':'application/json'},body:JSON.stringify(b)}));return {status:r.status,data:await r.json()}};
let r=await exports.GET(new Request('https://test.local/api/shop?admin=1'));let data=await r.json();assert.equal(data.role,'manager');assert.equal(data.products.length,3);assert.equal(data.settings.open,false);
let p=data.products.find(p=>p.id==='turkish');p.price=2000;p.extras=[{id:'shot',name:'شوت',price:500,available:true}];assert.equal((await post({action:'product',product:p})).status,200);
assert.equal((await post({action:'settings',settings:{...data.settings,open:true,deliveryFee:1000}})).status,200);
user=null;assert.equal((await post({action:'product',product:p})).status,403);
const order={action:'order',name:'طالب تجريبي',phone:'',method:'pickup',items:[{id:'turkish',qty:2,sweetness:'وسط',extras:['shot'],unit:1}],nonce:'test-nonce'};
assert.equal((await post({...order,nonce:''})).status,400);assert.equal((await post({...order,nonce:'bad-object',items:[null]})).status,400);
let first=await post(order);assert.equal(first.status,200);let duplicate=await post(order);assert.equal(first.data.order.id,duplicate.data.order.id);
r=await exports.GET(new Request('https://test.local/api/shop?token='+first.data.order.token));let tracked=await r.json();assert.equal(tracked.order.data.total,5000);assert.equal(tracked.order.status,'new');
assert.equal((await post({...order,nonce:'bad',items:[{...order.items[0],qty:-1}]})).status,400);
assert.equal((await post({...order,nonce:'bad2',items:[{...order.items[0],extras:['missing']}]})).status,400);
user={userId:'owner-test',email:'owner@test.com'};assert.equal((await post({action:'status',id:1,status:'done'})).status,400);assert.equal((await post({action:'status',id:1,status:'preparing'})).status,400);assert.equal((await post({action:'status',id:1,status:'received'})).status,200);assert.equal((await post({action:'status',id:1,status:'preparing'})).status,200);assert.equal((await post({action:'status',id:1,status:'out'})).status,400);assert.equal((await post({action:'status',id:1,status:'ready'})).status,200);
user={userId:'employee-test',email:'employee@test.com'};assert.equal((await post({action:'settings',settings:data.settings})).status,403);assert.equal((await post({action:'paid',id:1})).status,403);assert.equal((await post({action:'availability',id:'turkish',available:false})).status,200);user=null;assert.equal((await post({...order,nonce:'soldout'})).status,400);
// Counter tickets must be authorized, persistent, idempotent, and share the web counter.
const manual={action:'counterOrder',name:'',phone:'',method:'pickup',details:'قهوة سادة × ٢',total:4000,paid:true,source:'kiosk',nonce:'counter-one'};
assert.equal((await post(manual)).status,403);
user={userId:'employee-test',email:'employee@test.com'};assert.equal((await post(manual)).status,403);
user={userId:'owner-test',email:'owner@test.com'};
await post({action:'settings',settings:{...data.settings,open:false}});
const counter=await post(manual);assert.equal(counter.status,200);assert.ok(counter.data.order.id>first.data.order.id);assert.notEqual(counter.data.order.token,first.data.order.token);
assert.equal((await post(manual)).data.order.id,counter.data.order.id);
r=await exports.GET(new Request('https://test.local/api/shop?token='+counter.data.order.token));let ticket=await r.json();assert.equal(ticket.order.status,'received');assert.equal(ticket.order.data.source,'kiosk');assert.equal(ticket.order.data.paid,true);
assert.equal((await post({...manual,nonce:'badmanual',total:-1})).status,400);
assert.equal((await post({...manual,nonce:'baddelivery',method:'delivery'})).status,400);
const delivery=await post({...manual,nonce:'delivery',method:'delivery',phone:'07701234567',location:'مدخل كلية الهندسة'});assert.equal(delivery.status,200);const did=delivery.data.order.id;
assert.equal((await post({action:'status',id:did,status:'preparing'})).status,200);assert.equal((await post({action:'status',id:did,status:'out'})).status,400);assert.equal((await post({action:'status',id:did,status:'ready'})).status,200);assert.equal((await post({action:'status',id:did,status:'done'})).status,400);assert.equal((await post({action:'status',id:did,status:'out'})).status,200);assert.equal((await post({action:'status',id:did,status:'done'})).status,200);
assert.equal((await post({action:'status',id:counter.data.order.id,status:'preparing'})).status,200);assert.equal((await post({action:'status',id:counter.data.order.id,status:'ready'})).status,200);assert.equal((await post({action:'status',id:counter.data.order.id,status:'out'})).status,400);assert.equal((await post({action:'status',id:counter.data.order.id,status:'done'})).status,200);

// Quick queue tickets carry no financial records and require no customer fields.
user={userId:'owner-test',email:'owner@test.com'};
const quick=await post({action:'queueTicket',nonce:'quick-queue'});assert.equal(quick.status,200);
const quickAgain=await post({action:'queueTicket',nonce:'quick-queue'});assert.equal(quickAgain.data.order.id,quick.data.order.id);
r=await exports.GET(new Request('https://test.local/api/shop?token='+quick.data.order.token));const qt=(await r.json()).order;assert.equal(qt.data.kind,'queue');assert.equal(qt.data.name,'');assert.equal(qt.data.total,null);assert.equal(qt.data.payment,null);assert.deepEqual(qt.data.items,[]);
assert.equal((await post({action:'paid',id:qt.id})).status,400);
user=null;assert.equal((await post({action:'queueTicket',nonce:'anonymous-queue'})).status,403);
user={userId:'employee-test',email:'employee@test.com'};assert.equal((await post({action:'queueTicket',nonce:'employee-queue'})).status,403);
user={userId:'owner-test',email:'owner@test.com'};
// Bundle prices come from the server, and unavailable/expired bundles cannot be ordered.
await post({action:'product',product:{...p,available:true}});
r=await exports.GET(new Request('https://test.local/api/shop'));let pub=await r.json();
for(const id of ['water','croissant']){const product=pub.products.find(p=>p.id===id);await post({action:'product',product:{...product,price:id==='water'?1000:2000}});}
const offer={name:'قهوة + كرواسان + ماء',price:4000,description:'باقة الجامعة',enabled:true,items:[{productId:'turkish',qty:1},{productId:'croissant',qty:1},{productId:'water',qty:1}],startDate:'',endDate:''};
assert.equal((await post({action:'offer',offer})).status,200);
assert.equal((await post({action:'offer',offer:{...offer,price:6000}})).status,400);
assert.equal((await post({action:'offer',offer:{...offer,items:[{productId:'missing',qty:1},{productId:'water',qty:1}]}})).status,400);
r=await exports.GET(new Request('https://test.local/api/shop?admin=1'));let admin=await r.json();const bundle=admin.offers.find(o=>o.name===offer.name);assert.equal(bundle.originalTotal,5000);
await post({action:'settings',settings:{...data.settings,open:true}});user=null;
const bundleOrder={...order,nonce:'bundle-order',items:[{id:bundle.id,offer:true,qty:2,sweetness:'سادة',unit:1}]};
let br=await post(bundleOrder);assert.equal(br.status,200);r=await exports.GET(new Request('https://test.local/api/shop?token='+br.data.order.token));const bo=(await r.json()).order;assert.equal(bo.data.total,8000);assert.equal(bo.data.items[0].bundleItems.length,3);
user={userId:'owner-test',email:'owner@test.com'};await post({action:'availability',id:'water',available:false});user=null;assert.equal((await post({...bundleOrder,nonce:'bundle-soldout'})).status,400);
user={userId:'owner-test',email:'owner@test.com'};await post({action:'availability',id:'water',available:true});assert.equal((await post({action:'offer',offer:{...offer,id:bundle.id,endDate:'2000-01-01'}})).status,200);
user=null;assert.equal((await post({...bundleOrder,nonce:'bundle-expired'})).status,400);r=await exports.GET(new Request('https://test.local/api/shop'));assert.equal((await r.json()).offers.length,0);
// Announcements persist; loyalty remains a draft even if activation is sent by a client.
user={userId:'owner-test',email:'owner@test.com'};
assert.equal((await post({action:'announcements',announcements:{enabled:true,messages:['صباح الخير','عرض اليوم'],duration:60}})).status,200);
assert.equal((await post({action:'announcements',announcements:{enabled:true,messages:['x'.repeat(251)],duration:60}})).status,400);
const loyalty={enabled:true,spendStep:10000,pointsStep:10,minPurchase:10000,redeemPoints:100,rewardCategory:'either',notes:'مسودة للمراجعة'};
assert.equal((await post({action:'loyaltyDraft',loyalty})).status,200);
r=await exports.GET(new Request('https://test.local/api/shop?admin=1'));admin=await r.json();assert.equal(admin.loyalty.enabled,false);assert.equal(admin.loyalty.redeemPoints,100);assert.equal(admin.announcements.messages.length,2);
user={userId:'employee-test',email:'employee@test.com'};assert.equal((await post({action:'loyaltyDraft',loyalty})).status,403);assert.equal((await post({action:'offer',offer})).status,403);
user=null;r=await exports.GET(new Request('https://test.local/api/shop'));pub=await r.json();assert.equal(pub.announcements.enabled,true);assert.equal(pub.loyalty,undefined);
console.log('PASS: quick tickets without amounts, unified queue, bundle pricing/expiry/stock, manager-only announcements and draft loyalty; existing roles and order stages');

// Promotions are authorized and priced on the server, including delivery and bundle orders.
user={userId:'owner-test'};
await post({action:'settings',settings:{...data.settings,open:true,deliveryEnabled:true,deliveryFee:1000}});
const coupon={code:'SCOOP10',type:'percent',value:10,minOrder:3000,startDate:'',endDate:'',enabled:true};
assert.equal((await post({action:'coupon',coupon})).status,200);
assert.equal((await post({action:'coupon',coupon:{...coupon,value:101}})).status,400);
user=null;assert.equal((await post({action:'coupon',coupon})).status,403);
assert.equal((await post({action:'quoteCoupon',code:'scoop10',subtotal:5000})).data.discount,500);
assert.equal((await post({action:'quoteCoupon',code:'scoop10',subtotal:2000})).status,400);
const discounted=await post({...order,nonce:'discounted',method:'delivery',phone:'07701234567',location:'كلية الهندسة',promoCode:'scoop10',discount:999999,total:1});assert.equal(discounted.status,200);
r=await exports.GET(new Request('https://test.local/api/shop?token='+discounted.data.order.token));const priced=(await r.json()).order.data;assert.equal(priced.subtotal,5000);assert.equal(priced.discount,500);assert.equal(priced.total,5500);assert.equal(priced.promoCode,'SCOOP10');
assert.equal((await post({...order,nonce:'invalid-code',promoCode:'DOESNOTEXIST'})).status,400);
user={userId:'owner-test'};await post({action:'coupon',coupon:{...coupon,endDate:'2000-01-01'}});user=null;assert.equal((await post({...order,nonce:'expired-code',promoCode:'SCOOP10'})).status,400);
user={userId:'owner-test'};await post({action:'coupon',coupon:{...coupon,code:'FREE',type:'fixed',value:10000,minOrder:0}});user=null;
const free=await post({...order,nonce:'fixed-code',promoCode:'FREE',method:'delivery',phone:'07701234567',location:'مدخل الهندسة'});r=await exports.GET(new Request('https://test.local/api/shop?token='+free.data.order.token));assert.equal((await r.json()).order.data.total,1000);
r=await exports.GET(new Request('https://test.local/api/shop'));assert.equal((await r.json()).coupons,undefined);
console.log('PASS: promo authorization, expiry/minimum, percent/fixed discounts, server totals and unchanged delivery fee');
