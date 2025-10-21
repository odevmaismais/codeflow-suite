-- Remove the constraint that requires task_id OR project_id
-- This allows Pomodoro/Quick Timer sessions without a specific task
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_check1;