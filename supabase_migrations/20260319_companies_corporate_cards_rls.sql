-- companies, corporate_cards, corporate_card_transactions RLS 정책
-- 저장/수정이 안 되는 문제 해결

-- =============================================
-- 1. companies 테이블 RLS
-- =============================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_all ON public.companies;
DROP POLICY IF EXISTS companies_insert_admin ON public.companies;
DROP POLICY IF EXISTS companies_update_admin ON public.companies;
DROP POLICY IF EXISTS companies_delete_admin ON public.companies;

-- 전체 조회: 로그인한 사용자 모두 가능
CREATE POLICY companies_select_all
ON public.companies
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 등록/수정/삭제: MSO 관리자만 가능
CREATE POLICY companies_insert_admin
ON public.companies
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY companies_update_admin
ON public.companies
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY companies_delete_admin
ON public.companies
FOR DELETE
USING (public.erp_is_admin());

-- =============================================
-- 2. corporate_cards 테이블 RLS
-- =============================================
ALTER TABLE public.corporate_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corporate_cards_select ON public.corporate_cards;
DROP POLICY IF EXISTS corporate_cards_insert ON public.corporate_cards;
DROP POLICY IF EXISTS corporate_cards_update ON public.corporate_cards;
DROP POLICY IF EXISTS corporate_cards_delete ON public.corporate_cards;

CREATE POLICY corporate_cards_select
ON public.corporate_cards
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY corporate_cards_insert
ON public.corporate_cards
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY corporate_cards_update
ON public.corporate_cards
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY corporate_cards_delete
ON public.corporate_cards
FOR DELETE
USING (public.erp_is_admin() OR public.erp_can_manage_company());

-- =============================================
-- 3. corporate_card_transactions 테이블 RLS
-- =============================================
ALTER TABLE public.corporate_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corporate_card_transactions_select ON public.corporate_card_transactions;
DROP POLICY IF EXISTS corporate_card_transactions_insert ON public.corporate_card_transactions;
DROP POLICY IF EXISTS corporate_card_transactions_update ON public.corporate_card_transactions;
DROP POLICY IF EXISTS corporate_card_transactions_delete ON public.corporate_card_transactions;

CREATE POLICY corporate_card_transactions_select
ON public.corporate_card_transactions
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY corporate_card_transactions_insert
ON public.corporate_card_transactions
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY corporate_card_transactions_update
ON public.corporate_card_transactions
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

CREATE POLICY corporate_card_transactions_delete
ON public.corporate_card_transactions
FOR DELETE
USING (public.erp_is_admin() OR public.erp_can_manage_company());
