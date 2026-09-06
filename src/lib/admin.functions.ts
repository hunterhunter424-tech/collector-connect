import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "tawreedat.app";
const emailFor = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

const usernameSchema = z
  .string()
  .min(3, "اسم المستخدم قصير جدًا")
  .max(32)
  .regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم يجب أن يكون بحروف إنجليزية أو أرقام");

const createSchema = z.object({
  full_name: z.string().min(3, "الاسم مطلوب"),
  username: usernameSchema,
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
  role: z.enum(["collector", "supervisor"]).default("collector"),
  branch_id: z.string().uuid("اختر الفرع").optional().nullable(),
  area_id: z.string().uuid("اختر المنطقة").optional().nullable(),
  area_ids: z.array(z.string().uuid()).default([]),
  phone: z.string().optional().nullable(),
  active: z.boolean().default(true),
  can_manage_collectors: z.boolean().default(false),
  can_review_deposits: z.boolean().default(false),
  can_manage_collections: z.boolean().default(false),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("غير مصرح لك بهذه العملية");
}

/** Admins can do everything; supervisors only when granted the permission. */
async function assertCanManageCollectors(context: { supabase: any; userId: string }) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  if (list.includes("admin")) return "admin" as const;
  if (!list.includes("supervisor")) throw new Error("غير مصرح لك بهذه العملية");
  const { data: perm } = await context.supabase
    .from("supervisor_permissions")
    .select("can_manage_collectors")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!perm?.can_manage_collectors) throw new Error("غير مصرح لك بإضافة المحصلين");
  return "supervisor" as const;
}

async function logAction(actorId: string, actorName: string, action: string, details: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("audit_logs")
    .insert({ actor_id: actorId, actor_name: actorName, action, details });
}

async function actorName(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", context.userId)
    .maybeSingle();
  return (data?.full_name as string) ?? "مدير النظام";
}

export const createCollector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const actorRole = await assertCanManageCollectors(context as never);
    if (data.role === "supervisor" && actorRole !== "admin") {
      throw new Error("إنشاء حساب مشرف متاح لمدير النظام فقط");
    }
    if (data.role === "collector" && (!data.branch_id || !data.area_id)) {
      throw new Error("اختر الفرع والمنطقة للمحصل");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (existing) throw new Error("اسم المستخدم مستخدم بالفعل");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: emailFor(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "تعذر إنشاء الحساب");
    }
    const newUserId = created.data.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      full_name: data.full_name,
      username: data.username.toLowerCase(),
      branch_id: data.branch_id ?? null,
      area_id: data.area_id ?? null,
      phone: data.phone || null,
      active: data.active,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(profileError.message);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: data.role });

    const allAreas = Array.from(
      new Set([...(data.area_id ? [data.area_id] : []), ...data.area_ids]),
    );
    if (allAreas.length > 0) {
      await supabaseAdmin
        .from("profile_areas")
        .insert(allAreas.map((area_id) => ({ user_id: newUserId, area_id })));
    }

    if (data.role === "supervisor") {
      await supabaseAdmin.from("supervisor_permissions").insert({
        user_id: newUserId,
        can_manage_collectors: data.can_manage_collectors,
        can_review_deposits: data.can_review_deposits,
        can_manage_collections: data.can_manage_collections,
      });
    }

    await logAction(
      (context as never as { userId: string }).userId,
      await actorName(context as never),
      data.role === "supervisor" ? "إنشاء مشرف" : "إنشاء محصل",
      `تم إنشاء حساب ${data.role === "supervisor" ? "المشرف" : "المحصل"} ${data.full_name} (${data.username})`,
    );

    return { id: newUserId };
  });

export const setCollectorPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ user_id: z.string().uuid(), password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل") })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", data.user_id)
      .maybeSingle();
    await logAction(
      (context as never as { userId: string }).userId,
      await actorName(context as never),
      "تغيير كلمة المرور",
      `تم تغيير كلمة مرور المحصل ${p?.full_name ?? data.user_id}`,
    );
    return { ok: true };
  });

export const logAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ action: z.string().min(2), details: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as never as { userId: string };
    await logAction(ctx.userId, await actorName(context as never), data.action, data.details);
    return { ok: true };
  });

export const deleteCollector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const ctx = context as never as { userId: string };
    if (ctx.userId === data.user_id) throw new Error("لا يمكن حذف حسابك الحالي");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("full_name, username")
      .eq("id", data.user_id)
      .maybeSingle();

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if (((roles ?? []) as { role: string }[]).some((r) => r.role === "admin")) {
      throw new Error("لا يمكن حذف حساب مدير النظام");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);

    await logAction(
      ctx.userId,
      await actorName(context as never),
      "حذف حساب",
      `تم حذف الحساب ${p?.full_name ?? data.user_id}${p?.username ? ` (${p.username})` : ""} وكل بياناته`,
    );
    return { ok: true };
  });
