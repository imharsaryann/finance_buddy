-- SQL Schema setup for Finance Buddy application
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)

-- 1. Create PROFILES table (Personal user metadata, cash balance, vault target)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cash NUMERIC DEFAULT 5000 NOT NULL,
    full_name TEXT,
    email TEXT,
    vault_target NUMERIC DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if profiles table was already created
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vault_target NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can manage their own profile" 
    ON profiles FOR ALL 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Trigger to automatically create or update a profile on signup/login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, cash, full_name, email, vault_target)
    VALUES (
        new.id, 
        5000,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.email,
        0
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Create INCOMES table
CREATE TABLE IF NOT EXISTS incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    attachment_url TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own incomes" ON incomes;
CREATE POLICY "Users can manage their own incomes" 
    ON incomes FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. Create EXPENSES table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    attachment_url TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS attachment_url TEXT;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own expenses" ON expenses;
CREATE POLICY "Users can manage their own expenses" 
    ON expenses FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. Create BANKS table
CREATE TABLE IF NOT EXISTS banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "bankName" TEXT NOT NULL,
    type TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    balance NUMERIC NOT NULL,
    pin_order INTEGER DEFAULT 0 NOT NULL,
    is_pinned BOOLEAN DEFAULT false NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);
ALTER TABLE banks ADD COLUMN IF NOT EXISTS pin_order INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own banks" ON banks;
CREATE POLICY "Users can manage their own banks" 
    ON banks FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Create CREDIT CARDS table
CREATE TABLE IF NOT EXISTS credit_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "bankName" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "limit" NUMERIC NOT NULL,
    outstanding NUMERIC NOT NULL,
    "statementDate" TEXT,
    "dueDate" TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own credit cards" ON credit_cards;
CREATE POLICY "Users can manage their own credit cards" 
    ON credit_cards FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. Create CC_LOGS table (Credit Card spend & repayment logs)
CREATE TABLE IF NOT EXISTS cc_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    card_id UUID REFERENCES credit_cards(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'spend',
    amount NUMERIC NOT NULL,
    date DATE NOT NULL,
    note TEXT,
    category TEXT DEFAULT 'General',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE cc_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own cc_logs" ON cc_logs;
CREATE POLICY "Users can manage their own cc_logs" 
    ON cc_logs FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 7. Create VAULT_LOGS table (Personal Reserve Vault logs)
CREATE TABLE IF NOT EXISTS vault_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    date DATE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE vault_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own vault_logs" ON vault_logs;
CREATE POLICY "Users can manage their own vault_logs" 
    ON vault_logs FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 8. Create BORROWERS table (Khata / Udhar Management)
CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    principal NUMERIC NOT NULL,
    repaid NUMERIC NOT NULL,
    date DATE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own borrowers" ON borrowers;
CREATE POLICY "Users can manage their own borrowers" 
    ON borrowers FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 9. Create SAMITIS table
CREATE TABLE IF NOT EXISTS samitis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    daily_amount NUMERIC NOT NULL,
    start_date DATE NOT NULL,
    tenure_months INTEGER NOT NULL,
    maturity_amount NUMERIC NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE samitis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own samitis" ON samitis;
CREATE POLICY "Users can manage their own samitis" 
    ON samitis FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 10. Create SAMITI_PAYMENTS table
CREATE TABLE IF NOT EXISTS samiti_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    samiti_id UUID REFERENCES samitis(id) ON DELETE CASCADE NOT NULL,
    payment_date DATE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
    UNIQUE(samiti_id, payment_date)
);

ALTER TABLE samiti_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own samiti payments" ON samiti_payments;
CREATE POLICY "Users can manage their own samiti payments" 
    ON samiti_payments FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 11. Storage Bucket & Policies for Receipts/Attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;

CREATE POLICY "Users can upload their own receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'receipts' AND auth.uid() = owner );

CREATE POLICY "Anyone can view receipts"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'receipts' );

CREATE POLICY "Users can update their own receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'receipts' AND auth.uid() = owner );

CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'receipts' AND auth.uid() = owner );

-- 12. Create WEB_APPS table (Apps & Quick Links Launcher)
CREATE TABLE IF NOT EXISTS web_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    description TEXT,
    is_pinned BOOLEAN DEFAULT false NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL
);

ALTER TABLE web_apps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own web apps" ON web_apps;
CREATE POLICY "Users can manage their own web apps" 
    ON web_apps FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 13. ADMIN MASTER ACCESS POLICIES (For harsharyan@outlook.com, admin@gmail.com, or any admin@ email)
DROP POLICY IF EXISTS "Admin view all profiles" ON profiles;
CREATE POLICY "Admin view all profiles" ON profiles FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = id
);

DROP POLICY IF EXISTS "Admin view all incomes" ON incomes;
CREATE POLICY "Admin view all incomes" ON incomes FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all expenses" ON expenses;
CREATE POLICY "Admin view all expenses" ON expenses FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all banks" ON banks;
CREATE POLICY "Admin view all banks" ON banks FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all credit_cards" ON credit_cards;
CREATE POLICY "Admin view all credit_cards" ON credit_cards FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all cc_logs" ON cc_logs;
CREATE POLICY "Admin view all cc_logs" ON cc_logs FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all vault_logs" ON vault_logs;
CREATE POLICY "Admin view all vault_logs" ON vault_logs FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all borrowers" ON borrowers;
CREATE POLICY "Admin view all borrowers" ON borrowers FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all samitis" ON samitis;
CREATE POLICY "Admin view all samitis" ON samitis FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all samiti_payments" ON samiti_payments;
CREATE POLICY "Admin view all samiti_payments" ON samiti_payments FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admin view all web_apps" ON web_apps;
CREATE POLICY "Admin view all web_apps" ON web_apps FOR SELECT USING (
    (auth.jwt() ->> 'email') LIKE 'admin@%' OR 
    (auth.jwt() ->> 'email') = 'harsharyan@outlook.com' OR 
    auth.uid() = user_id
);





