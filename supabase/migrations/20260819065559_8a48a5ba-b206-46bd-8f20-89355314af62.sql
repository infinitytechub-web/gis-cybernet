ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS email_reply_to text,
  ADD COLUMN IF NOT EXISTS email_header_color text,
  ADD COLUMN IF NOT EXISTS email_logo_url text,
  ADD COLUMN IF NOT EXISTS email_footer_text text,
  ADD COLUMN IF NOT EXISTS email_signature text,
  ADD COLUMN IF NOT EXISTS login_tagline text,
  ADD COLUMN IF NOT EXISTS login_background_url text;