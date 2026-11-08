-- Private resume storage: one bucket, per-user folders (<uid>/<uuid>.pdf).
-- Authenticated users may select, insert and delete only inside their own
-- folder. There is deliberately no update policy (no overwrite).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy resumes_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy resumes_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy resumes_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Resume suggestions (owner-only via the existing resumes RLS).
alter table public.resumes add column suggestions jsonb;
