-- =====================================================
-- IntelligenceOS
-- Phase 5.1
-- Semantic Registry
-- =====================================================

-- -----------------------------------------------------
-- Entity Registry
-- -----------------------------------------------------

create table if not exists public.entity_registry (

    id uuid primary key default gen_random_uuid(),

    entity_key text not null unique,

    display_name text not null,

    description text,

    status text not null default 'ACTIVE',

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Metric Registry
-- -----------------------------------------------------

create table if not exists public.metric_registry (

    id uuid primary key default gen_random_uuid(),

    metric_key text not null unique,

    display_name text not null,

    description text,

    unit text,

    data_type text,

    aggregation text,

    rankable boolean not null default false,

    benchmark_supported boolean not null default false,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Dimension Registry
-- -----------------------------------------------------

create table if not exists public.dimension_registry (

    id uuid primary key default gen_random_uuid(),

    dimension_key text not null unique,

    display_name text not null,

    description text,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Category Registry
-- -----------------------------------------------------

create table if not exists public.category_registry (

    id uuid primary key default gen_random_uuid(),

    category_key text not null unique,

    display_name text not null,

    description text,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Alias Registry
-- -----------------------------------------------------

create table if not exists public.alias_registry (

    id uuid primary key default gen_random_uuid(),

    alias text not null unique,

    canonical_key text not null,

    canonical_type text not null,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Benchmark Registry
-- -----------------------------------------------------

create table if not exists public.benchmark_registry (

    id uuid primary key default gen_random_uuid(),

    benchmark_key text not null unique,

    display_name text not null,

    description text,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Relationship Registry
-- -----------------------------------------------------

create table if not exists public.relationship_registry (

    id uuid primary key default gen_random_uuid(),

    source_key text not null,

    target_key text not null,

    relationship_type text not null,

    created_at timestamptz not null default now()

);