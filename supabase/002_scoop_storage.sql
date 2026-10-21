-- Private bucket. Images are served through the application's /api/image route.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scoop-images','scoop-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- No anonymous Storage upload policy is created.
