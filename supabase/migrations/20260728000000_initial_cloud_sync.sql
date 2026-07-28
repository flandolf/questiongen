create table if not exists public.cloud_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, collection, record_id)
);

alter table public.cloud_records enable row level security;

create policy "Users manage their own cloud records"
on public.cloud_records
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.cloud_records to authenticated;

alter publication supabase_realtime add table public.cloud_records;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'answer-images',
  'answer-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users read their own answer images"
on storage.objects for select to authenticated
using (
  bucket_id = 'answer-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users upload their own answer images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'answer-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users update their own answer images"
on storage.objects for update to authenticated
using (
  bucket_id = 'answer-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'answer-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users delete their own answer images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'answer-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
