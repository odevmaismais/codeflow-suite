-- Create storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'text/plain', 'text/markdown', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for task attachments
CREATE POLICY "Users can view attachments for tasks they can see"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'task-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text
    FROM tasks t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  )
);

CREATE POLICY "Users can upload attachments to tasks they can see"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'task-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text
    FROM tasks t
    WHERE t.organization_id IN (
      SELECT organization_id FROM get_user_organizations(auth.uid())
    )
  )
);

CREATE POLICY "Users can delete their own attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'task-attachments'
  AND owner = auth.uid()
);