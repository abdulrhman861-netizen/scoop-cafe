# SCOOP Cafe

Complete Arabic campus cafe ordering and queue application for **Next.js + Vercel + Supabase**.

Read **[README_AR.md](./README_AR.md)** for the full Arabic deployment guide.

Before deployment:

1. Run `supabase/001_scoop_schema.sql`, then `supabase/002_scoop_storage.sql` in Supabase SQL Editor.
2. Run `npm ci` and `npm run create-admin` locally.
3. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `STAFF_ADMIN_BOOTSTRAP` in Vercel.
4. Select **Next.js** as the Vercel framework and redeploy.

No secret keys or initial passwords are committed. Existing prototype tables are retained; optional import is documented in the Arabic guide. Loyalty settings are draft-only; background push notifications are not included.

The customer menu is at `/`; the independent staff login is at `/admin`. Receipt and marketing QR codes use the deployed origin or `SITE_URL`.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```
