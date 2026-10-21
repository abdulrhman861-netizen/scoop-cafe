import {readFile} from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {siteOrigin} from '../../../lib/site-url';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){const size=new URL(req.url).searchParams.get('size')==='A5'?'A5':'A4';const origin=siteOrigin(req)+'/';const bytes=await readFile(path.join(process.cwd(),'assets',`flyer-${size}.pdf`));const pdf=await PDFDocument.load(bytes);const page=pdf.getPage(0);const w=page.getWidth(),h=page.getHeight();const png=await pdf.embedPng(await QRCode.toBuffer(origin,{width:1200,errorCorrectionLevel:'M',margin:4}));const x=72/595.276*w,y=(841.89-685)/841.89*h,width=176/595.276*w,height=176/841.89*h;page.drawImage(png,{x,y,width,height});const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,y,x+width,y+height],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(origin)}});page.node.set(PDFName.of('Annots'),pdf.context.obj([pdf.context.register(annotation)]));pdf.setTitle(`SCOOP Cafe - ${size}`);return new Response(new Uint8Array(await pdf.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Scoop_Coffee_Flyer_${size}.pdf"`,'Cache-Control':'no-store'}});}
