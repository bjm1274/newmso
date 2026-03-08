CREATE OR REPLACE FUNCTION public.erp_claim_uuid(claim_key TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt() ->> claim_key, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (auth.jwt() ->> claim_key)::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.erp_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.erp_claim_uuid('erp_staff_id')
$$;

CREATE OR REPLACE FUNCTION public.erp_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.erp_claim_uuid('erp_company_id')
$$;

CREATE OR REPLACE FUNCTION public.erp_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'erp_is_admin')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.erp_can_manage_company()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'erp_can_manage_company')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.erp_company_matches(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.erp_is_admin()
    OR (
      public.erp_company_id() IS NOT NULL
      AND target_company_id IS NOT NULL
      AND public.erp_company_id() = target_company_id
    )
$$;

CREATE OR REPLACE FUNCTION public.erp_target_staff_same_company(target_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members AS s
    WHERE s.id = target_staff_id
      AND public.erp_company_id() IS NOT NULL
      AND s.company_id = public.erp_company_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.erp_target_staff_in_scope(target_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.erp_is_admin()
    OR target_staff_id = public.erp_staff_id()
    OR (
      public.erp_can_manage_company()
      AND public.erp_target_staff_same_company(target_staff_id)
    )
$$;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_scope ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_scope ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_scope ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_scope ON public.push_subscriptions;

CREATE POLICY push_subscriptions_select_scope
ON public.push_subscriptions
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY push_subscriptions_insert_scope
ON public.push_subscriptions
FOR INSERT
WITH CHECK (staff_id = public.erp_staff_id() OR public.erp_is_admin());

CREATE POLICY push_subscriptions_update_scope
ON public.push_subscriptions
FOR UPDATE
USING (staff_id = public.erp_staff_id() OR public.erp_is_admin())
WITH CHECK (staff_id = public.erp_staff_id() OR public.erp_is_admin());

CREATE POLICY push_subscriptions_delete_scope
ON public.push_subscriptions
FOR DELETE
USING (staff_id = public.erp_staff_id() OR public.erp_is_admin());

DROP POLICY IF EXISTS notifications_select_scope ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_scope ON public.notifications;
DROP POLICY IF EXISTS notifications_update_scope ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_scope ON public.notifications;

CREATE POLICY notifications_select_scope
ON public.notifications
FOR SELECT
USING (public.erp_target_staff_in_scope(user_id));

CREATE POLICY notifications_insert_scope
ON public.notifications
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR user_id = public.erp_staff_id()
  OR public.erp_target_staff_same_company(user_id)
);

CREATE POLICY notifications_update_scope
ON public.notifications
FOR UPDATE
USING (public.erp_target_staff_in_scope(user_id))
WITH CHECK (public.erp_target_staff_in_scope(user_id));

CREATE POLICY notifications_delete_scope
ON public.notifications
FOR DELETE
USING (public.erp_is_admin() OR user_id = public.erp_staff_id());

DROP POLICY IF EXISTS attendance_select_scope ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_scope ON public.attendance;
DROP POLICY IF EXISTS attendance_update_scope ON public.attendance;
DROP POLICY IF EXISTS attendance_delete_scope ON public.attendance;

CREATE POLICY attendance_select_scope
ON public.attendance
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY attendance_insert_scope
ON public.attendance
FOR INSERT
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY attendance_update_scope
ON public.attendance
FOR UPDATE
USING (public.erp_target_staff_in_scope(staff_id))
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY attendance_delete_scope
ON public.attendance
FOR DELETE
USING (public.erp_is_admin() OR staff_id = public.erp_staff_id());

DROP POLICY IF EXISTS attendances_select_scope ON public.attendances;
DROP POLICY IF EXISTS attendances_insert_scope ON public.attendances;
DROP POLICY IF EXISTS attendances_update_scope ON public.attendances;
DROP POLICY IF EXISTS attendances_delete_scope ON public.attendances;

CREATE POLICY attendances_select_scope
ON public.attendances
FOR SELECT
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

CREATE POLICY attendances_insert_scope
ON public.attendances
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

CREATE POLICY attendances_update_scope
ON public.attendances
FOR UPDATE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
)
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

CREATE POLICY attendances_delete_scope
ON public.attendances
FOR DELETE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

DROP POLICY IF EXISTS leave_requests_select_scope ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_insert_scope ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_update_scope ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_delete_scope ON public.leave_requests;

CREATE POLICY leave_requests_select_scope
ON public.leave_requests
FOR SELECT
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

CREATE POLICY leave_requests_insert_scope
ON public.leave_requests
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

CREATE POLICY leave_requests_update_scope
ON public.leave_requests
FOR UPDATE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
)
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

CREATE POLICY leave_requests_delete_scope
ON public.leave_requests
FOR DELETE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

DROP POLICY IF EXISTS payroll_records_select_scope ON public.payroll_records;
DROP POLICY IF EXISTS payroll_records_insert_scope ON public.payroll_records;
DROP POLICY IF EXISTS payroll_records_update_scope ON public.payroll_records;
DROP POLICY IF EXISTS payroll_records_delete_scope ON public.payroll_records;

CREATE POLICY payroll_records_select_scope
ON public.payroll_records
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

CREATE POLICY payroll_records_insert_scope
ON public.payroll_records
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
);

CREATE POLICY payroll_records_update_scope
ON public.payroll_records
FOR UPDATE
USING (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
)
WITH CHECK (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
);

CREATE POLICY payroll_records_delete_scope
ON public.payroll_records
FOR DELETE
USING (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
);
