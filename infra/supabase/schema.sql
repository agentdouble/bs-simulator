-- Minimal schema for Supabase storage. Not applied automatically.

create table if not exists companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    cash numeric not null default 0,
    revenue numeric not null default 0,
    costs numeric not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists agents (
    id uuid primary key,
    company_id uuid references companies(id) on delete cascade,
    name text not null,
    role text not null,
    skills jsonb not null,
    strengths text[] not null,
    weaknesses text[] not null,
    productivity numeric not null,
    salary integer not null,
    autonomy text not null,
    traits text[] not null,
    motivation numeric not null,
    stability numeric not null,
    created_at timestamptz not null default now()
);

create table if not exists game_states (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null,
    company_id uuid references companies(id) on delete cascade,
    day integer not null,
    report jsonb,
    created_at timestamptz not null default now()
);

create table if not exists manager_actions (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null,
    day integer not null,
    agent_id uuid,
    action text not null,
    focus text,
    created_at timestamptz not null default now()
);
