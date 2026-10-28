'use client';
import {useState} from 'react';
import {menuPhoto} from '../lib/menu-photos';
export function MenuPhotosAdmin({data,mutate,busy}:{data:any,mutate:(body:any)=>Promise<any>,busy:boolean}){
 const rows=data.products.map((p:any)=>({p,photo:menuPhoto(p.name)}));
 const [ids,I]=useState<string[]>(()=>rows.filter((r:any)=>r.photo&&r.p.image!==r.photo.image).map((r:any)=>r.p.id));
 const [message,M]=useState('');
 const eligible=rows.filter((r:any)=>r.photo&&r.p.image!==r.photo.image);
 const selected=ids.filter(id=>eligible.some((r:any)=>r.p.id===id));
 return <section className="formpanel"><span className="eyebrow">SCOOP PRODUCT PHOTOS</span><h2>صور المنيو الموحدة</h2><p>صور مولّدة واقعية بخلفية بيضاء. راجعها قبل التطبيق لتتأكد أنها تناسب شكل تقديمكم. يتم تغيير الصورة فقط، وتبقى الأسعار والأحجام وبقية التفاصيل محفوظة.</p>
 <div className="actions"><button className="outline" disabled={busy} onClick={()=>I(eligible.map((r:any)=>r.p.id))}>تحديد الكل</button><button className="textbutton" disabled={busy} onClick={()=>I([])}>إلغاء التحديد</button></div>
 <div className="menu-photo-grid">{rows.map(({p,photo}:any)=><label className="menu-photo-choice" key={p.id}>{photo?<img src={photo.image} alt={p.name}/>:<div className="menu-photo-unmatched">يلزم تحديد الصورة يدويًا</div>}<b>{p.name}</b>{photo?(p.image===photo.image?<small>✓ الصورة مطبقة</small>:<span className="check"><input type="checkbox" disabled={busy} checked={selected.includes(p.id)} onChange={e=>I(e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>تطبيق الصورة الجديدة</span>):<small>الاسم غير مطابق للقائمة؛ لن يتغير</small>}</label>)}</div>
 <button className="primary" disabled={busy||selected.length===0} onClick={async()=>{M('');const r=await mutate({action:'applyMenuPhotos',ids:selected});if(r){I([]);M('تم تطبيق الصور على '+r.applied.length+' منتج'+(r.skipped.length?'؛ لم يتم تغيير '+r.skipped.length+' منتج لتغير بياناتها، حدّث المعاينة وحاول مجددًا.':'.'))}}}>{busy?'جارٍ التطبيق…':'تطبيق الصور المحددة ('+selected.length+')'}</button>{message&&<p role="status">{message}</p>}
 <p className="hint">اختيار المنتجات المحددة يستبدل صورها الحالية. يمكنك تغيير صورة أي منتج لاحقًا من محرره. المنتج المسمى «فارغ» لا يُغيّر تلقائيًا.</p>
 </section>;
}
