-- Delete ALL data from database (complete reset)
-- Delete in correct order to respect foreign keys

DELETE FROM public.audit_logs;
DELETE FROM public.task_watchers;
DELETE FROM public.task_attachments;
DELETE FROM public.task_comments;
DELETE FROM public.tasks;
DELETE FROM public.timesheet_entries;
DELETE FROM public.timesheets;
DELETE FROM public.time_entries;
DELETE FROM public.pomodoro_sessions;
DELETE FROM public.project_teams;
DELETE FROM public.projects;
DELETE FROM public.team_members;
DELETE FROM public.teams;
DELETE FROM public.invoices;
DELETE FROM public.invite_codes;
DELETE FROM public.subscriptions;
DELETE FROM public.user_organizations;
DELETE FROM public.organizations;

-- Note: auth.users cannot be deleted via SQL migration
-- Users must be deleted via Supabase Auth API or Dashboard