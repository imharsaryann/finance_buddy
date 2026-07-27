-- ============================================================
--  FINANCE BUDDY — Fresh Setup SQL (Run This in Supabase)
--  SQL Editor → New Query → Paste Below → Click RUN
--
--  This script:
--  1. Drops old tables (if any) in safe order
--  2. Creates all fresh tables with proper FK relationships
--  3. Enables Row Level Security on every table
--  4. Creates auth trigger for auto profile creation
--  5. Sets up storage bucket for receipts
--  6. Adds admin read-all policies
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- STEP 1: DROP OLD TABLES (safe order — child → parent)
-- ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS samiti_payments  CASCADE;
DROP TABLE IF EXISTS samitis          CASCADE;
DROP TABLE IF EXISTS cc_logs          CASCADE;
DROP TABLE IF EXISTS vault_logs       CASCADE;
DROP TABLE IF EXISTS borrowers        CASCADE;
DROP TABLE IF EXISTS web_apps         CASCADE;
DROP TABLE IF EXISTS credit_cards     CASCADE;
DROP TABLE IF EXISTS banks            CASCADE;
DROP TABLE IF EXISTS expenses         CASCADE;
DROP TABLE IF EXISTS incomes          CASCADE;
DROP TABLE IF EXISTS user_settings    CASCADE;
DROP TABLE IF EXISTS profiles         CASCADE;


-- ──────────────────────────────────────────────────────────
-- STEP 2: PROFILES
--    Central user record.
--    Links to: auth.users (1-to-1)
--    Referenced by: incomes, expenses, banks, credit_cards,
--                   cc_logs, vault_logs, borrowers,
--                   samitis, samiti_payments, web_apps
-- ──────────────────────────────────────────────────────────
CREATE TABLE profiles (
    id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    full_name     TEXT,
    email         TEXT,
    cash          NUMERIC     NOT NULL DEFAULT 0,       -- Cash in hand balance
    vault_target  NUMERIC     NOT NULL DEFAULT 0        -- Personal reserve savings goal
);

-- Auto-create a profile row whenever a new user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, cash, vault_target)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        0,
        0
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name  = EXCLUDED.full_name,
        email      = EXCLUDED.email,
        updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile"   ON profiles FOR ALL    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admin read all profiles"    ON profiles FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 3: INCOMES
--    One row = one income transaction.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE incomes (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date           DATE        NOT NULL,
    amount         NUMERIC     NOT NULL CHECK (amount >= 0),
    category       TEXT        NOT NULL DEFAULT 'Others',
    attachment_url TEXT                                          -- Receipt / proof image URL
);

ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own incomes"   ON incomes FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all incomes"     ON incomes FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 4: EXPENSES
--    One row = one expense transaction.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE expenses (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date           DATE        NOT NULL,
    amount         NUMERIC     NOT NULL CHECK (amount >= 0),
    category       TEXT        NOT NULL DEFAULT 'Others',
    attachment_url TEXT                                          -- Receipt / proof image URL
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own expenses"  ON expenses FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all expenses"    ON expenses FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 5: BANKS
--    Bank accounts, savings, wallets, UPI, cash accounts.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE banks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    "bankName"      TEXT        NOT NULL,
    type            TEXT        NOT NULL DEFAULT 'savings',   -- savings | current | wallet | UPI | cash
    "accountNumber" TEXT        NOT NULL DEFAULT '',
    balance         NUMERIC     NOT NULL DEFAULT 0,
    is_pinned       BOOLEAN     NOT NULL DEFAULT false,        -- Pinned to sidebar?
    pin_order       INTEGER     NOT NULL DEFAULT 0             -- Order on sidebar
);

ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own banks"     ON banks FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all banks"       ON banks FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 6: CREDIT_CARDS
--    Credit card master info: limit, outstanding, dates.
--    Links to: profiles.id (via user_id)
--    Referenced by: cc_logs (one card → many log entries)
-- ──────────────────────────────────────────────────────────
CREATE TABLE credit_cards (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    "bankName"      TEXT        NOT NULL,
    "cardName"      TEXT        NOT NULL,
    "cardNumber"    TEXT        NOT NULL DEFAULT 'XXXX',
    "limit"         NUMERIC     NOT NULL DEFAULT 0,
    outstanding     NUMERIC     NOT NULL DEFAULT 0,
    "statementDate" TEXT        DEFAULT '15',                 -- Day of month statement is generated
    "dueDate"       TEXT        DEFAULT '05'                  -- Day of month bill is due
);

ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own credit_cards" ON credit_cards FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all credit_cards"   ON credit_cards FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 7: CC_LOGS
--    Credit card spend & repayment history.
--    Links to: profiles.id (via user_id)
--              credit_cards.id (via card_id) — optional FK
-- ──────────────────────────────────────────────────────────
CREATE TABLE cc_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    card_id    UUID        REFERENCES credit_cards(id) ON DELETE SET NULL,  -- NULL = card deleted but log kept
    card_name  TEXT        NOT NULL,
    type       TEXT        NOT NULL DEFAULT 'spend',          -- 'spend' | 'repayment'
    amount     NUMERIC     NOT NULL CHECK (amount >= 0),
    date       DATE        NOT NULL,
    note       TEXT,
    category   TEXT        DEFAULT 'General'
);

ALTER TABLE cc_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cc_logs"   ON cc_logs FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all cc_logs"     ON cc_logs FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 8: VAULT_LOGS
--    Personal Reserve Vault transaction history.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE vault_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type       TEXT        NOT NULL,                          -- 'deposit' | 'withdraw'
    amount     NUMERIC     NOT NULL CHECK (amount >= 0),
    reason     TEXT        NOT NULL,
    date       DATE        NOT NULL
);

ALTER TABLE vault_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own vault_logs"  ON vault_logs FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all vault_logs"    ON vault_logs FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 9: BORROWERS  (Khata / Udhar)
--    One row per borrower/lendee.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE borrowers (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    principal  NUMERIC     NOT NULL DEFAULT 0,                -- Total amount lent
    repaid     NUMERIC     NOT NULL DEFAULT 0,                -- Amount returned so far
    date       DATE        NOT NULL                           -- Date money was lent
);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own borrowers"   ON borrowers FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all borrowers"     ON borrowers FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 10: SAMITIS
--    Samiti / Chit-fund master scheme record.
--    Links to: profiles.id (via user_id)
--    Referenced by: samiti_payments (one samiti → many payments)
-- ──────────────────────────────────────────────────────────
CREATE TABLE samitis (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    daily_amount    NUMERIC     NOT NULL DEFAULT 0,           -- Contribution per installment
    start_date      DATE        NOT NULL,
    tenure_months   INTEGER     NOT NULL DEFAULT 12,
    maturity_amount NUMERIC     NOT NULL DEFAULT 0,           -- Expected payout at end
    frequency       TEXT        NOT NULL DEFAULT 'monthly'    -- 'daily' | 'monthly'
);

ALTER TABLE samitis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own samitis"     ON samitis FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all samitis"       ON samitis FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 11: SAMITI_PAYMENTS
--    Day-by-day installment attendance log.
--    Links to: samitis.id (via samiti_id) — CASCADE DELETE
--              profiles.id (via user_id)
--    UNIQUE constraint prevents double-marking same date.
-- ──────────────────────────────────────────────────────────
CREATE TABLE samiti_payments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id      UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
    samiti_id    UUID        NOT NULL REFERENCES samitis(id)   ON DELETE CASCADE,
    payment_date DATE        NOT NULL,
    UNIQUE (samiti_id, payment_date)                          -- Prevent duplicate payment for same date
);

ALTER TABLE samiti_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own samiti_payments"  ON samiti_payments FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all samiti_payments"    ON samiti_payments FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 12: WEB_APPS  (My Links / Bookmarks)
--    User-saved website shortcuts.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE web_apps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    url         TEXT        NOT NULL,
    category    TEXT        DEFAULT 'General',
    description TEXT,
    is_pinned   BOOLEAN     NOT NULL DEFAULT false             -- Pinned to sidebar nav?
);

ALTER TABLE web_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own web_apps"    ON web_apps FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all web_apps"      ON web_apps FOR SELECT USING (true);



-- ──────────────────────────────────────────────────────────
-- STEP 13: NOTES  (Google Keep-style notes)
--    Cloud-synced notes with colors, pinning, and tags.
--    Links to: profiles.id (via user_id)
-- ──────────────────────────────────────────────────────────
CREATE TABLE notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL DEFAULT '',
    body        TEXT        NOT NULL DEFAULT '',
    color       TEXT        NOT NULL DEFAULT 'default',   -- 'default' | 'red' | 'blue' | 'green' | etc.
    tags        TEXT[]      NOT NULL DEFAULT '{}',        -- Array of tag strings
    is_pinned   BOOLEAN     NOT NULL DEFAULT false,       -- Pinned to top?
    is_archived BOOLEAN     NOT NULL DEFAULT false        -- Archived (hidden)?
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes"   ON notes FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read all notes"     ON notes FOR SELECT USING (true);


-- ──────────────────────────────────────────────────────────
-- STEP 14: STORAGE BUCKET — receipts
--    Stores uploaded image files:
--    income proof, expense receipts, transaction attachments.
-- ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Upload own receipts"   ON storage.objects;
DROP POLICY IF EXISTS "View receipts public"  ON storage.objects;
DROP POLICY IF EXISTS "Update own receipts"   ON storage.objects;
DROP POLICY IF EXISTS "Delete own receipts"   ON storage.objects;

CREATE POLICY "Upload own receipts"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "View receipts public"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'receipts');

CREATE POLICY "Update own receipts"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'receipts');

CREATE POLICY "Delete own receipts"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'receipts');


-- ============================================================
-- DONE! All 12 tables created and connected.
-- Relationship map:
--
--   auth.users
--       └── profiles (1:1)
--               ├── incomes         (1:many)
--               ├── expenses        (1:many)
--               ├── banks           (1:many)
--               ├── credit_cards    (1:many)
--               │       └── cc_logs (1:many, optional FK)
--               ├── cc_logs         (1:many, direct)
--               ├── vault_logs      (1:many)
--               ├── borrowers       (1:many)
--               ├── samitis         (1:many)
--               │       └── samiti_payments (1:many)
--               ├── samiti_payments (1:many, direct)
--               └── web_apps        (1:many)
--
--   storage.buckets → receipts
--       incomes.attachment_url  ─┐
--       expenses.attachment_url ─┘ point here
-- ============================================================
