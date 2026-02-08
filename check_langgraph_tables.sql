-- Run this query in your PostgreSQL database to check if LangGraph tables exist
-- Connect to your database and run:
-- psql $DATABASE_URL -f check_langgraph_tables.sql

\dt checkpoints*
\dt checkpoint_*

-- If tables exist, you should see:
-- checkpoints
-- checkpoint_writes
-- checkpoint_blobs (if using large states)
