'use client';
import {useEffect,useState} from 'react';
import {Check,AlertCircle,ExternalLink,Printer} from 'lucide-react';
export function LaunchChecklist({data,onNavigate}:{data:any,onNavigate:(tab:string)=>void}){
  const [health,H]=useState<any>(null),[staff,S]=useState<any[]|null>(null),[error,E]=useState('');
  async function refresh(){E('');try{const [h,s]=await Promise.all([fetch('/api/health'),fetch('/api/auth?staff=1')]);H(await h.json());const team=await s.json();if(!s.ok)throw Error(team.error||'تعذر تحميل الكادر');S(team.staff);}catch{E('تعذر تحديث الفحص؛ تحقق من الاتصال وأعد المحاولة.');}}
  useEffect(()=>{refresh()},[]);
  const products=data.products.filter((p:any)=>p.available);
  const pricesReady=products.length>0&&products.every((p:any)=>Number.isInteger(p.price)&&p.price>0);
  const checks=[
    {title:'اتصال قاعدة البيانات',ok:health?.database===true,note:health?.database?'الاتصال يعمل':'بانتظار فحص الاتصال'},
    {title:'أسعار المنيو',ok:pricesReady,note:pricesReady?'كل المنتجات المتوفرة لها أسعار':'حدد سعرًا لكل منتج متوفر قبل فتح الطلبات',tab:'products'},
    {title:'حساب الكاشير',ok:staff?.some(s=>s.role==='cashier'&&!s.disabled),note:'حساب مستقل للكاشير برقم هاتفه',tab:'staff'},
    {title:'استقبال الطلبات',ok:!!data.settings.open,note:data.settings.open?'المقهى يستقبل الطلبات الآن':'فعّله بعد تجهيز المنيو والكادر',tab:'settings'}
  ];
  return <section className="formpanel launchpanel"><span className="eyebrow">READY FOR CAMPUS</span><h2>جاهزية الإطلاق</h2><p>هذه حالة الإعدادات الحالية. تأكد من تجربة طلب كامل على الهاتف والكاشير قبل توزيع الإعلان.</p><div className="launchchecks">{checks.map(c=><div className="launchcheck" key={c.title}>{c.ok?<Check size={22}/>:<AlertCircle size={22}/>}<div><b>{c.title}</b><small>{c.note}</small></div>{c.tab&&<button className="outline" onClick={()=>onNavigate(c.tab!)}>فتح</button>}</div>)}</div><button className="outline" onClick={refresh}>تحديث الفحص</button>{error&&<p className="error" role="alert">{error}</p>}<h3>رابط الزبائن والباركود</h3><a className="publiclink" dir="ltr" href={data.publicUrl} target="_blank" rel="noreferrer">{data.publicUrl}<ExternalLink size={16}/></a><div className="actions"><a className="primary" href="/api/qr?menu=1&format=png&download=1" download><Printer size={16}/>تحميل باركود المنيو</a><button className="outline" onClick={()=>onNavigate('marketing')}>إعلانات A4 وA5</button></div><h3>تجربة التشغيل قبل النشر</h3><ol className="launchsteps"><li>افتح رابط الزبائن من نافذة خاصة أو هاتف غير مسجل في Vercel؛ يجب أن يفتح المنيو مباشرةً.</li><li>أرسل طلب استلام، وتحقق من السعر والإضافات ورقم الدور في لوحة الكاشير.</li><li>فعّل صوت الطلبات عند الكاشير، وصوت الجاهزية على هاتف الزبون مع إبقاء الصفحة مفتوحة.</li><li>حرّك الطلب من الاستلام إلى التحضير ثم الجاهزية والتسليم.</li><li>ولّد تذكرة دور من الكاشير، واطبعها وامسح رمزها من هاتف الزبون.</li>{data.settings.deliveryEnabled&&<li>جرّب طلب توصيل داخل مجمع سبع أبكار مع الهاتف ونقطة التسليم وأجرة التوصيل.</li>}</ol><p className="hint">الدفع نقدًا عند الاستلام. الدفع الإلكتروني متوقف. إعدادات الولاء مسودة ولا تجمع نقاطًا بعد. رقم التواصل والإنستغرام اختياريان ويمكن إضافتهما من الإعدادات.</p></section>;
}
