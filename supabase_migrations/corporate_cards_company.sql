-- 법인카드 회사별 등록

CREATE TABLE IF NOT EXISTS corporate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  card_nickname TEXT,
  last_four TEXT,
  issuer TEXT,
  holder_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_cards_company ON corporate_cards(company_name);

-- 사용내역에 카드 FK 추가
ALTER TABLE corporate_card_transactions ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES corporate_cards(id) ON DELETE SET NULL;

-- Realtime용 (Supabase 대시보드 Database > Replication에서 테이블 활성화)
-- ALTER PUBLICATION supabase_realtime ADD TABLE corporate_card_transactions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE corporate_cards;
