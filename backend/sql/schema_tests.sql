CREATE TABLE IF NOT EXISTS tests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title               TEXT        NOT NULL,
    source_document_ids UUID[]      NOT NULL DEFAULT '{}',
    mcq_count           INT         NOT NULL DEFAULT 0 CHECK (mcq_count BETWEEN 0 AND 20),
    frq_count           INT         NOT NULL DEFAULT 0 CHECK (frq_count BETWEEN 0 AND 10),
    purpose             TEXT        NOT NULL DEFAULT 'quick_review'
                                    CHECK (purpose IN ('quick_review', 'exam_prep', 'deep_application')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tests_course_id_idx ON tests (course_id);

CREATE TABLE IF NOT EXISTS questions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id             UUID        NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    position            INT         NOT NULL DEFAULT 0,
    question_type       TEXT        NOT NULL CHECK (question_type IN ('mcq', 'frq')),
    content             TEXT        NOT NULL,
    learning_objective  TEXT,
    source_chunk_ids    UUID[]      NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questions_test_id_idx ON questions (test_id);

CREATE TABLE IF NOT EXISTS mcq_options (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position    INT         NOT NULL DEFAULT 0,
    content     TEXT        NOT NULL,
    is_correct  BOOLEAN     NOT NULL DEFAULT false,
    explanation TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcq_options_question_id_idx ON mcq_options (question_id);

CREATE TABLE IF NOT EXISTS frq_answers (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id  UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    ideal_answer TEXT,
    rubric       JSONB       NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (question_id)
);

-- Future: user attempt tracking (schema only, not yet wired to application code)

CREATE TABLE IF NOT EXISTS test_attempts (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id    UUID        NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_attempts_test_id_idx ON test_attempts (test_id);

CREATE TABLE IF NOT EXISTS user_answers (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id         UUID          NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
    question_id        UUID          NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_id UUID          REFERENCES mcq_options(id) ON DELETE SET NULL,
    response_text      TEXT,
    score              NUMERIC(5, 2),
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_answers_attempt_id_idx ON user_answers (attempt_id);
CREATE INDEX IF NOT EXISTS user_answers_question_id_idx ON user_answers (question_id);
