SELECT cron.unschedule('security-webhook-dispatch-2m')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'security-webhook-dispatch-2m');

SELECT cron.schedule(
  'security-webhook-dispatch-2m',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ebndffutyrgybsduvijo.supabase.co/functions/v1/security-webhook-dispatch',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibmRmZnV0eXJneWJzZHV2aWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTQ0OTQsImV4cCI6MjA5MDg3MDQ5NH0.8P0c15nRrp0l0Q--wmOq1av9xumK6yB0TTzEE_iz_zE"}'::jsonb,
      body := jsonb_build_object('source','cron','at',now())
    );
  $$
);