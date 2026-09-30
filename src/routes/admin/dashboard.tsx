import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { closeDepositCycle, fetchCurrentDepositCycle, openDepositCycle } from "@/lib/deposit-cycles";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  Banknote,
  CalendarRange,
  FileStack,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchDeposits, summarize } from "@/lib/deposits";
import { formatDateTime, formatMoney, formatNumber, isoDayStart } from "@/lib/format";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة تحكم الإدارة | توريدات المحصلين" },
      { name: "description", content: "إحصائيات التوريدات اليومية والشهرية وآخر العمليات المسجلة." },
      { property: "og:title", content: "لوحة تحكم الإدارة | توريدات المحصلين" },
      { property: "og:description", content: "إحصائيات التوريدات اليومية والشهرية وآخر العمليات." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"close" | "open" | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const cycle = await fetchCurrentDepositCycle();
      const [collectors, monthRows] = await Promise.all([
        supabase.from("profiles").select("id, full_name, active"),
        fetchDeposits({
          from: cycle?.started_at,
          to: cycle?.closed_at ?? undefined,
          limit: 5000,
        }),
      ]);
      const latest = await fetchDeposits({ limit: 8 });
      const dayStart = isoDayStart();
      const todayRows = monthRows.filter((r) => r.created_at >= dayStart);
      const pending = await fetchDeposits({ status: "pending", limit: 1000 });

      const byCollector = new Map<string, { name: string; amount: number; invoices: number }>();
      for (const r of monthRows) {
        const cur = byCollector.get(r.collector_id) ?? {
          name: r.collector_name,
          amount: 0,
          invoices: 0,
        };
        cur.amount += r.amount;
        cur.invoices += r.invoices_count;
        byCollector.set(r.collector_id, cur);
      }
      const byBranch = new Map<string, number>();
      for (const r of monthRows) {
        const key = r.branch_name ?? "بدون فرع";
        byBranch.set(key, (byBranch.get(key) ?? 0) + r.amount);
      }

      return {
        cycle,
        collectorsTotal: (collectors.data ?? []).length,
        collectorsActive: (collectors.data ?? []).filter((c) => c.active).length,
        today: summarize(todayRows),
        month: summarize(monthRows),
        pendingCount: pending.length,
        latest,
        topByAmount: [...byCollector.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
        topByInvoices: [...byCollector.values()].sort((a, b) => b.invoices - a.invoices).slice(0, 5),
        branches: [...byBranch.entries()].sort((a, b) => b[1] - a[1]),
      };
    },
  });

  const cycleMutation = useMutation({
    mutationFn: async (kind: "close" | "open") => {
      if (!auth) throw new Error("no auth");
      if (kind === "close") {
        if (!data?.cycle) throw new Error("no cycle");
        await closeDepositCycle(data.cycle.id, auth.userId);
      } else {
        await openDepositCycle(auth.userId);
      }
    },
    onSuccess: (_r, kind) => {
      toast.success(kind === "close" ? "تم إغلاق دورة التوريد" : "تم فتح دورة توريد جديدة");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("تعذر تنفيذ العملية"),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">لوحة تحكم الإدارة</h1>
        <p className="text-sm text-muted-foreground">نظرة عامة على التوريدات والمحصلين</p>
      </div>

      <section className="card-elevated flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1 text-sm">
          <p className="font-bold">
            دورة التوريد {data.cycle?.closed_at ? "(مغلقة)" : "الحالية (مفتوحة)"}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.cycle ? `من ${formatDateTime(data.cycle.started_at)}` : "لا توجد دورة"}
            {data.cycle?.closed_at ? ` إلى ${formatDateTime(data.cycle.closed_at)}` : ""}
          </p>
        </div>
        {isAdmin ? (
          data.cycle && !data.cycle.closed_at ? (
            <Button variant="destructive" onClick={() => setConfirm("close")}>إنهاء الدورة</Button>
          ) : (
            <Button onClick={() => setConfirm("open")}>فتح دورة جديدة</Button>
          )
        ) : null}
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "close" ? "إنهاء دورة التوريد؟" : "فتح دورة توريد جديدة؟"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "close"
                ? "سيتم إغلاق الدورة الحالية وتثبيت إجمالياتها. التوريدات لن تُحذف."
                : "ستبدأ الإحصائيات من الآن وتظهر التوريدات الجديدة فقط لكل محصل."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={cycleMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) cycleMutation.mutate(confirm);
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {data.pendingCount > 0 ? (
        <Link
          to="/admin/deposits"
          search={{ status: "pending", q: undefined }}
          className="card-elevated flex items-center justify-between gap-3 border-warning/40 bg-warning/10 p-4"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
            <AlertCircle className="size-5" /> توريدات تحتاج مراجعة
          </span>
          <span className="rounded-full bg-warning px-3 py-1 text-sm font-bold text-warning-foreground">
            {formatNumber(data.pendingCount)}
          </span>
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي المحصلين" value={formatNumber(data.collectorsTotal)} icon={Users} />
        <StatCard
          label="المحصلون النشطون"
          value={formatNumber(data.collectorsActive)}
          icon={UserCheck}
          tone="success"
        />
        <StatCard label="توريدات اليوم" value={formatNumber(data.today.total)} icon={FileStack} />
        <StatCard
          label="مبالغ توريدات اليوم"
          value={formatMoney(data.today.amount)}
          icon={Banknote}
          tone="accent"
        />
        <StatCard
          label="فواتير اليوم"
          value={formatNumber(data.today.invoices)}
          icon={FileStack}
          tone="accent"
        />
        <StatCard
          label="توريدات الدورة"
          value={formatNumber(data.month.total)}
          icon={CalendarRange}
        />
        <StatCard
          label="قيمة توريدات الدورة"
          value={formatMoney(data.month.amount)}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="فواتير الدورة"
          value={formatNumber(data.month.invoices)}
          icon={FileStack}
        />
      </div>

      <section className="card-elevated overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold">آخر التوريدات</h2>
          <Link
            to="/admin/deposits"
            search={{ q: undefined, status: undefined }}
            className="text-xs font-semibold text-primary"
          >
            عرض الكل
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">رقم العملية</th>
                <th className="p-3 font-semibold">المحصل</th>
                <th className="p-3 font-semibold">الفرع</th>
                <th className="p-3 font-semibold">الفواتير</th>
                <th className="p-3 font-semibold">المبلغ</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.latest.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    لا توجد توريدات مسجلة بعد
                  </td>
                </tr>
              ) : (
                data.latest.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">#{d.ref}</td>
                    <td className="p-3">{d.collector_name}</td>
                    <td className="p-3">{d.branch_name ?? "-"}</td>
                    <td className="p-3">{formatNumber(d.invoices_count)}</td>
                    <td className="p-3 font-semibold">{formatMoney(d.amount)}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatDateTime(d.created_at)}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={d.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankList
          title="أعلى المحصلين بقيمة التوريدات"
          rows={data.topByAmount.map((r) => ({ label: r.name, value: formatMoney(r.amount) }))}
        />
        <RankList
          title="أعلى المحصلين بعدد الفواتير"
          rows={data.topByInvoices.map((r) => ({ label: r.name, value: formatNumber(r.invoices) }))}
        />
        <RankList
          title="إجمالي توريدات كل فرع"
          rows={data.branches.map(([name, amount]) => ({ label: name, value: formatMoney(amount) }))}
        />
      </div>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <section className="card-elevated p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Trophy className="size-4 text-accent" /> {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="py-6 text-center text-xs text-muted-foreground">لا توجد بيانات</li>
        ) : (
          rows.map((r, i) => (
            <li
              key={`${r.label}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm"
            >
              <span className="truncate">
                <span className="me-2 text-xs text-muted-foreground">{i + 1}.</span>
                {r.label}
              </span>
              <span className="whitespace-nowrap font-semibold">{r.value}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
