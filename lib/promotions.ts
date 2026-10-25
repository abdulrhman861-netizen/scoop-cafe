export function normalizePromoCode(value:unknown){return typeof value==='string'?value.trim().toUpperCase():'';}
export function promoDiscount(coupon:any,subtotal:number,date:string){
  if(!coupon||!coupon.enabled||coupon.startDate&&coupon.startDate>date||coupon.endDate&&coupon.endDate<date)throw Error('الكود غير صالح أو انتهت صلاحيته');
  if(subtotal<coupon.minOrder)throw Error('الحد الأدنى لاستخدام الكود '+coupon.minOrder+' د.ع');
  return Math.min(subtotal,coupon.type==='percent'?Math.floor(subtotal*coupon.value/100):coupon.value);
}
