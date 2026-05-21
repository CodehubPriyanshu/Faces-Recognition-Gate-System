
-- ========== ENUMS ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'security_guard', 'gate_operator');
CREATE TYPE public.visitor_status AS ENUM ('in_campus', 'exited');

-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ========== USER ROLES ==========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- security-definer role check (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ========== VISITORS ==========
CREATE TABLE public.visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  id_type TEXT,
  id_number TEXT,
  purpose TEXT NOT NULL DEFAULT 'Official Meeting',
  whom_to_meet TEXT,
  vehicle_number TEXT,
  visitor_count INT NOT NULL DEFAULT 1,
  remarks TEXT,
  in_charge_name TEXT,
  photo_url TEXT,
  signature_url TEXT,
  status visitor_status NOT NULL DEFAULT 'in_campus',
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_time TIMESTAMPTZ,
  entry_by UUID REFERENCES auth.users(id),
  exit_by UUID REFERENCES auth.users(id),
  exit_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX visitors_status_idx ON public.visitors(status);
CREATE INDEX visitors_entry_time_idx ON public.visitors(entry_time DESC);
CREATE INDEX visitors_pass_no_idx ON public.visitors(pass_no);
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

-- ========== AUDIT LOGS ==========
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  target TEXT,
  metadata JSONB
);
CREATE INDEX audit_logs_ts_idx ON public.audit_logs(ts DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========
-- profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles admin read" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles admin all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "roles admin all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- visitors: any authenticated staff can read & insert; only admin can delete
CREATE POLICY "visitors auth read" ON public.visitors FOR SELECT TO authenticated USING (true);
CREATE POLICY "visitors auth insert" ON public.visitors FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "visitors auth update" ON public.visitors FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "visitors admin delete" ON public.visitors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- audit_logs: admin read, authenticated insert
CREATE POLICY "audit admin read" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit auth insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ========== TRIGGERS ==========
-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========== REALTIME ==========
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- ========== STORAGE BUCKETS ==========
INSERT INTO storage.buckets (id, name, public) VALUES ('visitor-photos','visitor-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('visitor-signatures','visitor-signatures', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "visitor photos public read" ON storage.objects FOR SELECT TO public USING (bucket_id IN ('visitor-photos','visitor-signatures'));
CREATE POLICY "visitor photos auth write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('visitor-photos','visitor-signatures'));
CREATE POLICY "visitor photos auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('visitor-photos','visitor-signatures'));
CREATE POLICY "visitor photos admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('visitor-photos','visitor-signatures') AND public.has_role(auth.uid(),'admin'));
