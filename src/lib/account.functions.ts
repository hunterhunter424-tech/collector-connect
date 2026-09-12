import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "tawreedat.app";

const schema = z
  .object({
    fullName: z.string().trim().min(3, "الاسم قصير جدًا").max(80).optional(),
    username: z
      .string()
      .min(3, "اسم المستخدم قصير جدًا")
      .max(32)
      .regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم بحروف إنجليزية أو أرقام فقط")
      .optional(),
    password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").optional(),
  })
  .refine((v) => v.username || v.password || v.fullName, { message: "لا يوجد تغيير" });

/** Any signed-in user can change their own username and/or password. */
export const updateMyCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as never as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: { password?: string; email?: string } = {};
    let newUsername: string | null = null;

    if (data.username) {
      newUsername = data.username.trim().toLowerCase();
      const { data: taken } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", newUsername)
        .neq("id", userId)
        .maybeSingle();
      if (taken) throw new Error("اسم المستخدم مستخدم بالفعل");
      payload.email = `${newUsername}@${EMAIL_DOMAIN}`;
    }
    if (data.password) payload.password = data.password;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ...payload,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    const profileUpdate: { username?: string; full_name?: string } = {};
    if (newUsername) profileUpdate.username = newUsername;
    if (data.fullName) profileUpdate.full_name = data.fullName.trim();
    if (Object.keys(profileUpdate).length > 0) {
      const { error: pErr } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);
      if (pErr) throw new Error(pErr.message);
    }

    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_name: (p?.full_name as string) ?? "مدير النظام",
      action: "تعديل بيانات الحساب",
      details: [
        profileUpdate.full_name ? `تم تغيير الاسم إلى ${profileUpdate.full_name}` : null,
        newUsername ? `تم تغيير اسم المستخدم إلى ${newUsername}` : null,
        data.password ? "تم تغيير كلمة المرور" : null,
      ]
        .filter(Boolean)
        .join(" و "),
    });

    return { ok: true, username: newUsername };
  });

const cleanupReceiptsSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "اختر شهرًا صحيحًا"),
});

/** Permanently removes receipt files for reviewed deposits in one calendar month. */
export const deleteReviewedReceiptImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => cleanupReceiptsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as {
      userId: string;
      supabase: {
        from: (table: string) => any;
      };
    };

    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError || !adminRole) throw new Error("هذه العملية متاحة لمدير النظام فقط");

    const [year, month] = data.month.split("-").map(Number);
    if (!year || !month) throw new Error("اختر شهرًا صحيحًا");
    const from = `${data.month}-01T00:00:00.000Z`;
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: deposits, error: depositsError } = await supabaseAdmin
      .from("deposits")
      .select("id, receipt_image_url")
      .gte("created_at", from)
      .lt("created_at", nextMonth)
      .in("status", ["approved", "rejected"])
      .neq("receipt_image_url", "");
    if (depositsError) throw new Error("تعذر تحميل صور الإيصالات المطلوب حذفها");

    const eligible = (deposits ?? []).filter(
      (row): row is { id: string; receipt_image_url: string } => Boolean(row.receipt_image_url),
    );
    if (eligible.length === 0) return { deletedCount: 0 };

    for (let index = 0; index < eligible.length; index += 100) {
      const batch = eligible.slice(index, index + 100);
      const paths = batch.map((row) => row.receipt_image_url);
      const { error: storageError } = await supabaseAdmin.storage.from("receipts").remove(paths);
      if (storageError) throw new Error("تعذر حذف بعض صور الإيصالات، حاول مرة أخرى");

      const { error: updateError } = await supabaseAdmin
        .from("deposits")
        .update({ receipt_image_url: "" })
        .in(
          "id",
          batch.map((row) => row.id),
        );
      if (updateError) throw new Error("حُذفت الصور وتعذر تحديث سجلاتها");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_name: (profile?.full_name as string) ?? "مدير النظام",
      action: "حذف صور إيصالات مراجعة",
      details: `تم حذف ${eligible.length} صورة إيصال للتوريدات المراجعة عن شهر ${data.month}`,
    });

    return { deletedCount: eligible.length };
  });

async function assertAdminUser(supabase: { from: (t: string) => any }, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("هذه العملية متاحة لمدير النظام فقط");
}

const BACKUP_TABLES = [
  "branches",
  "areas",
  "profiles",
  "user_roles",
  "supervisor_permissions",
  "branch_targets",
  "deposits",
  "collection_cycles",
  "collection_entries",
  "other_revenue_items",
  "audit_logs",
] as const;

/** Full JSON snapshot of every application table (admin only). */
export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await assertAdminUser(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabaseAdmin.from(table).select("*");
      if (error) throw new Error(`تعذر تصدير جدول ${table}`);
      tables[table] = (data ?? []) as unknown[];
    }

    return { createdAt: new Date().toISOString(), json: JSON.stringify(tables) };
  });

const resetSchema = z.object({
  confirm: z.literal("مسح", { message: "اكتب كلمة التأكيد" }),
  includeAudit: z.boolean().default(true),
  includeBranches: z.boolean().default(false),
});

/** Deletes all operational data so the admin can start fresh (admin only). */
export const resetOperationalData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await assertAdminUser(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const wipe = async (table: string) => {
      const { error } = await supabaseAdmin
        .from(table as "deposits")
        .delete()
        .not("id", "is", null);
      if (error) throw new Error(`تعذر مسح جدول ${table}`);
    };

    const { data: files } = await supabaseAdmin.storage.from("receipts").list("", { limit: 1000 });
    const paths = (files ?? []).map((f: { name: string }) => f.name);
    if (paths.length) await supabaseAdmin.storage.from("receipts").remove(paths);

    await wipe("other_revenue_items");
    await wipe("collection_entries");
    await wipe("collection_cycles");
    await wipe("deposits");
    await wipe("branch_targets");
    if (data.includeBranches) {
      await wipe("areas");
      await wipe("branches");
    }
    if (data.includeAudit) await wipe("audit_logs");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_name: (profile?.full_name as string) ?? "مدير النظام",
      action: "تصفير بيانات النظام",
      details: data.includeBranches
        ? "تم مسح التوريدات والتحصيل والربط والفروع والمناطق"
        : "تم مسح التوريدات والتحصيل والربط",
    });

    return { ok: true };
  });

const restoreSchema = z.object({
  json: z.string().min(2, "الملف فارغ"),
});

type Row = Record<string, unknown>;

/** Restores a previously downloaded backup file (admin only). */
export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as { userId: string; supabase: any };
    await assertAdminUser(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.json);
    } catch {
      throw new Error("الملف غير صالح، اختر ملف النسخة الاحتياطية الذي نزّلته من النظام");
    }
    const container = parsed as { tables?: Record<string, Row[]> } & Record<string, Row[]>;
    const tables: Record<string, Row[]> = (container.tables ?? container) as Record<string, Row[]>;
    if (!tables || typeof tables !== "object" || !Array.isArray(tables['branches'] ?? tables['profiles'])) {
      throw new Error("الملف غير صالح، اختر ملف النسخة الاحتياطية الذي نزّلته من النظام");
    }

    const rows = (name: string) => (Array.isArray(tables[name]) ? (tables[name] as Row[]) : []);

    // Only restore accounts that still exist in the login system.
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const validUsers = new Set((authUsers?.users ?? []).map((u: { id: string }) => u.id));

    const wipe = async (table: string) => {
      const { error } = await supabaseAdmin
        .from(table as "deposits")
        .delete()
        .not("id", "is", null);
      if (error) throw new Error(`تعذر تفريغ جدول ${table}`);
    };
    const wipeByUser = async (table: string) => {
      const { error } = await supabaseAdmin
        .from(table as "profile_areas")
        .delete()
        .not("user_id", "is", null);
      if (error) throw new Error(`تعذر تفريغ جدول ${table}`);
    };

    await wipe("other_revenue_items");
    await wipe("collection_entries");
    await wipe("collection_cycles");
    await wipe("deposits");
    await wipe("branch_targets");
    await wipe("audit_logs");
    await wipeByUser("profile_areas");
    await wipeByUser("supervisor_permissions");
    await wipe("user_roles");
    await wipe("areas");
    await wipe("branches");

    const insert = async (table: string, list: Row[]) => {
      if (list.length === 0) return;
      for (let i = 0; i < list.length; i += 200) {
        const { error } = await supabaseAdmin
          .from(table as "deposits")
          .upsert(list.slice(i, i + 200) as never, { onConflict: table === "profiles" ? "id" : undefined } as never);
        if (error) throw new Error(`تعذر استعادة جدول ${table}: ${error.message}`);
      }
    };

    await insert("branches", rows("branches"));
    await insert("areas", rows("areas"));
    await insert(
      "profiles",
      rows("profiles").filter((r) => validUsers.has(r['id'] as string)),
    );
    await insert(
      "user_roles",
      rows("user_roles").filter((r) => validUsers.has(r['user_id'] as string)),
    );
    await insert(
      "supervisor_permissions",
      rows("supervisor_permissions").filter((r) => validUsers.has(r['user_id'] as string)),
    );
    await insert(
      "profile_areas",
      rows("profile_areas").filter((r) => validUsers.has(r['user_id'] as string)),
    );
    await insert("branch_targets", rows("branch_targets"));
    await insert(
      "deposits",
      rows("deposits").filter((r) => validUsers.has(r['collector_id'] as string)),
    );

    // Cycles must be open while their entries are inserted (validation triggers),
    // then their real status is restored.
    const cycles = rows("collection_cycles");
    await insert(
      "collection_cycles",
      cycles.map((c) => ({ ...c, status: "open" })),
    );
    await insert("collection_entries", rows("collection_entries"));
    await insert("other_revenue_items", rows("other_revenue_items"));
    for (const c of cycles) {
      if (c['status'] === "open") continue;
      await supabaseAdmin
        .from("collection_cycles")
        .update({
          status: c['status'] as string,
          closed_at: (c['closed_at'] as string) ?? null,
          closed_by: (c['closed_by'] as string) ?? null,
          final_billing_target_amount: c['final_billing_target_amount'] ?? null,
          final_invoice_collection: c['final_invoice_collection'] ?? null,
          final_other_revenue: c['final_other_revenue'] ?? null,
          final_grand_total: c['final_grand_total'] ?? null,
          final_collection_percentage: c['final_collection_percentage'] ?? null,
        } as never)
        .eq("id", c['id'] as string);
    }

    await insert(
      "audit_logs",
      rows("audit_logs").filter((r) => !r['actor_id'] || validUsers.has(r['actor_id'] as string)),
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_name: (profile?.full_name as string) ?? "مدير النظام",
      action: "استعادة نسخة احتياطية",
      details: `تمت استعادة بيانات النظام من ملف نسخة احتياطية (${rows("deposits").length} توريد، ${cycles.length} دورة تحصيل)`,
    });

    return {
      ok: true,
      counts: {
        deposits: rows("deposits").length,
        cycles: cycles.length,
        profiles: rows("profiles").length,
      },
    };
  });
