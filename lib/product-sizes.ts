export type ProductSize={id:string,name:string,price:number,available:boolean};
export function sizesOf(product:any):ProductSize[]{return Array.isArray(product?.sizes)?product.sizes:[];}
export function startingPrice(product:any):number|null{
  const sizes=sizesOf(product);if(!sizes.length)return product?.price??null;
  const available=sizes.filter(s=>s.available!==false);
  return Math.min(...(available.length?available:sizes).map(s=>s.price));
}
export function productOrderable(product:any):boolean{
  return !!product?.available&&startingPrice(product)!==null&&(!sizesOf(product).length||sizesOf(product).some(s=>s.available!==false));
}
export function resolveSize(product:any,sizeId:unknown){
  const sizes=sizesOf(product);
  if(sizes.length){const size=sizes.find(s=>s.id===sizeId);if(!size||size.available===false)throw Error('اختر حجمًا متوفرًا للمنتج «'+product.name+'»');return {sizeId:size.id,sizeName:size.name,basePrice:size.price};}
  if(sizeId)throw Error('تغيرت أحجام المنتج «'+product.name+'»، احذفه من السلة وأضفه مجددًا');
  if(product.price===null||product.price===undefined)throw Error('لم يحدد سعر المنتج');
  return {sizeId:'',sizeName:product.size||'مقاس واحد',basePrice:product.price};
}
export function normalizeSizes(value:any):ProductSize[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>10)throw Error('أضف حتى ١٠ أحجام لكل منتج');
  const names=new Set(),ids=new Set();
  return value.map((s:any)=>{
    if(!s||typeof s.name!=='string'||!s.name.trim()||s.name.trim().length>60||!Number.isInteger(s.price)||s.price<0||s.price>1000000)throw Error('راجع أسماء الأحجام وأسعارها');
    const name=s.name.trim(),id=s.id===undefined?crypto.randomUUID():s.id;
    if(typeof id!=='string'||!id||id.length>80||ids.has(id)||names.has(name.toLocaleLowerCase('ar')))throw Error('أسماء الأحجام ومعرّفاتها يجب ألا تتكرر');
    names.add(name.toLocaleLowerCase('ar'));ids.add(id);return {id,name,price:s.price,available:s.available!==false};
  });
}
