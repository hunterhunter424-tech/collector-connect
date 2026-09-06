import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("هذه العملية متاحة لمدير النظام فقط");
}

async function log(userId: string, action: string, details: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: userId,
    actor_name: (data?.full_name as string) ?? "مدير النظام",
    action,
    details,
  });
}

/** Deletes a single deposit with its receipt image so the collector can upload it again. */
export const deleteDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: findError } = await supabaseAdmin
      .from("deposits")
      .select("id, ref, receipt_image_url")
      .eq("id", data.id)
      .maybeSingle();
    if (findError) throw new Error("تعذر العثور على التوريد");
    if (!target) throw new Error("التوريد غير موجود");

    if (target.receipt_image_url) {
      await supabaseAdmin.storage.from("receipts").remove([target.receipt_image_url]);
    }
    const { error: delError } = await supabaseAdmin.from("deposits").delete().eq("id", data.id);
    if (delError) throw new Error("تعذر حذف التوريد");

    await log(userId, "حذف توريد", `تم حذف العملية رقم ${target.ref} وصورتها ليعيد المحصل رفعها`);
    return { ok: true };
  });

/** Deletes a closed collection cycle with all of its entries. */
export const deleteCollectionCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cycle } = await supabaseAdmin
      .from("collection_cycles")
      .select("id, month, year, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!cycle) throw new Error("دورة التحصيل غير موجودة");
    if (cycle.status !== "closed") throw new Error("يمكن حذف الدورات المنتهية فقط");

    const { error } = await supabaseAdmin.from("collection_cycles").delete().eq("id", data.id);
    if (error) throw new Error("تعذر حذف دورة التحصيل");

    await log(
      userId,
      "حذف دورة تحصيل",
      `تم حذف دورة ${cycle.month}/${cycle.year} وكل عمليات التحصيل التابعة لها`,
    );
    return { ok: true };
  });
