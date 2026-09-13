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

const dateTime = (date: string, time: string) => new Date(`${date}T${time || "12:00"}:00`).toISOString();

/** Admin fix for a deposit that has wrong data (amount, invoices, date, notes, review state). */
export const updateDepositDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        collector_id: z.string().uuid().optional().nullable(),
        invoices_count: z.number().int().min(0),
        amount: z.number().min(0),
        notes: z.string().optional().nullable(),
        admin_notes: z.string().optional().nullable(),
        entry_date: z.string().min(8),
        entry_time: z.string().optional().default("12:00"),
        status: z.enum(["pending", "approved", "rejected"]),
      })

      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("deposits")
      .select("id, ref, collector_id, profiles!deposits_collector_profile_fkey(full_name)")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) throw new Error("التوريد غير موجود");

    const transfer = !!data.collector_id && data.collector_id !== target.collector_id;
    type NewCollector = { full_name: string; branch_id: string | null; area_id: string | null };
    let newCollector: NewCollector | null = null;
    if (transfer) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, branch_id, area_id")
        .eq("id", data.collector_id as string)
        .maybeSingle();
      if (!profile) throw new Error("المحصل الجديد غير موجود");
      newCollector = profile as unknown as NewCollector;
    }

    const { error } = await supabaseAdmin
      .from("deposits")
      .update({
        ...(transfer && newCollector
          ? {
              collector_id: data.collector_id as string,
              branch_id: newCollector.branch_id,
              area_id: newCollector.area_id,
            }
          : {}),
        invoices_count: data.invoices_count,
        amount: data.amount,
        notes: data.notes?.trim() || null,
        admin_notes: data.admin_notes?.trim() || null,
        status: data.status,
        created_at: dateTime(data.entry_date, data.entry_time ?? "12:00"),
        reviewed_at: data.status === "pending" ? null : new Date().toISOString(),
        reviewed_by: data.status === "pending" ? null : userId,
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذر حفظ تعديل التوريد");

    const oldName =
      ((target as never as { profiles?: { full_name: string } | null }).profiles?.full_name) ??
      "محصل سابق";
    if (transfer && newCollector) {
      await log(
        userId,
        "نقل توريد لمحصل آخر",
        `تم نقل العملية رقم ${target.ref} من ${oldName} إلى ${newCollector.full_name}`,
      );
    } else {
      await log(userId, "تعديل توريد", `تم تصحيح بيانات العملية رقم ${target.ref}`);
    }
    return { ok: true };

  });

/** Admin adds a deposit on behalf of a collector, with any past date. */
export const createManualDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        collector_id: z.string().uuid("اختر المحصل"),
        area_id: z.string().uuid().optional().nullable(),
        invoices_count: z.number().int().min(0),
        amount: z.number().min(0),
        notes: z.string().optional().nullable(),
        entry_date: z.string().min(8, "أدخل تاريخ التوريد"),
        entry_time: z.string().optional().default("12:00"),
        status: z.enum(["pending", "approved"]).default("approved"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, branch_id, area_id")
      .eq("id", data.collector_id)
      .maybeSingle();
    if (!profile) throw new Error("المحصل غير موجود");

    const { error } = await supabaseAdmin.from("deposits").insert({
      collector_id: data.collector_id,
      branch_id: profile.branch_id,
      area_id: data.area_id || profile.area_id,
      invoices_count: data.invoices_count,
      amount: data.amount,
      receipt_image_url: "",
      notes: data.notes?.trim() || "أضافها مدير النظام يدويًا",
      status: data.status,
      reviewed_at: data.status === "approved" ? new Date().toISOString() : null,
      reviewed_by: data.status === "approved" ? userId : null,
      created_at: dateTime(data.entry_date, data.entry_time ?? "12:00"),
    });
    if (error) throw new Error("تعذر إضافة التوريد");

    await log(
      userId,
      "إضافة توريد يدويًا",
      `تمت إضافة توريد للمحصل ${profile.full_name} بتاريخ ${data.entry_date}`,
    );
    return { ok: true };
  });
