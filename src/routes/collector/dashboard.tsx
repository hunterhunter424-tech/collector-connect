import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  ClipboardList,
  FilePlus2,
  Gauge,
  Hammer,
  Home,
  LayoutGrid,
  Megaphone,
  Receipt,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchDeposits, summarize } from "@/lib/deposits";
import { formatMoney, formatNumber, isoDayStart } from "@/lib/format";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomSections } from "@/components/app/section-manager";

export const Route = createFileRoute("/collector/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة المحصل | توريدات المحصلين" },
      { name: "description", content: "أضف توريدًا جديدًا وتابع إجمالي توريدات اليوم ومبالغها." },
      { property: "og:title", content: "لوحة المحصل | توريدات المحصلين" },
      { property: "og:description", content: "إضافة التوريدات ومتابعة إجماليات اليوم." },
    ],
  }),
  component: CollectorDashboard,
});

function CollectorDashboard() {
  const { data: auth } = useAuth();
  const profile = auth?.profile;

  const { data: today, isLoading } = useQuery({
    queryKey: ["my-deposits-today", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchDeposits({ collectorId: profile!.id, from: isoDayStart() }),
  });

  const { data: notices } = useQuery({
    queryKey: ["my-announcements", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, message")
        .eq("active", true)
        .or(`target_user_id.is.null,target_user_id.eq.${profile!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; message: string }[];
    },
  });

  const { data: sections } = useCustomSections(true);

  const stats = summarize(today ?? []);

  return (
    <div className="space-y-5">
      <section className="card-elevated brand-gradient p-5 text-primary-foreground">
        <p className="text-sm opacity-90">أهلاً بك</p>
        <h1 className="mt-1 text-2xl font-bold">{profile?.full_name ?? "..."}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1">
            الفرع: {profile?.branch_name ?? "-"}
          </span>
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1">
            المنطقة: {profile?.area_name ?? "-"}
          </span>
        </div>
      </section>

      {(notices ?? []).map((notice) => (
        <div
          key={notice.id}
          className="card-elevated flex items-start gap-3 border-s-4 border-primary p-4"
          role="status"
        >
          <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold">رسالة من الإدارة</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{notice.message}</p>
          </div>
        </div>
      ))}

      <Button asChild className="h-16 w-full text-lg font-bold shadow-lg">
        <Link to="/collector/new-deposit">
          <FilePlus2 className="size-6" /> إضافة توريد جديد
        </Link>
      </Button>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="توريدات اليوم" value={formatNumber(stats.total)} icon={Wallet} />
          <StatCard
            label="مبلغ اليوم"
            value={formatMoney(stats.amount)}
            icon={Banknote}
            tone="success"
          />
          <StatCard
            label="فواتير اليوم"
            value={formatNumber(stats.invoices)}
            icon={Receipt}
            tone="accent"
          />
        </div>
      )}

      <Button asChild variant="secondary" className="h-14 w-full text-base">
        <Link to="/collector/my-deposits">
          <ClipboardList className="size-5" /> توريداتي
        </Link>
      </Button>

      <div dir="rtl" className="grid gap-3 sm:grid-cols-3">
        <Button asChild variant="outline" className="h-14 w-full text-base">
          <Link to="/collector/abandoned">
            <Home className="size-5" /> العقارات المهجورة
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-14 w-full text-base">
          <Link to="/collector/high-readings">
            <Gauge className="size-5" /> القراءات العالية
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-14 w-full text-base">
          <Link to="/collector/demolished">
            <Hammer className="size-5" /> العقارات المهدومة
          </Link>
        </Button>
      </div>

      {(sections ?? []).length ? (
        <div dir="rtl" className="grid gap-3 sm:grid-cols-3">
          {(sections ?? []).map((section) => (
            <Button key={section.id} asChild variant="outline" className="h-14 w-full text-base">
              <Link to="/collector/section/$sectionId" params={{ sectionId: section.id }}>
                <LayoutGrid className="size-5" /> {section.name}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
