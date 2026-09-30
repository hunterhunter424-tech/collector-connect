import { supabase } from "@/integrations/supabase/client";

export type DepositCycle = {
  id: string;
  started_at: string;
  closed_at: string | null;
};

/** Latest cycle (open one if any, otherwise the last closed). */
export async function fetchCurrentDepositCycle(): Promise<DepositCycle | null> {
  const { data, error } = await supabase
    .from("deposit_cycles")
    .select("id, started_at, closed_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DepositCycle | null) ?? null;
}

export async function closeDepositCycle(id: string, userId: string) {
  const { error } = await supabase
    .from("deposit_cycles")
    .update({ closed_at: new Date().toISOString(), closed_by: userId })
    .eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert({ actor_id: userId, action: "إغلاق دورة التوريد", details: id });
}

export async function openDepositCycle(userId: string) {
  const { error } = await supabase
    .from("deposit_cycles")
    .insert({ started_at: new Date().toISOString(), started_by: userId });
  if (error) throw error;
  await supabase.from("audit_logs").insert({ actor_id: userId, action: "فتح دورة توريد جديدة" });
}
