-- Sample data for local development.
-- Run this in the Neon SQL editor after schema.sql.
-- Safe to re-run — deletes and re-inserts so you get a clean slate.

-- Use fixed UUIDs so the IDs are predictable during development.

DELETE FROM courses WHERE id IN (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003'
);

-- ─── courses ────────────────────────────────────────────────────────────────
INSERT INTO courses (id, title) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'Modernist Architecture'),
    ('a1000000-0000-0000-0000-000000000002', 'Molecular Biology 101'),
    ('a1000000-0000-0000-0000-000000000003', 'Macroeconomic Theory');

-- ─── sections ───────────────────────────────────────────────────────────────
INSERT INTO sections (id, course_id, title, position) VALUES
    -- Modernist Architecture
    ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Section 1: The Bauhaus', 0),
    ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Section 2: Form Follows Function', 1),
    -- Molecular Biology
    ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Section 1: Cell Structure', 0),
    ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'Section 2: DNA Replication', 1),
    -- Macroeconomics
    ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', 'Section 1: Fiscal Policy', 0),
    ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'Section 2: Monetary Policy', 1);

-- ─── documents ──────────────────────────────────────────────────────────────
INSERT INTO documents (id, section_id, title) VALUES
    -- Bauhaus
    ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Gropius Manifesto.pdf'),
    ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Primary Geometries.pdf'),
    -- Form Follows Function
    ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'Sullivan Philosophy.pdf'),
    ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'Chicago School Roots.pdf'),
    -- Cell Structure
    ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000003', 'Organelle Overview.pdf'),
    -- DNA Replication
    ('c1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000004', 'Replication Fork.pdf'),
    ('c1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000004', 'Polymerase Enzymes.pdf'),
    -- Fiscal Policy
    ('c1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000005', 'Government Spending.pdf'),
    -- Monetary Policy
    ('c1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000006', 'Interest Rate Mechanics.pdf'),
    ('c1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000006', 'Central Bank Tools.pdf');
