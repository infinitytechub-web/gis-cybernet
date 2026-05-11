-- ============================================================
-- Scheduled File Delivery System
-- ============================================================

CREATE TYPE public.scheduled_delivery_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');

CREATE TABLE public.scheduled_file_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status public.scheduled_delivery_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sfd_status_due ON public.scheduled_file_deliveries (status, scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_sfd_sender ON public.scheduled_file_deliveries (sender_id, created_at DESC);

CREATE TABLE public.scheduled_file_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.scheduled_file_deliveries(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE (delivery_id, recipient_user_id)
);

CREATE INDEX idx_sfr_delivery ON public.scheduled_file_recipients (delivery_id);
CREATE INDEX idx_sfr_recipient ON public.scheduled_file_recipients (recipient_user_id);

-- updated_at trigger
CREATE TRIGGER trg_sfd_updated_at
BEFORE UPDATE ON public.scheduled_file_deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for scheduled files
INSERT INTO storage.buckets (id, name, public)
VALUES ('scheduled-files', 'scheduled-files', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.scheduled_file_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_file_recipients ENABLE ROW LEVEL SECURITY;

-- Sender or admin can view their own deliveries
CREATE POLICY "Sender or admin can view deliveries"
ON public.scheduled_file_deliveries FOR SELECT
TO authenticated
USING (sender_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Sender can create
CREATE POLICY "Authenticated can create deliveries"
ON public.scheduled_file_deliveries FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

-- Sender can update only while pending (cancel/edit)
CREATE POLICY "Sender can update pending deliveries"
ON public.scheduled_file_deliveries FOR UPDATE
TO authenticated
USING (sender_id = auth.uid() AND status = 'pending')
WITH CHECK (sender_id = auth.uid());

-- Admin full update
CREATE POLICY "Admin can update deliveries"
ON public.scheduled_file_deliveries FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Sender can delete pending; admin always
CREATE POLICY "Sender or admin can delete deliveries"
ON public.scheduled_file_deliveries FOR DELETE
TO authenticated
USING ((sender_id = auth.uid() AND status = 'pending') OR public.has_role(auth.uid(), 'admin'));

-- Recipients: visible to sender, admin, or the recipient themselves
CREATE POLICY "Recipient rows visible to sender, admin, recipient"
ON public.scheduled_file_recipients FOR SELECT
TO authenticated
USING (
  recipient_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.scheduled_file_deliveries d
    WHERE d.id = delivery_id AND d.sender_id = auth.uid()
  )
);

CREATE POLICY "Sender can manage recipient rows"
ON public.scheduled_file_recipients FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.scheduled_file_deliveries d
    WHERE d.id = delivery_id AND d.sender_id = auth.uid() AND d.status = 'pending'
  )
);

CREATE POLICY "Sender can delete recipient rows while pending"
ON public.scheduled_file_recipients FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.scheduled_file_deliveries d
    WHERE d.id = delivery_id AND d.sender_id = auth.uid() AND d.status = 'pending'
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- ============================================================
-- Storage RLS for scheduled-files bucket
-- ============================================================
CREATE POLICY "Authenticated can upload to scheduled-files in own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'scheduled-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Sender or admin can read scheduled-files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'scheduled-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.scheduled_file_recipients r
      JOIN public.scheduled_file_deliveries d ON d.id = r.delivery_id
      WHERE d.file_path = storage.objects.name
        AND r.recipient_user_id = auth.uid()
        AND r.delivered = TRUE
    )
  )
);

CREATE POLICY "Sender or admin can delete scheduled-files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'scheduled-files'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
);
