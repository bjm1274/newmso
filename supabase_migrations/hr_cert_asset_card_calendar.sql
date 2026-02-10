-- 증명서 발급 이력, 법인카드, 비품대여, 캘린더 동기화

-- 1. 증명서 발급 이력
CREATE TABLE IF NOT EXISTS certificate_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  cert_type TEXT NOT NULL CHECK (cert_type IN ('재직증명서','경력증명서','퇴직증명서','급여인증서','근무확인서','원천징수영수증','소득금액증명원')),
  serial_no VARCHAR(50) UNIQUE NOT NULL,
  purpose TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  issued_by UUID REFERENCES staff_members(id),
  pdf_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_cert_staff ON certificate_issuances(staff_id);
CREATE INDEX IF NOT EXISTS idx_cert_issued ON certificate_issuances(issued_at);

-- 2. 법인카드 사용 내역
CREATE TABLE IF NOT EXISTS corporate_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_holder_id UUID REFERENCES staff_members(id),
  transaction_date DATE NOT NULL,
  merchant TEXT,
  category TEXT CHECK (category IN ('식비','교통','경비','복리후생','의료','기타')),
  amount BIGINT NOT NULL DEFAULT 0,
  description TEXT,
  receipt_url TEXT,
  company_name TEXT DEFAULT '전체',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_card_date ON corporate_card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_card_category ON corporate_card_transactions(category);

-- 3. 비품/장비 대여 (입퇴사 연동)
CREATE TABLE IF NOT EXISTS asset_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('노트북','PC','모니터','키보드','마우스','회의실키','기타')),
  asset_name TEXT,
  loaned_at DATE NOT NULL,
  returned_at DATE,
  condition_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_staff ON asset_loans(staff_id);
