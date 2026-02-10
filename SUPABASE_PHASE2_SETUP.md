# Supabase SQL 설정 - 2단계 (4,5,6번 기능)

## 1. 게시판 테이블 생성

```sql
-- 게시판 게시물 테이블
CREATE TABLE IF NOT EXISTS board_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_type TEXT NOT NULL, -- '공지사항', '자유게시판', '수술일정', 'MRI일정'
    title TEXT NOT NULL,
    content TEXT,
    schedule_date DATE, -- 수술/MRI 일정용
    schedule_time TIME, -- 수술/MRI 일정용
    schedule_room TEXT, -- 수술실/MRI실
    patient_name TEXT, -- 환자명
    author_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 추가 (조회 성능 향상)
CREATE INDEX idx_board_type ON board_posts(board_type);
CREATE INDEX idx_board_date ON board_posts(created_at DESC);
```

---

## 2. 근태 시스템 테이블 확장

```sql
-- 기존 attendance 테이블에 GPS 컬럼 추가
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10, 8);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lon DECIMAL(11, 8);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lat_out DECIMAL(10, 8);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lon_out DECIMAL(11, 8);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gps_verified BOOLEAN DEFAULT FALSE;

-- 근태 수정 신청 테이블 (지각/미기록 정정용)
CREATE TABLE IF NOT EXISTS attendance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staffs(id),
    attendance_date DATE NOT NULL,
    reason TEXT NOT NULL,
    correction_type TEXT, -- '정상반영', '지각처리', '결근처리'
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approval_status TEXT DEFAULT '대기', -- '대기', '승인', '거절'
    approved_by UUID REFERENCES staffs(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- 인덱스 추가
CREATE INDEX idx_attendance_staff_date ON attendance(staff_id, date);
CREATE INDEX idx_corrections_status ON attendance_corrections(approval_status);
```

---

## 3. 채팅 공지사항 채팅방 설정

```sql
-- 채팅방 테이블 (이미 있다면 스킵)
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    room_type TEXT, -- 'public', 'private', 'mandatory'
    is_mandatory BOOLEAN DEFAULT FALSE, -- 필수 참여 여부
    created_by UUID REFERENCES staffs(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 채팅방 멤버 테이블
CREATE TABLE IF NOT EXISTS chat_room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES chat_rooms(id),
    staff_id UUID REFERENCES staffs(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    can_leave BOOLEAN DEFAULT TRUE, -- 필수 채팅방은 FALSE
    UNIQUE(room_id, staff_id)
);

-- 공지사항 채팅방 자동 생성
INSERT INTO chat_rooms (name, description, room_type, is_mandatory, created_by)
VALUES (
    '📢 공지사항',
    '병원 공지사항 및 중요 안내',
    'mandatory',
    TRUE,
    (SELECT id FROM staffs WHERE position = '병원장' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- 모든 직원을 공지사항 채팅방에 자동 추가
INSERT INTO chat_room_members (room_id, staff_id, can_leave)
SELECT 
    (SELECT id FROM chat_rooms WHERE name = '📢 공지사항'),
    id,
    FALSE
FROM staffs
ON CONFLICT DO NOTHING;
```

---

## 4. 출결 정정 결재 연동

```sql
-- 전자결재 타입에 '출결정정' 추가
-- (approvals 테이블의 type 컬럼에 '출결정정' 추가)

-- 출결 정정 신청 시 자동 결재 생성 트리거 (선택사항)
-- 이는 애플리케이션 레벨에서 처리하는 것이 권장됨

-- 샘플 데이터: 출결 정정 신청
INSERT INTO attendance_corrections (
    staff_id,
    attendance_date,
    reason,
    correction_type,
    requested_at
) VALUES (
    (SELECT id FROM staffs WHERE name = '김행정' LIMIT 1),
    '2026-02-06',
    '회의로 인해 지각',
    '정상반영',
    NOW()
);
```

---

## 5. 발급된 양식 테이블 (1단계에서 추가)

```sql
-- 이미 1단계에서 생성했다면 스킵
CREATE TABLE IF NOT EXISTS issued_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_type TEXT,
    target_staff_id UUID REFERENCES staffs(id),
    issued_by UUID REFERENCES staffs(id),
    purpose TEXT,
    urgency TEXT,
    status TEXT DEFAULT '발급완료',
    issued_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approval_id UUID REFERENCES approvals(id)
);
```

---

## 6. 권한 설정 (RLS)

```sql
-- board_posts RLS 정책
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view board posts"
ON board_posts FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert board posts"
ON board_posts FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM staffs
        WHERE staffs.id = auth.uid()
        AND (staffs.role = 'admin' OR staffs.department = '행정팀')
    )
);

-- attendance_corrections RLS 정책
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own corrections"
ON attendance_corrections FOR SELECT
USING (
    staff_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM staffs
        WHERE staffs.id = auth.uid()
        AND (staffs.role = 'admin' OR staffs.department = '행정팀')
    )
);

CREATE POLICY "Users can insert own corrections"
ON attendance_corrections FOR INSERT
WITH CHECK (staff_id = auth.uid());

-- chat_rooms RLS 정책
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view chat rooms"
ON chat_rooms FOR SELECT
USING (true);

-- chat_room_members RLS 정책
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
ON chat_room_members FOR SELECT
USING (
    staff_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM staffs
        WHERE staffs.id = auth.uid()
        AND (staffs.role = 'admin' OR staffs.department = '행정팀')
    )
);
```

---

## 7. 실행 순서

1. **게시판 테이블 생성** (board_posts)
2. **근태 시스템 확장** (attendance 컬럼 추가, attendance_corrections)
3. **채팅 공지사항 설정** (chat_rooms, chat_room_members)
4. **출결 정정 테이블** (attendance_corrections)
5. **권한 설정** (RLS 정책)

---

## 8. 테스트 데이터 (선택사항)

```sql
-- 공지사항 게시물 샘플
INSERT INTO board_posts (board_type, title, content, author_name)
VALUES (
    '공지사항',
    '2월 근무 일정 안내',
    '2월 근무 일정이 확정되었습니다. 인사관리에서 확인하세요.',
    '행정팀'
);

-- 수술 일정 샘플
INSERT INTO board_posts (
    board_type, title, schedule_date, schedule_time,
    schedule_room, patient_name, author_name
) VALUES (
    '수술일정',
    '무릎 관절경 수술',
    '2026-02-10',
    '10:00',
    '수술실 1',
    '김환자',
    '행정팀'
);
```

---

## 주의사항

- **GPS 데이터:** 개인정보이므로 접근 권한을 엄격히 제한하세요.
- **채팅 공지사항:** 필수 채팅방이므로 직원은 나갈 수 없습니다.
- **출결 정정:** 행정팀의 승인이 필요합니다.
- **게시판:** 공지사항과 수술/MRI 일정은 행정팀만 작성 가능합니다.
