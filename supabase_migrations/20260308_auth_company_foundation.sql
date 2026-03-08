ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

ALTER TABLE board_posts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

UPDATE staff_members AS s
SET company_id = c.id
FROM companies AS c
WHERE s.company_id IS NULL
  AND s.company IS NOT NULL
  AND c.name = s.company;

UPDATE posts AS p
SET company_id = c.id
FROM companies AS c
WHERE p.company_id IS NULL
  AND p.company IS NOT NULL
  AND c.name = p.company;

UPDATE posts AS p
SET company_id = s.company_id
FROM staff_members AS s
WHERE p.company_id IS NULL
  AND p.author_id = s.id
  AND s.company_id IS NOT NULL;

UPDATE board_posts AS b
SET company_id = c.id
FROM companies AS c
WHERE b.company_id IS NULL
  AND b.company IS NOT NULL
  AND c.name = b.company;

UPDATE board_posts AS b
SET company_id = s.company_id
FROM staff_members AS s
WHERE b.company_id IS NULL
  AND b.author_id = s.id
  AND s.company_id IS NOT NULL;

UPDATE approvals AS a
SET company_id = c.id
FROM companies AS c
WHERE a.company_id IS NULL
  AND a.sender_company IS NOT NULL
  AND c.name = a.sender_company;

UPDATE approvals AS a
SET company_id = s.company_id
FROM staff_members AS s
WHERE a.company_id IS NULL
  AND a.sender_id = s.id
  AND s.company_id IS NOT NULL;

UPDATE inventory AS i
SET company_id = c.id
FROM companies AS c
WHERE i.company_id IS NULL
  AND i.company IS NOT NULL
  AND c.name = i.company;

UPDATE inventory_logs AS l
SET company_id = c.id
FROM companies AS c
WHERE l.company_id IS NULL
  AND l.company IS NOT NULL
  AND c.name = l.company;

UPDATE inventory_logs AS l
SET company_id = i.company_id
FROM inventory AS i
WHERE l.company_id IS NULL
  AND l.inventory_id = i.id
  AND i.company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_members_auth_user_id
  ON staff_members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_members_company_id
  ON staff_members(company_id);

CREATE INDEX IF NOT EXISTS idx_posts_company_id_created_at
  ON posts(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_posts_company_id_board_type_created_at
  ON board_posts(company_id, board_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approvals_company_id_status_created_at
  ON approvals(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_company_id_item_name
  ON inventory(company_id, item_name);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_company_id_created_at
  ON inventory_logs(company_id, created_at DESC);
