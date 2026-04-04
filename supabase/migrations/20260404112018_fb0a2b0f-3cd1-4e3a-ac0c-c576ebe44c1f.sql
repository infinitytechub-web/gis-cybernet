
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'staff');

-- Create leave_type enum
CREATE TYPE public.leave_type AS ENUM ('annual', 'sick', 'compassionate', 'pass', 'study');

-- Create leave_status enum
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected');

-- Create attendance_status enum
CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'excused');

-- Create transfer_type enum
CREATE TYPE public.transfer_type AS ENUM ('posting', 'transfer');

-- Create staff_status enum
CREATE TYPE public.staff_status AS ENUM ('active', 'inactive', 'study_leave', 'transferred');

-- Create shift_pattern enum
CREATE TYPE public.shift_pattern AS ENUM ('8h', '12h', 'custom');

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Ranks table
CREATE TABLE public.ranks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL UNIQUE,
  level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  staff_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  rank_id UUID REFERENCES public.ranks(id),
  gender TEXT,
  department_id UUID REFERENCES public.departments(id),
  unit TEXT,
  shift_group TEXT,
  phone TEXT,
  photo_url TEXT,
  status public.staff_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Security definer function for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Shifts table
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pattern public.shift_pattern NOT NULL DEFAULT '8h',
  start_time TIME,
  end_time TIME,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shift assignments
CREATE TABLE public.shift_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendances
CREATE TABLE public.attendances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status public.attendance_status NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leave requests
CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status public.leave_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Holidays
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postings & Transfers
CREATE TABLE public.postings_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_department_id UUID REFERENCES public.departments(id),
  to_department_id UUID REFERENCES public.departments(id),
  effective_date DATE NOT NULL,
  type public.transfer_type NOT NULL,
  status public.leave_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postings_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Ranks: everyone can read
CREATE POLICY "Anyone can view ranks" ON public.ranks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage ranks" ON public.ranks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Departments: everyone can read
CREATE POLICY "Anyone can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage departments" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles: staff see own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- User roles: only admins
CREATE POLICY "Admins can manage user roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Shifts: everyone can read
CREATE POLICY "Anyone can view shifts" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage shifts" ON public.shifts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Shift assignments
CREATE POLICY "Users can view own shift assignments" ON public.shift_assignments FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage shift assignments" ON public.shift_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Attendances
CREATE POLICY "Users can view own attendance" ON public.attendances FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can create own attendance" ON public.attendances FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage attendance" ON public.attendances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Leave requests
CREATE POLICY "Users can view own leave requests" ON public.leave_requests FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can create own leave requests" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage leave requests" ON public.leave_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Holidays: everyone can read
CREATE POLICY "Anyone can view holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage holidays" ON public.holidays FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Postings & Transfers
CREATE POLICY "Users can view own postings" ON public.postings_transfers FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage postings" ON public.postings_transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendances_updated_at BEFORE UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_postings_transfers_updated_at BEFORE UPDATE ON public.postings_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for staff photos
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-photos', 'staff-photos', true);

CREATE POLICY "Staff photos are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'staff-photos');
CREATE POLICY "Admins can upload staff photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'staff-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update staff photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'staff-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete staff photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'staff-photos' AND public.has_role(auth.uid(), 'admin'));

-- Create profile trigger on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, staff_id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'staff_id', 'GIS-' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  -- Default role is 'staff'
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
