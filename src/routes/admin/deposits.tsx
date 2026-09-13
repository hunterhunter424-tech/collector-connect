import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileSearch,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logAudit } from "@/lib/admin.functions";
import {
  createManualDeposit,
  deleteDeposit,
  updateDepositDetails,
} from "@/lib/maintenance.functions";

import { fetchDeposits, summarize, type DepositRow } from "@/lib/deposits";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  rangeToDates,
  type RangeKey,
} from "@/lib/format";
import { ReceiptFull, ReceiptThumb } from "@/components/app/receipt-image";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DepositSearch = { q?: string | undefined; status?: string | undefined };

export const Route = createFileRoute("/admin/deposits")({
  validateSearch: (search: Record<string, unknown>): DepositSearch => ({
    q: typeof search['q'] === "string" ? (search['q'] as string) : undefined,
    status: typeof search['status'] === "string" ? (search['status'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "إدارة التوريدات | توريدات المحصلين" },
      { name: "description", content: "جميع عمليات التوريد مع البحث والفلترة ومراجعة الإيصالات." },
      { property: "og:title", content: "إدارة التوريدات | توريدات المحصلين" },
      { property: "og:description", content: "مراجعة عمليات التوريد وصور الإيصالات." },
    ],
  }),
  component: DepositsPage,
});

const ALL = "all";

function DepositsPage() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const audit = useServerFn(logAudit);

  const [term, setTerm] = useState(search.q ?? "");
  const [status, setStatus] = useState(search.status ?? ALL);
  const [branchId, setBranchId] = useState(ALL);
  const [areaId, setAreaId] = useState(ALL);
  const [collectorId, setCollectorId] = useState(ALL);
  const [range, setRange] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [reviewing, setReviewing] = useState<DepositRow | null>(null);
  const { data: auth } = useAuth();
  const canReview = auth?.permissions.deposits ?? false;
  const [adminNote, setAdminNote] = useState("");

  const dates = rangeToDates(range, customFrom, customTo);

  const { data: options } = useQuery({
    queryKey: ["deposit-filter-options"],
    queryFn: async () => {
      const [b, a, p] = await Promise.all([
        supabase.from("branches").select("id, name").order("name"),
        supabase.from("areas").select("id, name, branch_id").order("name"),
        supabase.from("profiles").select("id, full_name").order("full_name"),
      ]);
      return { branches: b.data ?? [], areas: a.data ?? [], collectors: p.data ?? [] };
    },
  });

  const filters = {
    search: term || undefined,
    status: status === ALL ? undefined : status,
    branchId: branchId === ALL ? undefined : branchId,
    areaId: areaId === ALL ? undefined : areaId,
    collectorId: collectorId === ALL ? undefined : collectorId,
    from: dates.from,
    to: dates.to,
  };

  const { data: rows, isLoading } = useQuery({
    queryKey: ["deposits", filters],
    queryFn: () => fetchDeposits(filters),
  });

  const stats = summarize(rows ?? []);
  const [confirmAll, setConfirmAll] = useState(false);
  const removeDeposit = useServerFn(deleteDeposit);
  const [toDelete, setToDelete] = useState<DepositRow | null>(null);

  const destroy = useMutation({
    mutationFn: async (row: DepositRow) => {
      await removeDeposit({ data: { id: row.id } });
    },
    onSuccess: () => {
      toast.success("تم حذف التوريد، يمكن للمحصل رفعه من جديد");
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message || "تعذر حذف التوريد"),
  });

  const isAdmin = auth?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const saveDetails = useServerFn(updateDepositDetails);
  const addManualFn = useServerFn(createManualDeposit);
  const blankManual = {
    collector: "",
    area: ALL,
    date: today,
    time: "12:00",
    invoices: "",
    amount: "",
    notes: "",
    status: "approved" as "approved" | "pending",
  };
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState(blankManual);
  const [fix, setFix] = useState({
    collector: "",
    date: today,
    time: "12:00",
    invoices: "",
    amount: "",
    notes: "",
    status: "pending" as "pending" | "approved" | "rejected",
  });

  function openReview(row: DepositRow) {
    setReviewing(row);
    setAdminNote(row.admin_notes ?? "");
    const created = new Date(row.created_at);
    setFix({
      collector: row.collector_id,
      date: row.created_at.slice(0, 10),
      time: `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}`,
      invoices: String(row.invoices_count),
      amount: String(row.amount),
      notes: row.notes ?? "",
      status: row.status as "pending" | "approved" | "rejected",
    });
  }

  const refreshDeposits = () => {
    queryClient.invalidateQueries({ queryKey: ["deposits"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const fixDeposit = useMutation({
    mutationFn: async (row: DepositRow) => {
      const invoices = Number(fix.invoices);
      const amount = Number(String(fix.amount).replace(/,/g, ""));
      if (!Number.isFinite(invoices) || invoices < 0) throw new Error("عدد الفواتير غير صحيح");
      if (!Number.isFinite(amount) || amount < 0) throw new Error("المبلغ غير صحيح");
      if (!fix.date) throw new Error("أدخل تاريخ التوريد");
      await saveDetails({
        data: {
          id: row.id,
          collector_id: fix.collector || row.collector_id,
          invoices_count: invoices,
          amount,
          notes: fix.notes,
          admin_notes: adminNote,
          entry_date: fix.date,
          entry_time: fix.time || "12:00",
          status: fix.status,
        },
      });
    },

    onSuccess: () => {
      toast.success("تم تصحيح بيانات التوريد");
      setReviewing(null);
      refreshDeposits();
    },
    onError: (e: Error) => toast.error(e.message || "تعذر تصحيح التوريد"),
  });

  const addManual = useMutation({
    mutationFn: async () => {
      const invoices = Number(manual.invoices);
      const amount = Number(String(manual.amount).replace(/,/g, ""));
      if (!manual.collector) throw new Error("اختر المحصل");
      if (!manual.date) throw new Error("أدخل تاريخ التوريد");
      if (!Number.isFinite(invoices) || invoices < 0) throw new Error("عدد الفواتير غير صحيح");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("أدخل مبلغ التوريد");
      await addManualFn({
        data: {
          collector_id: manual.collector,
          area_id: manual.area === ALL ? null : manual.area,
          invoices_count: invoices,
          amount,
          notes: manual.notes,
          entry_date: manual.date,
          entry_time: manual.time || "12:00",
          status: manual.status,
        },
      });
    },
    onSuccess: () => {
      toast.success("تمت إضافة التوريد للمحصل");
      setManualOpen(false);
      setManual(blankManual);
      refreshDeposits();
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إضافة التوريد"),
  });



  const review = useMutation({
    mutationFn: async (p: { row: DepositRow; status: "approved" | "rejected"; note: string }) => {
      const { error } = await supabase
        .from("deposits")
        .update({
          status: p.status,
          admin_notes: p.note || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", p.row.id);
      if (error) throw error;
      await audit({
        data: {
          action: p.status === "approved" ? "مراجعة توريد" : "رفض توريد",
          details: `عملية رقم ${p.row.ref} للمحصل ${p.row.collector_name}${p.note ? ` - ${p.note}` : ""}`,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث حالة المراجعة");
      setReviewing(null);
      setAdminNote("");
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("تعذر تحديث حالة المراجعة"),
  });

  const pendingRows = (rows ?? []).filter((r) => r.status === "pending");

  const reviewAll = useMutation({
    mutationFn: async () => {
      const ids = pendingRows.map((r) => r.id);
      if (ids.length === 0) return 0;
      const { error } = await supabase
        .from("deposits")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await audit({
        data: {
          action: "مراجعة كل التوريدات",
          details: `تمت مراجعة ${ids.length} عملية دفعة واحدة`,
        },
      });
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`تمت مراجعة ${formatNumber(Number(count))} عملية`);
      setConfirmAll(false);
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("تعذر تنفيذ المراجعة الجماعية"),
  });

  const areaOptions = (options?.areas ?? []).filter(
    (a) => branchId === ALL || a.branch_id === branchId,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">التوريدات</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumber(stats.total)} عملية • {formatNumber(stats.invoices)} فاتورة •{" "}
            {formatMoney(stats.amount)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {isAdmin ? (
          <Button variant="outline" onClick={() => setManualOpen(true)}>
            <Plus className="size-4" /> إضافة توريد لمحصل
          </Button>
        ) : null}
        <Button
          disabled={!canReview || pendingRows.length === 0 || reviewAll.isPending}
          onClick={() => setConfirmAll(true)}
        >
          <CheckCircle2 className="size-4" /> تمت مراجعة الكل ({formatNumber(pendingRows.length)})
        </Button>
        </div>
      </div>


      <div className="card-elevated grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-4">
        <div className="relative md:col-span-3 lg:col-span-2">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pe-10"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="بحث بالاسم أو اسم المستخدم أو رقم العملية"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="حالة المراجعة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الحالات</SelectItem>
            <SelectItem value="pending">في انتظار المراجعة</SelectItem>
            <SelectItem value="approved">تمت المراجعة</SelectItem>
            <SelectItem value="rejected">يحتاج تصحيح</SelectItem>
          </SelectContent>
        </Select>

        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="الفترة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفترات</SelectItem>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="yesterday">أمس</SelectItem>
            <SelectItem value="week">هذا الأسبوع</SelectItem>
            <SelectItem value="month">هذا الشهر</SelectItem>
            <SelectItem value="custom">من تاريخ إلى تاريخ</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={branchId}
          onValueChange={(v) => {
            setBranchId(v);
            setAreaId(ALL);
          }}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفروع</SelectItem>
            {(options?.branches ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="المنطقة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل المناطق</SelectItem>
            {areaOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={collectorId} onValueChange={setCollectorId}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="المحصل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل المحصلين</SelectItem>
            {(options?.collectors ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {range === "custom" ? (
          <>
            <div className="space-y-1">
              <Label className="text-xs">من</Label>
              <Input
                type="date"
                className="h-10"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى</Label>
              <Input
                type="date"
                className="h-10"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (rows ?? []).length === 0 ? (
        <div className="card-elevated flex flex-col items-center gap-2 p-10 text-center">
          <FileSearch className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد عمليات مطابقة للفلاتر</p>
        </div>
      ) : (
        <div className="card-elevated overflow-x-auto">
          <table className="w-full min-w-[1000px] text-right text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">رقم العملية</th>
                <th className="p-3 font-semibold">المحصل</th>
                <th className="p-3 font-semibold">الفرع</th>
                <th className="p-3 font-semibold">المنطقة</th>
                <th className="p-3 font-semibold">الفواتير</th>
                <th className="p-3 font-semibold">المبلغ</th>
                <th className="p-3 font-semibold">التاريخ</th>
                <th className="p-3 font-semibold">الوقت</th>
                <th className="p-3 font-semibold">الإيصال</th>
                <th className="p-3 font-semibold">الحالة</th>
                {auth?.role === "admin" ? (
                  <th className="p-3 font-semibold">تمت المراجعة بواسطة</th>
                ) : null}
                <th className="p-3 font-semibold">ملاحظات الإدارة</th>
                <th className="p-3 font-semibold">مراجعة</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">#{row.ref}</td>
                  <td className="p-3 font-semibold">{row.collector_name}</td>
                  <td className="p-3">{row.branch_name ?? "-"}</td>
                  <td className="p-3">{row.area_name ?? "-"}</td>
                  <td className="p-3">{formatNumber(row.invoices_count)}</td>
                  <td className="p-3 font-semibold">{formatMoney(row.amount)}</td>
                  <td className="p-3 text-xs">{formatDate(row.created_at)}</td>
                  <td className="p-3 text-xs">{formatTime(row.created_at)}</td>
                  <td className="p-3">
                    <ReceiptThumb path={row.receipt_image_url} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={row.status} />
                  </td>
                  {auth?.role === "admin" ? (
                    <td className="p-3 text-xs">
                      {row.reviewer_name ? (
                        <div className="space-y-0.5">
                          <div className="font-semibold">{row.reviewer_name}</div>
                          {row.reviewed_at ? (
                            <div className="text-muted-foreground">
                              {formatDate(row.reviewed_at)} - {formatTime(row.reviewed_at)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ) : null}
                  <td className="max-w-[180px] p-3 text-xs text-muted-foreground">
                    {row.admin_notes ?? "-"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openReview(row)}

                      >
                        {canReview ? "عرض ومراجعة" : "عرض"}
                      </Button>
                      {auth?.role === "admin" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          aria-label="حذف التوريد"
                          onClick={() => setToDelete(row)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!reviewing}
        onOpenChange={(o) => {
          if (!o) {
            setReviewing(null);
            setAdminNote("");
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>مراجعة العملية #{reviewing?.ref}</DialogTitle>
            <DialogDescription>
              {reviewing?.collector_name} • {reviewing?.branch_name} • {reviewing?.area_name}
            </DialogDescription>
          </DialogHeader>

          {reviewing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Info label="عدد الفواتير" value={formatNumber(reviewing.invoices_count)} />
                <Info label="المبلغ" value={formatMoney(reviewing.amount)} />
                <Info label="التاريخ" value={formatDate(reviewing.created_at)} />
                <Info label="الوقت" value={formatTime(reviewing.created_at)} />
              </div>

              {reviewing.notes ? (
                <p className="rounded-xl bg-secondary/60 p-3 text-sm">
                  ملاحظات المحصل: {reviewing.notes}
                </p>
              ) : null}

              {isAdmin ? (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <div>
                    <p className="text-sm font-bold">تصحيح بيانات التوريد</p>
                    <p className="text-xs text-muted-foreground">
                      لو فيه خطأ في المبلغ أو الفواتير أو التاريخ، عدّلها هنا واحفظ التصحيح.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">تاريخ التوريد</Label>
                      <Input
                        type="date"
                        value={fix.date}
                        onChange={(e) => setFix({ ...fix, date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">وقت التوريد</Label>
                      <Input
                        type="time"
                        value={fix.time}
                        onChange={(e) => setFix({ ...fix, time: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">عدد الفواتير</Label>
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        value={fix.invoices}
                        onChange={(e) => setFix({ ...fix, invoices: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">المبلغ</Label>
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        value={fix.amount}
                        onChange={(e) => setFix({ ...fix, amount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ملاحظات المحصل</Label>
                      <Input
                        value={fix.notes}
                        onChange={(e) => setFix({ ...fix, notes: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">حالة المراجعة</Label>
                      <Select
                        value={fix.status}
                        onValueChange={(v) =>
                          setFix({ ...fix, status: v as "pending" | "approved" | "rejected" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">في انتظار المراجعة</SelectItem>
                          <SelectItem value="approved">تمت المراجعة</SelectItem>
                          <SelectItem value="rejected">يحتاج تصحيح</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={fixDeposit.isPending}
                    onClick={() => reviewing && fixDeposit.mutate(reviewing)}
                  >
                    {fixDeposit.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    حفظ التصحيح
                  </Button>
                </div>
              ) : null}


              <ReceiptFull path={reviewing.receipt_image_url} />

              <div className="space-y-2">
                <Label>ملاحظة الإدارة (مطلوبة عند وجود خطأ)</Label>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="اكتب الملاحظة هنا"
                  rows={3}
                />
              </div>

              <div className={`flex flex-wrap gap-2 ${canReview ? "" : "hidden"}`}>
                <Button
                  className="flex-1"
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate({ row: reviewing, status: "approved", note: adminNote })
                  }
                >
                  <CheckCircle2 className="size-4" /> تمت المراجعة
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={review.isPending}
                  onClick={() => {
                    if (!adminNote.trim()) {
                      toast.error("اكتب ملاحظة توضح الخطأ");
                      return;
                    }
                    review.mutate({ row: reviewing, status: "rejected", note: adminNote });
                  }}
                >
                  <XCircle className="size-4" /> يوجد خطأ
                </Button>
              </div>
              {!canReview && (
                <p className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                  حسابك للاطلاع فقط على التوريدات.
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={(o) => !o && setManualOpen(false)}>
        <DialogContent dir="rtl" className="max-h-[92vh] max-w-lg overflow-auto">
          <DialogHeader className="text-right">
            <DialogTitle>إضافة توريد لمحصل</DialogTitle>
            <DialogDescription>
              لتسجيل توريد قديم أو بتاريخ معين بدون صورة إيصال. الفرع يُؤخذ من حساب المحصل.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">المحصل</Label>
              <Select
                value={manual.collector}
                onValueChange={(v) => setManual({ ...manual, collector: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المحصل" />
                </SelectTrigger>
                <SelectContent>
                  {(options?.collectors ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">المنطقة (اختياري)</Label>
              <Select value={manual.area} onValueChange={(v) => setManual({ ...manual, area: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="منطقة حساب المحصل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>منطقة حساب المحصل</SelectItem>
                  {(options?.areas ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">تاريخ التوريد</Label>
              <Input
                type="date"
                value={manual.date}
                onChange={(e) => setManual({ ...manual, date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">وقت التوريد</Label>
              <Input
                type="time"
                value={manual.time}
                onChange={(e) => setManual({ ...manual, time: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">عدد الفواتير</Label>
              <Input
                dir="ltr"
                inputMode="numeric"
                value={manual.invoices}
                onChange={(e) => setManual({ ...manual, invoices: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المبلغ</Label>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={manual.amount}
                onChange={(e) => setManual({ ...manual, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">حالة المراجعة</Label>
              <Select
                value={manual.status}
                onValueChange={(v) => setManual({ ...manual, status: v as "approved" | "pending" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">تمت المراجعة</SelectItem>
                  <SelectItem value="pending">في انتظار المراجعة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea
                rows={2}
                value={manual.notes}
                onChange={(e) => setManual({ ...manual, notes: e.target.value })}
                placeholder="سبب الإضافة اليدوية"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={addManual.isPending}
              onClick={() => addManual.mutate()}
            >
              {addManual.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              حفظ التوريد
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setManualOpen(false)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>



      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>حذف التوريد نهائيًا؟</DialogTitle>
            <DialogDescription>
              سيتم حذف العملية رقم {toDelete?.ref} وصورة الإيصال الخاصة بها، ويستطيع المحصل{" "}
              {toDelete?.collector_name} رفع التوريد من جديد بشكل صحيح.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={destroy.isPending}
              onClick={() => toDelete && destroy.mutate(toDelete)}
            >
              {destroy.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              تأكيد الحذف
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setToDelete(null)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAll} onOpenChange={(o) => !o && setConfirmAll(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد مراجعة الكل</DialogTitle>
            <DialogDescription>
              سيتم تحديد {formatNumber(pendingRows.length)} عملية في انتظار المراجعة كـ «تمت
              المراجعة» حسب الفلاتر الحالية.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={reviewAll.isPending}
              onClick={() => reviewAll.mutate()}
            >
              <CheckCircle2 className="size-4" /> تأكيد
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmAll(false)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
