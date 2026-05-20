-- Run this block first to reset all test-related tables:
-- DROP TABLE IF EXISTS user_answers, test_attempts, frq_answers, mcq_answers, questions, question_sets, tests CASCADE;

CREATE TABLE IF NOT EXISTS tests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title               TEXT        NOT NULL,
    source_document_ids UUID[]      NOT NULL DEFAULT '{}',
    purpose             TEXT        NOT NULL DEFAULT 'quick_review'
                                    CHECK (purpose IN ('quick_review', 'exam_prep', 'deep_application')),
    all_objectives      TEXT[]      NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tests_course_id_idx ON tests (course_id);

CREATE TABLE IF NOT EXISTS question_sets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id     UUID        NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    set_number  INT         NOT NULL DEFAULT 1,
    mcq_count   INT         NOT NULL DEFAULT 0 CHECK (mcq_count BETWEEN 0 AND 20),
    frq_count   INT         NOT NULL DEFAULT 0 CHECK (frq_count BETWEEN 0 AND 10),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_sets_test_id_idx ON question_sets (test_id);

CREATE TABLE IF NOT EXISTS questions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_set_id     UUID        NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    question_type       TEXT        NOT NULL CHECK (question_type IN ('mcq', 'frq')),
    content             TEXT        NOT NULL,
    learning_objective  TEXT,
    source_chunk_ids    UUID[]      NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_question_set_id_idx ON questions (question_set_id);

CREATE TABLE IF NOT EXISTS mcq_answers (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    is_correct  BOOLEAN     NOT NULL DEFAULT false,
    explanation TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcq_answers_question_id_idx ON mcq_answers (question_id);

CREATE TABLE IF NOT EXISTS frq_answers (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id  UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    ideal_answer TEXT,
    rubric       JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (question_id)
);

CREATE TABLE IF NOT EXISTS test_attempts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_set_id UUID        NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    score           NUMERIC(5, 2),
    max_score       NUMERIC(5, 2),
    submitted_at    TIMESTAMPTZ,
    question_order  UUID[]      NOT NULL DEFAULT '{}',
    option_orders   JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_attempts_question_set_id_idx ON test_attempts (question_set_id);

CREATE TABLE IF NOT EXISTS user_answers (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id         UUID        NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
    question_id        UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_id UUID        REFERENCES mcq_answers(id) ON DELETE SET NULL,
    response_text      TEXT,
    score              NUMERIC(5, 2),
    feedback_text      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_answers_attempt_id_idx ON user_answers (attempt_id);
