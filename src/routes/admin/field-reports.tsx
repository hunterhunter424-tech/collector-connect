import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Loader2, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ReceiptThumb } from "@/components/app/receipt-image";
import { BackButton } from "@/components/app/back-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/admin/field-reports")({
  head: () => ({
    meta: [
      { title: "تقارير الميدان | توريدات المحصلين" },
      {
        name: "description",
        content: "مراجعة العقارات المهجورة والقراءات العالية والعقارات المهدومة المسجلة من المحصلين.",
      },
      { property: "og:title", content: "تقارير الميدان | توريدات المحصلين" },
      { property: "og:description", content: "مراجعة تقارير المحصلين الميدانية وحذف غير الصحيح منها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FieldReportsPage,
});

type Table = "abandoned_properties" | "demolished_properties" | "high_readings";

type Row = {
  id: string;
  property_no?: string;
  subscription_no?: string;
  reading?: number;
  subscriptions?: string | null;
  notes: string | null;
  images: string[];
  reviewed?: boolean;
  created_at: string;
  profiles?: { full_name: string } | null;
};

function useRows(table: Table) {
  const select =
    table === "high_readings"
      ? "id, subscription_no, reading, notes, images, reviewed, created_at, profiles!high_readings_collector_id_fkey(full_name)"
      : `id, property_no, subscriptions, notes, images, created_at, profiles!${table}_collector_id_fkey(full_name)`;
  return useQuery({
    queryKey: [table, "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
}

function FieldReportsPage() {
  return (
    <div className="space-y-5">
      <BackButton to="/admin/dashboard" label="رجوع" />
      <div>
        <h1 className="text-xl font-bold">تقارير الميدان</h1>
        <p className="text-sm text-muted-foreground">
          مراجعة ما سجله المحصلون. الحذف متاح للمشرفين والمدير فقط.
        </p>
      </div>

      <Tabs defaultValue="abandoned">
        <TabsList className="w-full">
          <TabsTrigger value="abandoned" className="flex-1">العقارات المهجورة</TabsTrigger>
          <TabsTrigger value="readings" className="flex-1">القراءات العالية</TabsTrigger>
          <TabsTrigger value="demolished" className="flex-1">العقارات المهدومة</TabsTrigger>
        </TabsList>
        <TabsContent value="abandoned" className="mt-4">
          <ReportList table="abandoned_properties" subsLabel="الاشتراكات الموجودة بالعقار" />
        </TabsContent>
        <TabsContent value="readings" className="mt-4">
          <ReportList table="high_readings" subsLabel="" />
        </TabsContent>
        <TabsContent value="demolished" className="mt-4">
          <ReportList table="demolished_properties" subsLabel="الاشتراكات التي ما زالت تعمل" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportList({ table, subsLabel }: { table: Table; subsLabel: string }) {
  const { data: auth } = useAuth();
  const queryClient = useQueryClient();
  const rows = useRows(table);
  const [target, setTarget] = useState<Row | null>(null);
  const canDelete = auth?.isStaff ?? false;

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      if (row.images?.length) await supabase.storage.from("receipts").remove(row.images);
      const { error } = await supabase.from(table).delete().eq("id", row.id);
      if (error) throw new Error("تعذر الحذف");
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from("high_readings")
        .update({ reviewed: true, reviewed_at: new Date().toISOString(), reviewed_by: auth?.userId ?? null })
        .eq("id", row.id);
      if (error) throw new Error("تعذر تسجيل المراجعة");
    },
    onSuccess: () => {
      toast.success("تمت المراجعة");
      queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rows.isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  if (!(rows.data ?? []).length)
    return <p className="card-elevated p-4 text-sm text-muted-foreground">لا توجد بيانات مسجلة.</p>;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {(rows.data ?? []).map((row) => (
          <div key={row.id} className="card-elevated space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold">
                {table === "high_readings" ? `اشتراك ${row.subscription_no}` : `عقار رقم ${row.property_no}`}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
            </div>
            <p className="text-muted-foreground">المحصل: {row.profiles?.full_name ?? "-"}</p>
            {table === "high_readings" ? (
              <p className="text-muted-foreground">القراءة: {formatNumber(row.reading)}</p>
            ) : row.subscriptions ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {subsLabel}: {row.subscriptions}
              </p>
            ) : null}
            {row.notes ? <p className="text-muted-foreground">{row.notes}</p> : null}
            {row.images?.length ? (
              <div className="flex flex-wrap gap-2">
                {row.images.map((p) => (
                  <ReceiptThumb key={p} path={p} label="صورة مرفقة" />
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {table === "high_readings" ? (
                row.reviewed ? (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    تمت المراجعة
                  </span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => review.mutate(row)}>
                    <CheckCheck className="size-4" /> تمت المراجعة
                  </Button>
                )
              ) : null}
              {canDelete ? (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setTarget(row)}>
                  <Trash2 className="size-4" /> حذف
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف السجل وصوره نهائيًا ولا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (target) remove.mutate(target);
              }}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
