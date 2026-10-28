'use client';
import {useState} from 'react';
import {Plus, Pencil, Trash2} from 'lucide-react';

export function CategoriesAdmin({data,mutate,busy}:{data:any,mutate:(body:any)=>Promise<any>,busy:boolean}){
  const [editing,E]=useState(''),[name,N]=useState('');
  const categories=data.categories??[];
  return <section className="formpanel"><span className="eyebrow">YOUR MENU</span><h2>أقسام المنيو</h2><p>أضف الأقسام ورتب منتجاتك داخلها. تعديل الاسم يظهر عند الزبائن ويحافظ على المنتجات.</p>
    <form onSubmit={async e=>{e.preventDefault();if(await mutate({action:'category',category:{...(editing?{id:editing}:{}),name}})){E('');N('')}}}>
      <label>{editing?'تعديل اسم القسم':'اسم القسم الجديد'}<input required maxLength={60} value={name} onChange={e=>N(e.target.value)} placeholder="مثلًا: عصائر طبيعية"/></label>
      <div className="actions"><button className="primary" disabled={busy||!name.trim()}><Plus size={16}/>{editing?'حفظ الاسم':'إضافة قسم'}</button>{editing&&<button type="button" className="outline" onClick={()=>{E('');N('')}}>إلغاء التعديل</button>}</div>
    </form>
    <div className="category-admin-list">{categories.map((c:any)=>{const count=data.products.filter((p:any)=>p.category===c.id).length;return <div className="category-admin-row" key={c.id}><div><b>{c.name}</b><small>{count} منتج</small></div><div className="actions"><button className="outline" disabled={busy} onClick={()=>{E(c.id);N(c.name)}}><Pencil size={15}/>تعديل</button><button className="textbutton" disabled={busy||count>0||categories.length===1} title={count?'انقل منتجات القسم إلى قسم آخر أولًا':categories.length===1?'احتفظ بقسم واحد على الأقل':'حذف القسم'} onClick={async()=>{if(confirm('حذف قسم «'+c.name+'»؟')){if(await mutate({action:'removeCategory',id:c.id})){if(editing===c.id){E('');N('')}}}}}><Trash2 size={15}/>حذف</button></div></div>})}</div>
    <p className="hint">لحذف قسم يحتوي منتجات: افتح «المنتجات»، وعدّل قسم كل منتج، ثم ارجع واحذف القسم الفارغ. لا يُحذف آخر قسم.</p>
  </section>;
}
