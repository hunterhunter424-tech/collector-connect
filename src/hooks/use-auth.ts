import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const EMAIL_DOMAIN = "tawreedat.app";

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

export type AppRole = "admin" | "supervisor" | "collector";

export type StaffPermissions = {
  collectors: boolean;
  deposits: boolean;
  collections: boolean;
};

export type AuthState = {
  userId: string;
  role: AppRole;
  isStaff: boolean;
  permissions: StaffPermissions;
  profile: {
    id: string;
    full_name: string;
    username: string;
    phone: string | null;
    active: boolean;
    branch_id: string | null;
    area_id: string | null;
    branch_name: string | null;
    area_name: string | null;
    areas: { id: string; name: string }[];
  } | null;
};

export async function fetchAuthState(): Promise<AuthState | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const [profileRes, rolesRes, areasRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, username, phone, active, branch_id, area_id, branches(name), areas!profiles_area_id_fkey(name)")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profile_areas").select("area_id, areas!profile_areas_area_id_fkey(name)").eq("user_id", user.id),
  ]);


  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const role: AppRole = roles.includes("admin")
    ? "admin"
    : roles.includes("supervisor")
      ? "supervisor"
      : "collector";
  const p = profileRes.data as
    | (Record<string, unknown> & { branches?: { name: string } | null; areas?: { name: string } | null })
    | null;

  let permissions: StaffPermissions =
    role === "admin"
      ? { collectors: true, deposits: true, collections: true }
      : { collectors: false, deposits: false, collections: false };

  if (role === "supervisor") {
    const { data: perm } = await supabase
      .from("supervisor_permissions")
      .select("can_manage_collectors, can_review_deposits, can_manage_collections")
      .eq("user_id", user.id)
      .maybeSingle();
    permissions = {
      collectors: perm?.can_manage_collectors ?? false,
      deposits: perm?.can_review_deposits ?? false,
      collections: perm?.can_manage_collections ?? false,
    };
  }

  const assignedAreas = ((areasRes.data ?? []) as {
    area_id: string;
    areas?: { name: string } | null;
  }[]).map((r) => ({ id: r.area_id, name: r.areas?.name ?? "" }));
  if (p?.['area_id'] && !assignedAreas.some((a) => a.id === p['area_id'])) {
    assignedAreas.unshift({ id: p['area_id'] as string, name: p.areas?.name ?? "" });
  }

  return {
    userId: user.id,
    role,
    isStaff: role === "admin" || role === "supervisor",
    permissions,
    profile: p
      ? {
          id: p['id'] as string,
          full_name: p['full_name'] as string,
          username: p['username'] as string,
          phone: (p['phone'] as string | null) ?? null,
          active: p['active'] as boolean,
          branch_id: (p['branch_id'] as string | null) ?? null,
          area_id: (p['area_id'] as string | null) ?? null,
          branch_name: p.branches?.name ?? null,
          area_name: p.areas?.name ?? null,
          areas: assignedAreas,
        }
      : null,
  };
}

export function useAuth() {
  return useQuery({
    queryKey: ["auth-state"],
    queryFn: fetchAuthState,
    staleTime: 60_000,
  });
}

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/" });
  };
}
