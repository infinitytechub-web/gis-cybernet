-- Branding images must load on the sign-in page before anyone is signed in,
-- so anonymous reads stay — but only for the known public branding asset
-- folders, never for anything else placed in the bucket.
drop policy if exists "Branding assets are readable" on storage.objects;

create policy "Public branding assets are readable" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'branding'
    and (
      split_part(name, '/', 1) in (
        'logo_url',
        'login_logo_url',
        'login_background_url',
        'dashboard_logo_url',
        'email_logo_url',
        'favicon_url'
      )
    )
  );