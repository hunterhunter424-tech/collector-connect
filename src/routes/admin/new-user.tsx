import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createCollector } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/new-user")({
  head: () => ({
    meta: [
      { title: "إنشاء مستخدم جديد | توريدات المحصلين" },
      { name: "description", content: "إنشاء حساب محصل جديد وربطه بفرع ومنطقة محددين." },
      { property: "og:title", content: "إنشاء مستخدم جديد | توريدات المحصلين" },
      { property: "og:description", content: "إنشاء حساب محصل جديد وربطه بفرع ومنطقة." },
    ],
  }),
  component: NewUserPage,
});

function NewUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createCollector);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [extraAreas, setExtraAreas] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [role, setRole] = useState<"collector" | "supervisor">("collector");
  const [canCollectors, setCanCollectors] = useState(false);
  const [canDeposits, setCanDeposits] = useState(false);
  const [canCollections, setCanCollections] = useState(false);
  const isSupervisor = role === "supervisor";

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: areas } = useQuery({
    queryKey: ["areas", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name, active")
        .eq("branch_id", branchId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () =>
      create({
        data: {
          full_name: fullName,
          username,
          password,
          role,
          branch_id: branchId || null,
          area_id: areaId || null,
          area_ids: extraAreas,
          phone: phone || null,
          active,
          can_manage_collectors: isSupervisor ? canCollectors : false,
          can_review_deposits: isSupervisor ? canDeposits : false,
          can_manage_collections: isSupervisor ? canCollections : false,
        },
      }),
    onSuccess: () => {
      toast.success(isSupervisor ? "تم إنشاء حساب المشرف بنجاح" : "تم إنشاء حساب المحصل بنجاح");
      queryClient.invalidateQueries();
      navigate({ to: "/admin/collectors" });
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إنشاء الحساب"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName || !username || !password) {
      toast.error("أكمل جميع الحقول المطلوبة");
      return;
    }
    if (!isSupervisor && (!branchId || !areaId)) {
      toast.error("اختر الفرع والمنطقة للمحصل");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">إنشاء مستخدم جديد</h1>
        <p className="text-sm text-muted-foreground">
          المحصل يرتبط بفرع ومنطقة ولا يرى غير بياناته، والمشرف يطّلع على كل البيانات بالصلاحيات
          التي تحددها له.
        </p>
      </div>

      <div className="card-elevated space-y-3 p-5">
        <Label>نوع الحساب</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { value: "collector", title: "محصل", note: "يورّد من الهاتف ويرى بياناته فقط" },
              { value: "supervisor", title: "مشرف", note: "يطّلع على البيانات بصلاحيات محددة" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRole(opt.value)}
              className={`rounded-xl border p-3 text-start transition-colors ${
                role === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-secondary"
              }`}
            >
              <p className="text-sm font-semibold">{opt.title}</p>
              <p className="text-xs text-muted-foreground">{opt.note}</p>
            </button>
          ))}
        </div>

        {isSupervisor && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold">صلاحيات المشرف</p>
            {(
              [
                {
                  label: "إضافة محصلين",
                  note: "إنشاء حسابات محصلين جديدة",
                  value: canCollectors,
                  set: setCanCollectors,
                },
                {
                  label: "مراجعة التوريدات والموافقة",
                  note: "اعتماد أو رفض التوريدات وكتابة الملاحظات",
                  value: canDeposits,
                  set: setCanDeposits,
                },
                {
                  label: "إدارة التحصيل والدورات",
                  note: "إضافة دورات وإدخال بيانات التحصيل",
                  value: canCollections,
                  set: setCanCollections,
                },
              ] as const
            ).map((perm) => (
              <div
                key={perm.label}
                className="flex items-center justify-between rounded-xl bg-secondary/60 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{perm.label}</p>
                  <p className="text-xs text-muted-foreground">{perm.note}</p>
                </div>
                <Switch checked={perm.value} onCheckedChange={perm.set} />
              </div>
            ))}
            {!canCollectors && !canDeposits && !canCollections && (
              <p className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
                بدون تحديد أي صلاحية سيكون الحساب للاطلاع فقط.
              </p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="card-elevated space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="full_name">اسم المحصل بالكامل</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="محمد أحمد"
            className="h-11"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              dir="ltr"
              className="h-11 text-start"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mohamed01"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              dir="ltr"
              className="h-11 text-start"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>الفرع {isSupervisor ? "(اختياري)" : ""}</Label>
            <Select
              value={branchId}
              onValueChange={(v) => {
                setBranchId(v);
                setAreaId("");
                setExtraAreas([]);
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                {(branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                    {b.active ? "" : " (موقوف)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>المنطقة الأساسية {isSupervisor ? "(اختياري)" : ""}</Label>
            <Select
              value={areaId}
              onValueChange={(v) => {
                setAreaId(v);
                setExtraAreas((prev) => prev.filter((x) => x !== v));
              }}
              disabled={!branchId}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={branchId ? "اختر المنطقة" : "اختر الفرع أولًا"} />
              </SelectTrigger>
              <SelectContent>
                {(areas ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {branchId && (areas ?? []).length > 1 ? (
          <div className="space-y-2 rounded-xl bg-secondary/60 p-3">
            <p className="text-sm font-semibold">مناطق إضافية (اختياري)</p>
            <p className="text-xs text-muted-foreground">
              اختر كل المناطق التي سيكون هذا الحساب مسؤولًا عنها بجانب المنطقة الأساسية.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(areas ?? [])
                .filter((a) => a.id !== areaId)
                .map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
                  >
                    <span>{a.name}</span>
                    <Switch
                      checked={extraAreas.includes(a.id)}
                      onCheckedChange={(v) =>
                        setExtraAreas((prev) =>
                          v ? [...prev, a.id] : prev.filter((x) => x !== a.id),
                        )
                      }
                    />
                  </label>
                ))}
            </div>
          </div>
        ) : null}


        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف (اختياري)</Label>
          <Input
            id="phone"
            dir="ltr"
            className="h-11 text-start"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01000000000"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
          <div>
            <p className="text-sm font-semibold">حالة الحساب</p>
            <p className="text-xs text-muted-foreground">
              {active ? "نشط - يمكنه تسجيل الدخول والتوريد" : "موقوف - لا يمكنه تسجيل الدخول"}
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <UserPlus className="size-5" /> إنشاء الحساب
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
