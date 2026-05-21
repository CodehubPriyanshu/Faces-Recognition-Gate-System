
-- Pin search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Lock down SECURITY DEFINER fns
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- Tighten visitors insert/update policies (replace 'true' with role-aware checks)
DROP POLICY IF EXISTS "visitors auth insert" ON public.visitors;
DROP POLICY IF EXISTS "visitors auth update" ON public.visitors;
CREATE POLICY "visitors staff insert" ON public.visitors FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'security_guard') OR
  public.has_role(auth.uid(),'gate_operator')
);
CREATE POLICY "visitors staff update" ON public.visitors FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'security_guard') OR
  public.has_role(auth.uid(),'gate_operator')
);

-- Tighten audit insert
DROP POLICY IF EXISTS "audit auth insert" ON public.audit_logs;
CREATE POLICY "audit staff insert" ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Storage tighten
DROP POLICY IF EXISTS "visitor photos auth update" ON storage.objects;
CREATE POLICY "visitor photos staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('visitor-photos','visitor-signatures') AND (
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'security_guard') OR
  public.has_role(auth.uid(),'gate_operator')
));
