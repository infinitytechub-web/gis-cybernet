DELETE FROM public.failed_login_attempts WHERE attempted_at > now() - interval '7 days';
UPDATE public.profiles SET account_locked = false WHERE account_locked = true;