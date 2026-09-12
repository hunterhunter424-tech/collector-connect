import { supabase } from "@/integrations/supabase/client";

export type DepositRow = {
  id: string;
  ref: number;
  collector_id: string;
  branch_id: string | null;
  area_id: string | null;
  invoices_count: number;
  amount: number;
  receipt_image_url: string;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  collector_name: string;
  collector_username: string;
  branch_name: string | null;
  area_name: string | null;
};

const SELECT =
  "id, ref, collector_id, branch_id, area_id, invoices_count, amount, receipt_image_url, notes, status, admin_notes, created_at, reviewed_at, reviewed_by, profiles!deposits_collector_profile_fkey(full_name, username), branches(name), areas(name)";

export type DepositFilters = {
  collectorId?: string | undefined;
  branchId?: string | undefined;
  areaId?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
};

function mapRow(row: Record<string, unknown>): DepositRow {
  const profile = row['profiles'] as { full_name: string; username: string } | null;
  const branch = row['branches'] as { name: string } | null;
  const area = row['areas'] as { name: string } | null;
  return {
    id: row['id'] as string,
    ref: Number(row['ref']),
    collector_id: row['collector_id'] as string,
    branch_id: (row['branch_id'] as string | null) ?? null,
    area_id: (row['area_id'] as string | null) ?? null,
    invoices_count: Number(row['invoices_count']),
    amount: Number(row['amount']),
    receipt_image_url: row['receipt_image_url'] as string,
    notes: (row['notes'] as string | null) ?? null,
    status: row['status'] as string,
    admin_notes: (row['admin_notes'] as string | null) ?? null,
    created_at: row['created_at'] as string,
    reviewed_at: (row['reviewed_at'] as string | null) ?? null,
    reviewed_by: (row['reviewed_by'] as string | null) ?? null,
    reviewer_name: null,
    collector_name: profile?.full_name ?? "-",
    collector_username: profile?.username ?? "-",
    branch_name: branch?.name ?? null,
    area_name: area?.name ?? null,
  };
}

async function attachReviewerNames(rows: DepositRow[]): Promise<DepositRow[]> {
  const ids = [...new Set(rows.map((r) => r.reviewed_by).filter((v): v is string => !!v))];
  if (ids.length === 0) return rows;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
  return rows.map((r) => ({
    ...r,
    reviewer_name: r.reviewed_by ? (names.get(r.reviewed_by) ?? "مدير النظام") : null,
  }));
}


export async function fetchDeposits(filters: DepositFilters = {}): Promise<DepositRow[]> {
  let query = supabase.from("deposits").select(SELECT).order("created_at", { ascending: false });

  if (filters.collectorId) query = query.eq("collector_id", filters.collectorId);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.areaId) query = query.eq("area_id", filters.areaId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lt("created_at", filters.to);
  query = query.limit(filters.limit ?? 500);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) =>
      [r.collector_name, r.collector_username, r.branch_name, r.area_name, String(r.ref)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }
  return attachReviewerNames(rows);
}

export function summarize(rows: DepositRow[]) {
  const total = rows.length;
  const invoices = rows.reduce((s, r) => s + r.invoices_count, 0);
  const amount = rows.reduce((s, r) => s + r.amount, 0);
  const approved = rows.filter((r) => r.status === "approved").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  return {
    total,
    invoices,
    amount,
    approved,
    pending,
    rejected,
    average: total ? amount / total : 0,
  };
}
