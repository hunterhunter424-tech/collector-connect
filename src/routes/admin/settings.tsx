import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Eraser, ImageOff, Loader2, Settings2, Trash2, Upload } from "lucide-react";

import {
  deleteReviewedReceiptImages,
  exportBackup,
  resetOperationalData,
  restoreBackup,
  updateMyCredentials,
} from "@/lib/account.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | توريدات المحصلين" },
      { name: "description", content: "تعديل اسم المستخدم وكلمة المرور لحسابك في نظام توريدات المحصلين." },
      { property: "og:title", content: "الإعدادات | توريدات المحصلين" },
      { property: "og:description", content: "تعديل بيانات الدخول لحسابك." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: auth } = useAuth();
  const queryClient = useQueryClient();
  const update = useServerFn(updateMyCredentials);
  const [fullName, setFullName] = useState(auth?.profile?.full_name ?? "");
  const [username, setUsername] = useState(auth?.profile?.username ?? "");
  useEffect(() => {
    if (auth?.profile) {
      setFullName(auth.profile.full_name ?? "");
      setUsername(auth.profile.username ?? "");
    }
  }, [auth?.profile?.full_name, auth?.profile?.username]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const cleanupReceipts = useServerFn(deleteReviewedReceiptImages);
  const [cleanupMonth, setCleanupMonth] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const runBackup = useServerFn(exportBackup);
  const runReset = useServerFn(resetOperationalData);
  const [backingUp, setBackingUp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [includeAudit, setIncludeAudit] = useState(true);
  const [includeBranches, setIncludeBranches] = useState(false);
  const runRestore = useServerFn(restoreBackup);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function confirmRestore() {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const text = await restoreFile.text();
      const result = await runRestore({ data: { json: text } });
      setRestoreOpen(false);
      setRestoreFile(null);
      toast.success(
        `تمت استعادة النسخة الاحتياطية (${result.counts.deposits} توريد و${result.counts.cycles} دورة تحصيل)`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استعادة النسخة الاحتياطية");
    } finally {
      setRestoring(false);
    }
  }

  async function downloadBackup() {
    setBackingUp(true);
    try {
      const snapshot = await runBackup({});
      const blob = new Blob(
        [JSON.stringify({ createdAt: snapshot.createdAt, tables: JSON.parse(snapshot.json) }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل ملف النسخة الاحتياطية");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء النسخة الاحتياطية");
    } finally {
      setBackingUp(false);
    }
  }

  async function confirmReset() {
    setResetting(true);
    try {
      await runReset({ data: { confirm: resetConfirm.trim(), includeAudit, includeBranches } });
      setResetOpen(false);
      setResetConfirm("");
      toast.success("تم مسح البيانات القديمة، يمكنك البدء من جديد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر مسح البيانات");
    } finally {
      setResetting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextUser = username.trim().toLowerCase();
    const nextName = fullName.trim();
    const changedUser = nextUser && nextUser !== (auth?.profile?.username ?? "");
    const changedName = nextName && nextName !== (auth?.profile?.full_name ?? "");
    if (!changedUser && !changedName && !password) {
      toast.error("لا يوجد تغيير للحفظ");
      return;
    }
    if (nextName && nextName.length < 3) {
      toast.error("الاسم قصير جدًا");
      return;
    }
    if (password && password !== confirm) {
      toast.error("كلمة المرور وتأكيدها غير متطابقين");
      return;
    }
    setSaving(true);
    try {
      await update({
        data: {
          ...(changedName ? { fullName: nextName } : {}),
          ...(changedUser ? { username: nextUser } : {}),
          ...(password ? { password } : {}),
        },
      });
      setPassword("");
      setConfirm("");
      if (changedUser || password) {
        toast.success("تم حفظ بيانات الدخول. سجّل الدخول من جديد بالبيانات الجديدة.");
        await supabase.auth.signOut();
        window.location.href = "/";
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["auth-state"] });
      toast.success("تم حفظ الاسم");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCleanup() {
    if (!cleanupMonth) {
      toast.error("اختر الشهر أولًا");
      return;
    }
    setCleaning(true);
    try {
      const result = await cleanupReceipts({ data: { month: cleanupMonth } });
      setCleanupOpen(false);
      if (result.deletedCount === 0) {
        toast.info("لا توجد صور إيصالات مراجعة في الشهر المحدد");
      } else {
        toast.success(`تم حذف ${result.deletedCount.toLocaleString("ar-EG")} صورة إيصال`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف صور الإيصالات");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Settings2 className="size-5" /> الإعدادات
        </h1>
        <p className="text-sm text-muted-foreground">
          تعديل الاسم واسم المستخدم وكلمة المرور الخاصة بحسابك
        </p>
      </div>

      <form onSubmit={onSubmit} className="card-elevated max-w-lg space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="full-name">الاسم</Label>
          <Input
            id="full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="اسم مدير النظام"
          />
          <p className="text-xs text-muted-foreground">
            هذا الاسم يظهر في سجل العمليات وفي مراجعة التوريدات
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">اسم المستخدم</Label>
          <Input
            id="username"
            dir="ltr"
            className="text-start"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">كلمة المرور الجديدة</Label>
          <Input
            id="password"
            type="password"
            dir="ltr"
            className="text-start"
            placeholder="اتركها فارغة لعدم التغيير"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">6 أحرف على الأقل</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
          <Input
            id="confirm"
            type="password"
            dir="ltr"
            className="text-start"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving} className="h-11 w-full">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "حفظ التعديلات"}
        </Button>
      </form>

      {auth?.role === "admin" ? (
        <section className="card-elevated max-w-lg space-y-4 p-5" aria-labelledby="receipt-cleanup-title">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <ImageOff className="size-5" />
            </div>
            <div>
              <h2 id="receipt-cleanup-title" className="font-bold">
                تنظيف صور الإيصالات
              </h2>
              <p className="text-sm text-muted-foreground">
                حذف صور الإيصالات التي تمت مراجعتها في شهر محدد لتوفير المساحة. ستبقى كل بيانات التوريدات محفوظة.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cleanup-month">شهر التوريدات</Label>
            <Input
              id="cleanup-month"
              type="month"
              dir="ltr"
              className="text-start"
              value={cleanupMonth}
              onChange={(event) => setCleanupMonth(event.target.value)}
            />
          </div>

          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={!cleanupMonth || cleaning}
            onClick={() => setCleanupOpen(true)}
          >
            {cleaning ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            حذف صور الشهر المحدد
          </Button>
        </section>
      ) : null}

      {auth?.role === "admin" ? (
        <section className="card-elevated max-w-lg space-y-4 p-5" aria-labelledby="backup-title">
          <div>
            <h2 id="backup-title" className="font-bold">
              النسخة الاحتياطية
            </h2>
            <p className="text-sm text-muted-foreground">
              تنزيل ملف واحد يحتوي كل بيانات النظام (الحسابات، الفروع، التوريدات، التحصيل، السجل).
            </p>
          </div>
          <Button type="button" variant="secondary" className="w-full" disabled={backingUp} onClick={() => void downloadBackup()}>
            {backingUp ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            تنزيل نسخة احتياطية
          </Button>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="restore-file">استعادة نسخة احتياطية</Label>
            <p className="text-sm text-muted-foreground">
              اختر ملف النسخة الاحتياطية الذي نزّلته من النظام. سيتم استبدال البيانات الحالية بالبيانات الموجودة في الملف.
            </p>
            <Input
              id="restore-file"
              type="file"
              accept="application/json,.json"
              disabled={restoring}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setRestoreFile(file);
                if (file) setRestoreOpen(true);
                e.target.value = "";
              }}
            />
          </div>
        </section>
      ) : null}

      {auth?.role === "admin" ? (
        <section className="card-elevated max-w-lg space-y-4 p-5" aria-labelledby="reset-title">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Eraser className="size-5" />
            </div>
            <div>
              <h2 id="reset-title" className="font-bold">
                مسح البيانات القديمة
              </h2>
              <p className="text-sm text-muted-foreground">
                يمسح كل التوريدات وصور الإيصالات ودورات التحصيل والربط للبدء من جديد. الحسابات تبقى كما هي. نزّل نسخة احتياطية أولًا.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeAudit} onChange={(e) => setIncludeAudit(e.target.checked)} />
            مسح سجل العمليات أيضًا
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeBranches}
              onChange={(e) => setIncludeBranches(e.target.checked)}
            />
            مسح الفروع والمناطق أيضًا
          </label>

          <Button type="button" variant="destructive" className="w-full" onClick={() => setResetOpen(true)}>
            <Eraser className="size-4" />
            مسح البيانات القديمة
          </Button>
        </section>
      ) : null}

      <AlertDialog
        open={restoreOpen}
        onOpenChange={(open) => {
          setRestoreOpen(open);
          if (!open) setRestoreFile(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>استعادة النسخة الاحتياطية؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم استبدال التوريدات ودورات التحصيل والفروع والمناطق والربط وسجل العمليات الحالية ببيانات الملف
              {restoreFile ? ` «${restoreFile.name}»` : ""}. صور الإيصالات لا تُستعاد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={restoring}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring || !restoreFile}
              onClick={(event) => {
                event.preventDefault();
                void confirmRestore();
              }}
            >
              {restoring ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              تأكيد الاستعادة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>مسح كل البيانات القديمة؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن استعادة البيانات بعد المسح. اكتب كلمة «مسح» للتأكيد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder="مسح"
            aria-label="كلمة التأكيد"
          />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={resetting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting || resetConfirm.trim() !== "مسح"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmReset();
              }}
            >
              {resetting ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
              تأكيد المسح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>حذف صور الإيصالات نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف صور الإيصالات المراجعة لشهر {cleanupMonth || "المحدد"} نهائيًا، ولن يمكن استعادتها. لن تُحذف بيانات التوريدات، ولن تتأثر العمليات المنتظرة للمراجعة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={cleaning}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={cleaning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmCleanup();
              }}
            >
              {cleaning ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              تأكيد الحذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
