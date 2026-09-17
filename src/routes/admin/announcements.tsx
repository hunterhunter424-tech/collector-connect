import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Megaphone, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({
    meta: [
      { title: "رسائل المحصلين | توريدات المحصلين" },
      {
        name: "description",
        content: "كتابة رسالة تظهر للمحصلين عند فتح الموقع، لكل المحصلين أو لمحصل محدد.",
      },
      { property: "og:title", content: "رسائل المحصلين | توريدات المحصلين" },
      { property: "og:description", content: "إدارة الرسائل التي تظهر للمحصلين عند الدخول." },
    ],
  }),
  component: AnnouncementsPage,
});

type Announcement = {
  id: string;
  message: string;
  target_user_id: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
};

function AnnouncementsPage() {
  const { data: auth } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");

  const { data: collectors } = useQuery({
    queryKey: ["collector-options"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "collector");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string }[];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)
        .order("full_name");
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const { data: list, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, message, target_user_id, created_at, profiles!announcements_target_user_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Announcement[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const text = message.trim();
      if (text.length < 2) throw new Error("اكتب نص الرسالة أولًا");
      const { error } = await supabase.from("announcements").insert({
        message: text,
        target_user_id: target === "all" ? null : target,
        created_by: auth?.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      setTarget("all");
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("تم حفظ الرسالة وستظهر للمحصلين عند فتح الموقع");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ الرسالة"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("تم إزالة الرسالة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إزالة الرسالة"),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Megaphone className="size-5" /> رسائل المحصلين
        </h1>
        <p className="text-sm text-muted-foreground">
          اكتب رسالة تظهر للمحصل عند فتح الموقع بحسابه، لكل المحصلين أو لمحصل محدد
        </p>
      </div>

      <form
        className="card-elevated max-w-lg space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="message">نص الرسالة</Label>
          <Textarea
            id="message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="مثال: برجاء توريد مبالغ اليوم قبل الساعة 4 عصرًا"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target">تظهر لمن؟</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="target">
              <SelectValue placeholder="اختر" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المحصلين</SelectItem>
              {(collectors ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ الرسالة"}
        </Button>
      </form>

      <section className="card-elevated max-w-lg space-y-3 p-5">
        <h2 className="font-bold">الرسائل الحالية</h2>
        {isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : (list ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد رسائل</p>
        ) : (
          <ul className="space-y-3">
            {(list ?? []).map((item) => (
              <li key={item.id} className="rounded-xl border border-border p-3">
                <p className="whitespace-pre-wrap text-sm font-medium">{item.message}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                    {item.target_user_id ? (item.profiles?.full_name ?? "محصل محدد") : "كل المحصلين"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 className="size-4" /> إزالة
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
