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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          active: boolean
          branch_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          branch_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: string | null
          id?: string
        }
        Relationships: []
      }
      branch_targets: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          month: string
          notes: string | null
          target_amount: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          target_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      collection_cycles: {
        Row: {
          area_id: string | null
          billing_invoices_count: number | null
          billing_target_amount: number
          branch_id: string
          closed_at: string | null
          closed_by: string | null
          collector_id: string | null
          created_at: string
          created_by: string | null
          final_billing_target_amount: number | null
          final_collection_percentage: number | null
          final_grand_total: number | null
          final_invoice_collection: number | null
          final_other_revenue: number | null
          id: string
          month: number
          notes: string | null
          status: string
          target_received_date: string
          updated_at: string
          year: number
        }
        Insert: {
          area_id?: string | null
          billing_invoices_count?: number | null
          billing_target_amount?: number
          branch_id: string
          closed_at?: string | null
          closed_by?: string | null
          collector_id?: string | null
          created_at?: string
          created_by?: string | null
          final_billing_target_amount?: number | null
          final_collection_percentage?: number | null
          final_grand_total?: number | null
          final_invoice_collection?: number | null
          final_other_revenue?: number | null
          id?: string
          month: number
          notes?: string | null
          status?: string
          target_received_date: string
          updated_at?: string
          year: number
        }
        Update: {
          area_id?: string | null
          billing_invoices_count?: number | null
          billing_target_amount?: number
          branch_id?: string
          closed_at?: string | null
          closed_by?: string | null
          collector_id?: string | null
          created_at?: string
          created_by?: string | null
          final_billing_target_amount?: number | null
          final_collection_percentage?: number | null
          final_grand_total?: number | null
          final_invoice_collection?: number | null
          final_other_revenue?: number | null
          id?: string
          month?: number
          notes?: string | null
          status?: string
          target_received_date?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_cycles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_entries: {
        Row: {
          collector_id: string | null
          created_at: string
          created_by: string | null
          cycle_id: string
          entry_date: string
          id: string
          invoices_collection_amount: number
          notes: string | null
          other_revenue_amount: number
          screenshot_url: string | null
          updated_at: string
        }
        Insert: {
          collector_id?: string | null
          created_at?: string
          created_by?: string | null
          cycle_id: string
          entry_date?: string
          id?: string
          invoices_collection_amount?: number
          notes?: string | null
          other_revenue_amount?: number
          screenshot_url?: string | null
          updated_at?: string
        }
        Update: {
          collector_id?: string | null
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          entry_date?: string
          id?: string
          invoices_collection_amount?: number
          notes?: string | null
          other_revenue_amount?: number
          screenshot_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_entries_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_entries_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "collection_cycle_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_entries_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "collection_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          admin_notes: string | null
          amount: number
          area_id: string | null
          branch_id: string | null
          collector_id: string
          created_at: string
          id: string
          invoices_count: number
          notes: string | null
          receipt_image_url: string
          ref: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          area_id?: string | null
          branch_id?: string | null
          collector_id: string
          created_at?: string
          id?: string
          invoices_count: number
          notes?: string | null
          receipt_image_url: string
          ref?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          area_id?: string | null
          branch_id?: string | null
          collector_id?: string
          created_at?: string
          id?: string
          invoices_count?: number
          notes?: string | null
          receipt_image_url?: string
          ref?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_collector_profile_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      other_revenue_items: {
        Row: {
          amount: number
          category: string
          collection_entry_id: string
          created_at: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          collection_entry_id: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          collection_entry_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_revenue_items_collection_entry_id_fkey"
            columns: ["collection_entry_id"]
            isOneToOne: false
            referencedRelation: "collection_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_areas: {
        Row: {
          area_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_areas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          area_id: string | null
          branch_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          active?: boolean
          area_id?: string | null
          branch_id?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          active?: boolean
          area_id?: string | null
          branch_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_permissions: {
        Row: {
          can_manage_collections: boolean
          can_manage_collectors: boolean
          can_review_deposits: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_manage_collections?: boolean
          can_manage_collectors?: boolean
          can_review_deposits?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_manage_collections?: boolean
          can_manage_collectors?: boolean
          can_review_deposits?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      collection_cycle_summaries: {
        Row: {
          area_id: string | null
          area_name: string | null
          billing_invoices_count: number | null
          billing_target_amount: number | null
          branch_id: string | null
          branch_name: string | null
          closed_at: string | null
          closed_by: string | null
          collection_percentage: number | null
          collector_id: string | null
          collector_name: string | null
          created_at: string | null
          created_by: string | null
          final_billing_target_amount: number | null
          final_collection_percentage: number | null
          final_grand_total: number | null
          final_invoice_collection: number | null
          final_other_revenue: number | null
          grand_total: number | null
          id: string | null
          month: number | null
          notes: string | null
          status: string | null
          target_received_date: string | null
          total_invoice_collection: number | null
          total_other_revenue: number | null
          updated_at: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_cycles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      close_collection_cycle: {
        Args: { _cycle_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_supervisor: { Args: never; Returns: boolean }
      reopen_collection_cycle: {
        Args: { _cycle_id: string }
        Returns: undefined
      }
      supervisor_can: { Args: { _perm: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "collector" | "supervisor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "collector", "supervisor"],
    },
  },
} as const
