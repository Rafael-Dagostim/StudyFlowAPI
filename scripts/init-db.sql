-- Initialize the database
CREATE DATABASE study_flow_db;

-- Create user if not exists
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'study_flow_user') THEN

      CREATE ROLE study_flow_user LOGIN PASSWORD 'study_flow_password';
   END IF;
END
$do$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE study_flow_db TO study_flow_user;

-- Connect to the database
\c study_flow_db;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO study_flow_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO study_flow_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO study_flow_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO study_flow_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO study_flow_user;
