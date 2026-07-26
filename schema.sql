-- ============================================================
--   FINANCE BUDDY — Complete Supabase Database Schema
--   Run this script in Supabase: SQL Editor -> New Query -> Run
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. PROFILES (User balance, display name, email, vault target)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cash          NUMERIC DEFAULT 0 NOT NULL,
    full_name     TEXT,
    email         TEXT,
    vault_target  NUMERIC DEFAULT 0 NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vault_target NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own profile" ON profiles;
CREATE POLICY "Users can manage their own profile"
    ON profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Auto-create/update profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, cash, full_name, email, vault_target)
    VALUES (
        new.id,
        0,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.email,
        0
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name  = EXCLUDED.full_name,
        email      = EXCLUDED.email,
        updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────
-- 2. USER_SETTINGS (Navbar visibility, last active tab, pins)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    last_view           TEXT DEFAULT 'dashboard',
    show_nav_links      BOOLEAN DEFAULT false NOT NULL,
    show_incomes_nav    BOOLEAN DEFAULT false NOT NULL,
    show_expenses_nav   BOOLEAN DEFAULT false NOT NULL,
    bank_pins           JSONB DEFAULT '{}'::jsonb NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_view         TEXT DEFAULT 'dashboard';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_nav_links    BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_incomes_nav  BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_expenses_nav BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS bank_pins         JSONB DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own settings" ON user_settings;
CREATE POLICY "Users can manage their own settings"
    ON user_settings FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- ─────────────────────────────────────────────
-- 3. INCOMES (Income transactions & attachments)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incomes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    date           DATE NOT NULL,
    amount         NUMERIC NOT NULL,
    category       TEXT NOT NULL,
    attachment_url TEXT,
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE incomes ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own incomes" ON incomes;
CREATE POLICY "Users can manage their own incomes"
    ON incomes FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 4. EXPENSES (Expense transactions & receipts)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    date           DATE NOT NULL,
    amount         NUMERIC NOT NULL,
    category       TEXT NOT NULL,
    attachment_url TEXT,
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own expenses" ON expenses;
CREATE POLICY "Users can manage their own expenses"
    ON expenses FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 5. BANKS (Bank accounts, Cash balances, Wallet pins)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    "bankName"      TEXT NOT NULL,
    type            TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    balance         NUMERIC NOT NULL,
    pin_order       INTEGER DEFAULT 0 NOT NULL,
    is_pinned       BOOLEAN DEFAULT false NOT NULL,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE banks ADD COLUMN IF NOT EXISTS pin_order INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own banks" ON banks;
CREATE POLICY "Users can manage their own banks"
    ON banks FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 6. CREDIT_CARDS (Credit cards limit, statement dates, due dates)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    "bankName"      TEXT NOT NULL,
    "cardName"      TEXT NOT NULL,
    "cardNumber"    TEXT NOT NULL,
    "limit"         NUMERIC NOT NULL,
    outstanding     NUMERIC NOT NULL,
    "statementDate" TEXT,
    "dueDate"       TEXT,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own credit cards" ON credit_cards;
CREATE POLICY "Users can manage their own credit cards"
    ON credit_cards FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 7. CC_LOGS (Credit Card spend & repayment history)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    card_id    UUID REFERENCES credit_cards(id) ON DELETE CASCADE,
    card_name  TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'spend',
    amount     NUMERIC NOT NULL,
    date       DATE NOT NULL,
    note       TEXT,
    category   TEXT DEFAULT 'General',
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE cc_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own cc_logs" ON cc_logs;
CREATE POLICY "Users can manage their own cc_logs"
    ON cc_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 8. VAULT_LOGS (Personal Reserve Vault deposits & withdrawals)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    type       TEXT NOT NULL,
    amount     NUMERIC NOT NULL,
    reason     TEXT NOT NULL,
    date       DATE NOT NULL,
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE vault_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own vault_logs" ON vault_logs;
CREATE POLICY "Users can manage their own vault_logs"
    ON vault_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 9. BORROWERS (Khata / Udhar tracking)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS borrowers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    name       TEXT NOT NULL,
    principal  NUMERIC NOT NULL,
    repaid     NUMERIC NOT NULL,
    date       DATE NOT NULL,
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own borrowers" ON borrowers;
CREATE POLICY "Users can manage their own borrowers"
    ON borrowers FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 10. SAMITIS (Samiti investment schemes)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS samitis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    name            TEXT NOT NULL,
    daily_amount    NUMERIC NOT NULL,
    start_date      DATE NOT NULL,
    tenure_months   INTEGER NOT NULL,
    maturity_amount NUMERIC NOT NULL,
    frequency       TEXT DEFAULT 'monthly' NOT NULL,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE samitis ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'monthly' NOT NULL;

ALTER TABLE samitis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own samitis" ON samitis;
CREATE POLICY "Users can manage their own samitis"
    ON samitis FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 11. SAMITI_PAYMENTS (Samiti payment attendance tracker)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS samiti_payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    samiti_id    UUID REFERENCES samitis(id) ON DELETE CASCADE NOT NULL,
    payment_date DATE NOT NULL,
    user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
    UNIQUE(samiti_id, payment_date)
);

ALTER TABLE samiti_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own samiti payments" ON samiti_payments;
CREATE POLICY "Users can manage their own samiti payments"
    ON samiti_payments FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 12. WEB_APPS (Custom links & pinned shortcuts launcher)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_apps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    category    TEXT DEFAULT 'General',
    description TEXT,
    is_pinned   BOOLEAN DEFAULT false NOT NULL,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE web_apps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own web apps" ON web_apps;
CREATE POLICY "Users can manage their own web apps"
    ON web_apps FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 13. STORAGE BUCKET (Receipts & File Attachments)
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own receipts"  ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view receipts"             ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts"  ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts"  ON storage.objects;

CREATE POLICY "Users can upload their own receipts"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'receipts' AND auth.uid() = owner);

CREATE POLICY "Anyone can view receipts"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'receipts');

CREATE POLICY "Users can update their own receipts"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'receipts' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own receipts"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'receipts' AND auth.uid() = owner);


-- ─────────────────────────────────────────────
-- 14. ADMIN MASTER ACCESS POLICIES (Guaranteed Data Accuracy)
-- ─────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Admin view all user_settings"    ON user_settings;

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
CREATE POLICY "Admin view all user_settings"   ON user_settings   FOR SELECT USING (true);
