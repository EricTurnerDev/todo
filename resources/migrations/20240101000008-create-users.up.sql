CREATE TABLE users (
    id            SERIAL                   PRIMARY KEY,
    email         VARCHAR(255)             NOT NULL UNIQUE,
    password_hash TEXT                     NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
