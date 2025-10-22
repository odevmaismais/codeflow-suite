export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          is_active: boolean
          max_uses: number | null
          organization_id: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          organization_id: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          organization_id?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string | null
          currency: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          status: string
          stripe_invoice_id: string
        }
        Insert: {
          amount_due: number
          amount_paid: number
          created_at?: string | null
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_invoice_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string | null
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          default_work_hours_per_week: number
          deleted_at: string | null
          id: string
          name: string
          slug: string
          timesheet_approval_enabled: boolean
          timesheet_approver_role: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_work_hours_per_week?: number
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          timesheet_approval_enabled?: boolean
          timesheet_approver_role?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_work_hours_per_week?: number
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          timesheet_approval_enabled?: boolean
          timesheet_approver_role?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      pomodoro_sessions: {
        Row: {
          break_count: number | null
          completed_at: string | null
          created_at: string | null
          focus_count: number | null
          id: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          break_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          focus_count?: number | null
          id?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          break_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          focus_count?: number | null
          id?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pomodoro_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_teams: {
        Row: {
          assigned_at: string
          id: string
          project_id: string
          team_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          project_id: string
          team_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          project_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_teams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          is_billable: boolean
          name: string
          organization_id: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_billable?: boolean
          name: string
          organization_id: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_billable?: boolean
          name?: string
          organization_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string | null
          deleted_at: string | null
          id: string
          mentioned_users: string[] | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          mentioned_users?: string[] | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          mentioned_users?: string[] | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          code: string
          completed_at: string | null
          created_at: string | null
          created_by: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          organization_id: string
          parent_task_id: string | null
          priority: string
          project_id: string | null
          status: string
          task_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          code: string
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          organization_id: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          organization_id?: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          team_id: string
          team_role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          team_id: string
          team_role: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          team_id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          duration_seconds: number | null
          end_time: string | null
          id: string
          is_approved: boolean | null
          is_billable: boolean | null
          organization_id: string
          project_id: string | null
          start_time: string
          task_id: string | null
          timer_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          is_approved?: boolean | null
          is_billable?: boolean | null
          organization_id: string
          project_id?: string | null
          start_time: string
          task_id?: string | null
          timer_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          is_approved?: boolean | null
          is_billable?: boolean | null
          organization_id?: string
          project_id?: string | null
          start_time?: string
          task_id?: string | null
          timer_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_entries: {
        Row: {
          created_at: string | null
          id: string
          time_entry_id: string
          timesheet_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          time_entry_id: string
          timesheet_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          time_entry_id?: string
          timesheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_entries_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          billable_hours: number | null
          created_at: string | null
          deleted_at: string | null
          id: string
          organization_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          total_hours: number | null
          updated_at: string | null
          user_id: string
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          billable_hours?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          organization_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          total_hours?: number | null
          updated_at?: string | null
          user_id: string
          week_end_date: string
          week_start_date: string
        }
        Update: {
          billable_hours?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          organization_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          id: string
          joined_at: string
          last_active_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_active_at?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_active_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_watchers: {
        Args: { p_task_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      calculate_duration_seconds: {
        Args: { p_end_time: string; p_start_time: string }
        Returns: number
      }
      calculate_timesheet_hours: {
        Args: { p_timesheet_id: string }
        Returns: {
          billable_hours: number
          total_hours: number
        }[]
      }
      check_project_limit: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      check_subscription_limit: {
        Args: { p_org_id: string; p_resource_type: string }
        Returns: boolean
      }
      check_subtasks_complete: {
        Args: { p_task_id: string }
        Returns: boolean
      }
      check_task_limit: {
        Args: { p_org_id: string; p_project_id: string }
        Returns: boolean
      }
      check_team_limit: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      check_time_entry_limit: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      check_time_entry_overlap: {
        Args: {
          p_end_time: string
          p_entry_id?: string
          p_start_time: string
          p_user_id: string
        }
        Returns: boolean
      }
      create_organization_atomic: {
        Args: { p_org_name: string; p_timezone: string; p_user_id: string }
        Returns: Json
      }
      create_organization_with_admin: {
        Args: { p_org_name: string; p_timezone: string; p_user_id: string }
        Returns: string
      }
      end_trial: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      extract_mentions: {
        Args: { p_content: string }
        Returns: string[]
      }
      format_duration: {
        Args: { p_seconds: number }
        Returns: string
      }
      generate_invite_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_project_code: {
        Args: { p_org_id: string }
        Returns: string
      }
      generate_task_code: {
        Args: {
          p_org_id: string
          p_parent_task_id: string
          p_project_id: string
        }
        Returns: string
      }
      generate_unique_slug: {
        Args: { org_name: string }
        Returns: string
      }
      get_org_members_with_emails: {
        Args: { p_org_id: string }
        Returns: {
          email: string
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      get_orphaned_time_entries: {
        Args: { p_user_id: string; p_week_start: string }
        Returns: {
          description: string
          duration_seconds: number
          end_time: string
          id: string
          is_billable: boolean
          project_id: string
          start_time: string
          task_id: string
        }[]
      }
      get_subscription_usage: {
        Args: { p_org_id: string }
        Returns: {
          project_count: number
          task_count: number
          team_count: number
          time_entry_count_month: number
        }[]
      }
      get_tasks_with_details: {
        Args: { p_org_id: string }
        Returns: {
          actual_hours: number
          assigned_to: string
          assignee_email: string
          assignee_name: string
          attachment_count: number
          code: string
          comment_count: number
          completed_at: string
          completed_subtask_count: number
          created_at: string
          created_by: string
          creator_email: string
          creator_name: string
          deleted_at: string
          description: string
          due_date: string
          estimated_hours: number
          id: string
          organization_id: string
          parent_task_id: string
          priority: string
          project_id: string
          project_name: string
          status: string
          subtask_count: number
          task_type: string
          title: string
          updated_at: string
        }[]
      }
      get_team_members_with_emails: {
        Args: { p_team_id: string }
        Returns: {
          email: string
          id: string
          joined_at: string
          team_role: string
          user_id: string
        }[]
      }
      get_user_email: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_user_organizations: {
        Args: { p_user_id: string }
        Returns: {
          organization_id: string
          role: string
        }[]
      }
      is_team_tech_lead: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      join_organization_via_invite: {
        Args: { p_invite_code: string; p_user_id: string }
        Returns: string
      }
      start_trial: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      update_task_actual_hours: {
        Args: { p_task_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
