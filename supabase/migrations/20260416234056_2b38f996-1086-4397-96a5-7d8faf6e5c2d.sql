-- ============================================================
-- 1. LOW STOCK NOTIFICATION TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify when crossing the threshold (was OK, now low/out)
  IF NEW.qty_on_hand <= NEW.min_stock 
     AND (TG_OP = 'INSERT' OR OLD.qty_on_hand > OLD.min_stock OR NEW.min_stock <> OLD.min_stock) 
     AND NEW.min_stock > 0 THEN
    PERFORM public.notify_roles(
      ARRAY['admin','oic','2ic','storekeeper','procurement_officer']::app_role[],
      CASE WHEN NEW.qty_on_hand <= 0 THEN 'OUT OF STOCK' ELSE 'Low Stock Alert' END,
      format('%s — %s %s remaining (min: %s).', NEW.name, NEW.qty_on_hand, NEW.unit, NEW.min_stock),
      'general',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.inventory_items;
CREATE TRIGGER trg_notify_low_stock
AFTER INSERT OR UPDATE OF qty_on_hand, min_stock ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- ============================================================
-- 2. MISD / CYBER MODULE TABLES
-- ============================================================

-- Cyber incidents
CREATE TABLE public.cyber_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  incident_type TEXT NOT NULL DEFAULT 'phishing',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT,
  affected_systems TEXT,
  reported_by UUID NOT NULL,
  assigned_to UUID,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  detected_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  impact_assessment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Threat intelligence (IOCs / watchlist)
CREATE TABLE public.cyber_threat_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_type TEXT NOT NULL DEFAULT 'ip',
  indicator_value TEXT NOT NULL,
  threat_level TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  description TEXT,
  source TEXT,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Investigations / case files
CREATE TABLE public.cyber_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  case_type TEXT NOT NULL DEFAULT 'fraud',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  lead_investigator UUID,
  related_incident_id UUID REFERENCES public.cyber_incidents(id) ON DELETE SET NULL,
  evidence_summary TEXT,
  suspects TEXT,
  referred_to_agency TEXT,
  referred_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  outcome TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cyber_incidents_status ON public.cyber_incidents(status);
CREATE INDEX idx_cyber_incidents_severity ON public.cyber_incidents(severity);
CREATE INDEX idx_cyber_incidents_reported_at ON public.cyber_incidents(reported_at DESC);
CREATE INDEX idx_cyber_threat_intel_active ON public.cyber_threat_intel(is_active);
CREATE INDEX idx_cyber_investigations_status ON public.cyber_investigations(status);

-- Enable RLS
ALTER TABLE public.cyber_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cyber_threat_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cyber_investigations ENABLE ROW LEVEL SECURITY;

-- RLS: Admins, OIC, 2IC manage everything
CREATE POLICY "Cmd manage cyber incidents" ON public.cyber_incidents FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));

CREATE POLICY "Supervisors view cyber incidents" ON public.cyber_incidents FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));

CREATE POLICY "Supervisors create cyber incidents" ON public.cyber_incidents FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND reported_by = auth.uid());

CREATE POLICY "Supervisors update cyber incidents" ON public.cyber_incidents FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'))
  WITH CHECK (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));

CREATE POLICY "Cmd manage threat intel" ON public.cyber_threat_intel FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));

CREATE POLICY "Supervisors view threat intel" ON public.cyber_threat_intel FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));

CREATE POLICY "Supervisors add threat intel" ON public.cyber_threat_intel FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND added_by = auth.uid());

CREATE POLICY "Cmd manage investigations" ON public.cyber_investigations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));

CREATE POLICY "Supervisors view investigations" ON public.cyber_investigations FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor'));

CREATE POLICY "Supervisors create investigations" ON public.cyber_investigations FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'shift_supervisor') OR has_role(auth.uid(),'deputy_shift_supervisor')) AND created_by = auth.uid());

-- Updated_at triggers
CREATE TRIGGER trg_cyber_incidents_updated BEFORE UPDATE ON public.cyber_incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cyber_threat_intel_updated BEFORE UPDATE ON public.cyber_threat_intel FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cyber_investigations_updated BEFORE UPDATE ON public.cyber_investigations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification trigger for new high/critical incidents
CREATE OR REPLACE FUNCTION public.notify_new_cyber_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','oic','2ic']::app_role[],
    format('Cyber Incident — %s', upper(NEW.severity)),
    format('%s: %s', NEW.incident_number, NEW.title),
    'general',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_cyber_incident
AFTER INSERT ON public.cyber_incidents
FOR EACH ROW WHEN (NEW.severity IN ('high','critical'))
EXECUTE FUNCTION public.notify_new_cyber_incident();