CREATE INDEX IF NOT EXISTS idx_visa_extensions_nationality ON public.visa_extensions (nationality);
CREATE INDEX IF NOT EXISTS idx_visa_extensions_permit_type ON public.visa_extensions (permit_type);
CREATE INDEX IF NOT EXISTS idx_visa_extensions_status ON public.visa_extensions (status);
CREATE INDEX IF NOT EXISTS idx_visa_extensions_passport_number ON public.visa_extensions (passport_number);
CREATE INDEX IF NOT EXISTS idx_visa_extensions_applicant_name ON public.visa_extensions (lower(applicant_name));
CREATE INDEX IF NOT EXISTS idx_visa_extensions_created_at ON public.visa_extensions (created_at DESC);