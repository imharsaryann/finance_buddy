-- ============================================================
--   FINANCE BUDDY — Complete Supabase Database Schema v2.0
--   Run this in Supabase: SQL Editor → New Query → Run All
--
--   Tables:
--     1.  profiles           — User profile, cash balance, vault target
--     2.  incomes            — Income transactions with attachments
--     3.  expenses           — Expense transactions with receipts
--     4.  banks              — Bank accounts, wallets, cash entries
--     5.  credit_cards       — Credit card details & limits
--     6.  cc_logs            — Credit card spend & repayment history
--     7.  vault_logs         — Personal Reserve Vault deposits & withdrawals
--     8.  borrowers          — Khata / Udhar lending tracker
--     9.  samitis            — Samiti investment schemes
--     10. samiti_payments    — Samiti payment attendance log
--     11. web_apps           — My Links / Bookmarks shortcut panel
--     12. storage (receipts) — File/image uploads (receipt & attachments)
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. PROFILES
--    Stores per-user profile: cash balance, full name, email,
--    vault (personal reserve) target amount.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    full_name     TEXT,
    email         TEXT,
    cash          NUMERIC     NOT NULL DEFAULT 0,
    vault_target  NUMERIC     NOT NULL DEFAULT 0
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vault_target NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own profile" ON profiles;
CREATE POLICY "Users can manage their own profile"
    ON profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
        updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ──────────────────────────────────────────────────────────
-- 2. INCOMES
--    Each income transaction: date, amount, category.
--    Optional receipt/attachment file URL.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incomes (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    date           DATE        NOT NULL,
    amount         NUMERIC     NOT NULL,
    category       TEXT        NOT NULL DEFAULT 'Others',
    attachment_url TEXT,
    user_id        UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE incomes ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own incomes" ON incomes;
CREATE POLICY "Users can manage their own incomes"
    ON incomes FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 3. EXPENSES
--    Each expense transaction: date, amount, category.
--    Optional receipt/attachment file URL.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    date           DATE        NOT NULL,
    amount         NUMERIC     NOT NULL,
    category       TEXT        NOT NULL DEFAULT 'Others',
    attachment_url TEXT,
    user_id        UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own expenses" ON expenses;
CREATE POLICY "Users can manage their own expenses"
    ON expenses FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 4. BANKS
--    Bank accounts, savings accounts, wallets, UPI, cash.
--    Supports pinning to sidebar and custom pin order.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    "bankName"      TEXT        NOT NULL,
    type            TEXT        NOT NULL DEFAULT 'savings',
    "accountNumber" TEXT        NOT NULL DEFAULT '',
    balance         NUMERIC     NOT NULL DEFAULT 0,
    is_pinned       BOOLEAN     NOT NULL DEFAULT false,
    pin_order       INTEGER     NOT NULL DEFAULT 0,
    user_id         UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE banks ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS pin_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own banks" ON banks;
CREATE POLICY "Users can manage their own banks"
    ON banks FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 5. CREDIT_CARDS
--    Credit card master records: limit, outstanding balance,
--    statement date, bill due date.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_cards (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    "bankName"      TEXT        NOT NULL,
    "cardName"      TEXT        NOT NULL,
    "cardNumber"    TEXT        NOT NULL DEFAULT 'XXXX',
    "limit"         NUMERIC     NOT NULL DEFAULT 0,
    outstanding     NUMERIC     NOT NULL DEFAULT 0,
    "statementDate" TEXT        DEFAULT '15',
    "dueDate"       TEXT        DEFAULT '05',
    user_id         UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own credit cards" ON credit_cards;
CREATE POLICY "Users can manage their own credit cards"
    ON credit_cards FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 6. CC_LOGS
--    Credit card transaction history: spends & repayments.
--    Linked to a credit_card via card_id (optional FK).
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    card_id    UUID        REFERENCES credit_cards(id) ON DELETE SET NULL,
    card_name  TEXT        NOT NULL,
    type       TEXT        NOT NULL DEFAULT 'spend',   -- 'spend' | 'repayment'
    amount     NUMERIC     NOT NULL,
    date       DATE        NOT NULL,
    note       TEXT,
    category   TEXT        DEFAULT 'General',
    user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE cc_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own cc_logs" ON cc_logs;
CREATE POLICY "Users can manage their own cc_logs"
    ON cc_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 7. VAULT_LOGS
--    Personal Reserve Vault transaction log.
--    Records every deposit and withdrawal with a reason.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    type       TEXT        NOT NULL,    -- 'deposit' | 'withdraw'
    amount     NUMERIC     NOT NULL,
    reason     TEXT        NOT NULL,
    date       DATE        NOT NULL,
    user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE vault_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own vault_logs" ON vault_logs;
CREATE POLICY "Users can manage their own vault_logs"
    ON vault_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 8. BORROWERS
--    Khata / Udhar tracker.
--    Records who borrowed money, how much, and how much repaid.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS borrowers (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    name       TEXT        NOT NULL,
    principal  NUMERIC     NOT NULL DEFAULT 0,
    repaid     NUMERIC     NOT NULL DEFAULT 0,
    date       DATE        NOT NULL,
    user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own borrowers" ON borrowers;
CREATE POLICY "Users can manage their own borrowers"
    ON borrowers FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 9. SAMITIS
--    Samiti / Chit-fund scheme master records.
--    Tracks name, daily/monthly contribution, start date,
--    tenure, and expected maturity amount.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS samitis (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    name            TEXT        NOT NULL,
    daily_amount    NUMERIC     NOT NULL,
    start_date      DATE        NOT NULL,
    tenure_months   INTEGER     NOT NULL,
    maturity_amount NUMERIC     NOT NULL,
    frequency       TEXT        NOT NULL DEFAULT 'monthly',  -- 'daily' | 'monthly'
    user_id         UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE samitis ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE samitis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own samitis" ON samitis;
CREATE POLICY "Users can manage their own samitis"
    ON samitis FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 10. SAMITI_PAYMENTS
--     Day-by-day / month-by-month payment attendance log.
--     Each row = one paid installment for a samiti.
--     UNIQUE(samiti_id, payment_date) prevents duplicate entries.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS samiti_payments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    samiti_id    UUID        NOT NULL REFERENCES samitis(id) ON DELETE CASCADE,
    payment_date DATE        NOT NULL,
    user_id      UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    UNIQUE(samiti_id, payment_date)
);

ALTER TABLE samiti_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own samiti payments" ON samiti_payments;
CREATE POLICY "Users can manage their own samiti payments"
    ON samiti_payments FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 11. WEB_APPS
--     "My Links" shortcut panel.
--     Users save custom website links with title, URL,
--     category, description, and can pin them to sidebar.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_apps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    title       TEXT        NOT NULL,
    url         TEXT        NOT NULL,
    category    TEXT        DEFAULT 'General',
    description TEXT,
    is_pinned   BOOLEAN     NOT NULL DEFAULT false,
    user_id     UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE web_apps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own web apps" ON web_apps;
CREATE POLICY "Users can manage their own web apps"
    ON web_apps FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 12. STORAGE — receipts bucket
--     Stores uploaded files: income/expense receipts,
--     attachment photos, transaction proof images.
-- ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own receipts"  ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view receipts"             ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts"  ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts"  ON storage.objects;

CREATE POLICY "Users can upload their own receipts"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view receipts"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'receipts');

CREATE POLICY "Users can update their own receipts"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own receipts"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ──────────────────────────────────────────────────────────
-- 13. ADMIN MASTER-VIEW POLICIES
--     The admin user (mailtonirala2016@gmail.com) can read
--     all users' data across every table for oversight.
--     (Admin is identified by checking extra_admins list in App)
-- ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin view all profiles"         ON profiles;
DROP POLICY IF EXISTS "Admin view all incomes"          ON incomes;
DROP POLICY IF EXISTS "Admin view all expenses"         ON expenses;
DROP POLICY IF EXISTS "Admin view all banks"            ON banks;
DROP POLICY IF EXISTS "Admin view all credit_cards"     ON credit_cards;
DROP POLICY IF EXISTS "Admin view all cc_logs"          ON cc_logs;
DROP POLICY IF EXISTS "Admin view all vault_logs"       ON vault_logs;
DROP POLICY IF EXISTS "Admin view all borrowers"        ON borrowers;
DROP POLICY IF EXISTS "Admin view all samitis"          ON samitis;
DROP POLICY IF EXISTS "Admin view all samiti_payments"  ON samiti_payments;
DROP POLICY IF EXISTS "Admin view all web_apps"         ON web_apps;

CREATE POLICY "Admin view all profiles"        ON profiles        FOR SELECT USING (true);
CREATE POLICY "Admin view all incomes"         ON incomes         FOR SELECT USING (true);
CREATE POLICY "Admin view all expenses"        ON expenses        FOR SELECT USING (true);
CREATE POLICY "Admin view all banks"           ON banks           FOR SELECT USING (true);
CREATE POLICY "Admin view all credit_cards"    ON credit_cards    FOR SELECT USING (true);
CREATE POLICY "Admin view all cc_logs"         ON cc_logs         FOR SELECT USING (true);
CREATE POLICY "Admin view all vault_logs"      ON vault_logs      FOR SELECT USING (true);
CREATE POLICY "Admin view all borrowers"       ON borrowers       FOR SELECT USING (true);
CREATE POLICY "Admin view all samitis"         ON samitis         FOR SELECT USING (true);
CREATE POLICY "Admin view all samiti_payments" ON samiti_payments FOR SELECT USING (true);
CREATE POLICY "Admin view all web_apps"        ON web_apps        FOR SELECT USING (true);

-- ============================================================
-- END OF SCHEMA — Finance Buddy v2.0
-- ============================================================
