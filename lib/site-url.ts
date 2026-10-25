export const PUBLIC_SITE_URL='https://scoop-cafe.vercel.app';
export function siteOrigin(req:Request){
  const configured=process.env.SITE_URL?.trim();
  if(configured){const u=new URL(configured);if(!['https:','http:'].includes(u.protocol))throw Error('Invalid SITE_URL');return u.origin;}
  const requested=new URL(req.url);
  // Printed tickets must use the public production domain, even from a protected deployment URL.
  if(requested.hostname.endsWith('.vercel.app'))return PUBLIC_SITE_URL;
  return requested.origin;
}
