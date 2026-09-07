import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Banknote, CalendarDays, FileStack, Gauge, ImagePlus, LockKeyhole, Pencil, Plus, RotateCcw, Trash2, WalletCards, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cycleName, displayCycleTotals, fetchCycle, fetchCycleEntries } from "@/lib/collections";
import { ALLOWED_TYPES, compressReceipt } from "@/lib/image";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { CycleStatusBadge } from "@/components/app/cycle-status-badge";
import { ReceiptThumb } from "@/components/app/receipt-image";
import { StatCard } from "@/components/app/stat-card";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/collections/$cycleId")({
  head: () => ({ meta: [
    { title: "تفاصيل دورة التحصيل | نظام توريدات المحصلين" },
    { name: "description", content: "تفاصيل دورة التحصيل وعمليات تحصيل الفواتير والإيرادات الأخرى." },
    { property: "og:title", content: "تفاصيل دورة التحصيل | نظام توريدات المحصلين" },
    { property: "og:description", content: "متابعة تفاصيل ونتائج دورة التحصيل." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CycleDetailsPage,
});

type RevenueDraft = { category: string; amount: string; notes: string };
const blankItem = (): RevenueDraft => ({ category: "", amount: "", notes: "" });
const money = (value: string) => {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
};

function CycleDetailsPage() {
  const { cycleId } = Route.useParams();
  const qc = useQueryClient();
  const { data: auth } = useAuth();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [otherTotal, setOtherTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RevenueDraft[]>([blankItem()]);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetAmount, setTargetAmount] = useState("");
  const [targetInvoices, setTargetInvoices] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [shotPreview, setShotPreview] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<{ id: string; date: string; invoices: string; other: string; notes: string } | null>(null);

  const pickShot = async (file: File | null) => {
    if (!file) { setShot(null); setShotPreview(null); return; }
    try {
      const compressed = await compressReceipt(file);
      setShot(compressed);
      setShotPreview(URL.createObjectURL(compressed));
    } catch (e) {
      toast.error((e as Error).message || "تعذر قراءة الصورة");
    }
  };


  const { data: cycle, isLoading } = useQuery({ queryKey: ["collection-cycle", cycleId], queryFn: () => fetchCycle(cycleId) });
  const { data: entries } = useQuery({ queryKey: ["collection-entries", cycleId], queryFn: () => fetchCycleEntries(cycleId) });
  const totals = cycle ? displayCycleTotals(cycle) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["collection-cycle", cycleId] });
    qc.invalidateQueries({ queryKey: ["collection-entries", cycleId] });
    qc.invalidateQueries({ queryKey: ["collection-cycles"] });
  };

  const soFarInvoices = Number(totals?.invoices ?? 0);
  const soFarOther = Number(totals?.other ?? 0);
  const invoiceDelta = invoiceTotal.trim() === "" ? 0 : money(invoiceTotal) - soFarInvoices;
  const otherDelta = otherTotal.trim() === "" ? 0 : money(otherTotal) - soFarOther;
  const itemsSum = items.reduce((sum, item) => sum + (item.amount.trim() ? money(item.amount) || 0 : 0), 0);

  const addEntry = useMutation({
    mutationFn: async () => {
      if (invoiceTotal.trim() && Number.isNaN(money(invoiceTotal))) throw new Error("مبلغ إجمالي الفواتير غير صحيح");
      if (otherTotal.trim() && Number.isNaN(money(otherTotal))) throw new Error("مبلغ إجمالي الإيرادات الأخرى غير صحيح");
      const validItems = items.filter((item) => item.category.trim() && money(item.amount) > 0);
      if (invoiceDelta === 0 && otherDelta === 0) throw new Error("أدخل إجمالي التحصيل الجديد المختلف عن المسجل حاليًا");
      if (validItems.length) {
        const sum = validItems.reduce((s, item) => s + money(item.amount), 0);
        if (Math.abs(sum - otherDelta) > 0.009) throw new Error(`مجموع بنود الإيرادات الأخرى (${sum}) يجب أن يساوي الزيادة الجديدة (${otherDelta})`);
      }
      if (!auth?.userId) throw new Error("تعذر تحديد المستخدم");
      let shotPath: string | null = null;
      if (shot) {
        const path = `${auth.userId}/collections/${cycleId}-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, shot, { contentType: shot.type || "image/jpeg", upsert: false });
        if (upErr) throw new Error("تعذر رفع صورة الشاشة: " + upErr.message);
        shotPath = path;
      }
      const { data: entry, error } = await supabase.from("collection_entries").insert({
        cycle_id: cycleId, entry_date: entryDate, invoices_collection_amount: invoiceDelta,
        other_revenue_amount: otherDelta, notes: notes.trim() || null, created_by: auth.userId,
        screenshot_url: shotPath,
      }).select("id").single();
      if (error) throw error;
      if (validItems.length) {
        const { error: itemsError } = await supabase.from("other_revenue_items").insert(validItems.map((item) => ({
          collection_entry_id: entry.id, category: item.category.trim(), amount: money(item.amount), notes: item.notes.trim() || null,
        })));
        if (itemsError) { await supabase.from("collection_entries").delete().eq("id", entry.id); throw itemsError; }
      }
    },
    onSuccess: () => { toast.success("تمت إضافة عملية التحصيل"); setInvoiceTotal(""); setOtherTotal(""); setNotes(""); setItems([blankItem()]); setShot(null); setShotPreview(null); refresh(); },

    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("collection_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حذف عملية التحصيل"); setEntryToDelete(null); refresh(); },
    onError: (e: Error) => toast.error(e.message || "تعذر حذف العملية"),
  });

  const updateEntry = useMutation({
    mutationFn: async () => {
      if (!editEntry) return;
      const inv = money(editEntry.invoices || "0");
      const oth = money(editEntry.other || "0");
      if (Number.isNaN(inv) || Number.isNaN(oth)) throw new Error("تأكد من صحة المبالغ المكتوبة");
      if (!editEntry.date) throw new Error("أدخل تاريخ التحصيل");
      const { error } = await supabase.from("collection_entries").update({
        entry_date: editEntry.date, invoices_collection_amount: inv,
        other_revenue_amount: oth, notes: editEntry.notes.trim() || null,
      }).eq("id", editEntry.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تعديل عملية التحصيل"); setEditEntry(null); refresh(); },
    onError: (e: Error) => toast.error(e.message || "تعذر تعديل العملية"),
  });

  const saveTarget = useMutation({
    mutationFn: async () => {
      const amount = money(targetAmount);
      if (Number.isNaN(amount) || amount < 0) throw new Error("أدخل مبلغ ربط صحيح");
      const count = targetInvoices.trim() ? Number(targetInvoices) : null;
      const { error } = await supabase.from("collection_cycles")
        .update({ billing_target_amount: amount, billing_invoices_count: count })
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث مبلغ الربط"); setTargetOpen(false); refresh(); },
    onError: (e: Error) => toast.error(e.message || "تعذر تحديث الربط"),
  });

  const changeStatus = useMutation({
    mutationFn: async (action: "close" | "reopen") => {
      const result = action === "close"
        ? await supabase.rpc("close_collection_cycle", { _cycle_id: cycleId })
        : await supabase.rpc("reopen_collection_cycle", { _cycle_id: cycleId });
      if (result.error) throw result.error;
      return action;
    },
    onSuccess: (action) => { toast.success(action === "close" ? "تم إنهاء الدورة وتثبيت النتائج" : "تمت إعادة فتح الدورة"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!cycle || !totals) return <div className="card-elevated p-10 text-center text-muted-foreground">لم يتم العثور على دورة التحصيل</div>;
  const name = cycleName(Number(cycle.month), Number(cycle.year));
  const canEdit = !!auth?.permissions.collections && cycle.status === "open";

  const ordered = [...(entries ?? [])].sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : a.created_at < b.created_at ? -1 : 1));
  let runInvoices = 0; let runOther = 0;
  const running = new Map<string, { invoices: number; other: number }>();
  for (const entry of ordered) {
    runInvoices += Number(entry.invoices_collection_amount ?? 0);
    runOther += Number(entry.other_revenue_amount ?? 0);
    running.set(entry.id, { invoices: runInvoices, other: runOther });
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Button asChild variant="ghost" className="mb-2 px-0"><Link to="/admin/collections"><ArrowRight className="size-4"/> العودة إلى الدورات</Link></Button><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{name}</h1><CycleStatusBadge status={cycle.status}/></div><p className="text-sm text-muted-foreground">{cycle.branch_name} • {cycle.area_name??"كل المناطق"} • {cycle.collector_name??"دورة عامة"}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? <Button variant="outline" onClick={()=>{setTargetAmount(String(Number(cycle.billing_target_amount ?? 0) || ""));setTargetInvoices(cycle.billing_invoices_count==null?"":String(cycle.billing_invoices_count));setTargetOpen(true);}}><Pencil className="size-4"/> تعديل مبلغ الربط</Button> : null}
        {!auth?.permissions.collections ? null : cycle.status === "open" ? <ConfirmAction title={`هل تريد إنهاء ${name}؟`} description="بعد إنهاء الدورة سيتم تثبيت النتائج النهائية للدورة، ولن يمكن إضافة عمليات جديدة حتى إعادة فتحها." action="تأكيد إنهاء الدورة" onConfirm={()=>changeStatus.mutate("close")}><Button variant="destructive"><LockKeyhole className="size-4"/> إنهاء الدورة</Button></ConfirmAction> : <ConfirmAction title={`إعادة فتح ${name}؟`} description="ستعود الدورة لاستقبال عمليات تحصيل جديدة، وسيتم تسجيل العملية في سجل العمليات." action="تأكيد إعادة الفتح" onConfirm={()=>changeStatus.mutate("reopen")}><Button variant="outline"><RotateCcw className="size-4"/> إعادة فتح الدورة</Button></ConfirmAction>}
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="مبلغ الربط" value={totals.target>0?formatMoney(totals.target):"لم يتم إدخال الربط بعد"} icon={CalendarDays}/>
      <StatCard label="عدد فواتير الربط" value={cycle.billing_invoices_count==null?"غير مسجل":formatNumber(cycle.billing_invoices_count)} icon={FileStack}/>
      <StatCard label="متحصلات الفواتير" value={formatMoney(totals.invoices)} icon={Banknote} tone="success"/>
      <StatCard label="نسبة تحصيل الفواتير" value={totals.percentage==null?"لم يتم إدخال الربط بعد":`${totals.percentage.toFixed(2)}%`} icon={Gauge} tone="accent"/>
      <StatCard label="إجمالي الإيرادات الأخرى" value={formatMoney(totals.other)} icon={WalletCards}/>
      <StatCard label="إجمالي المتحصلات العام" value={formatMoney(totals.grand)} icon={Banknote} tone="success"/>
      <StatCard label="تاريخ وصول الربط" value={formatDate(cycle.target_received_date)} icon={CalendarDays}/>
      <StatCard label="تاريخ إنهاء الدورة" value={cycle.closed_at?formatDateTime(cycle.closed_at):"الدورة ما زالت مفتوحة"} icon={LockKeyhole}/>
    </div>

    {cycle.notes ? <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm"><span className="font-semibold">ملاحظات الدورة: </span>{cycle.notes}</div> : null}

    {canEdit ? <section className="card-elevated p-4"><div className="mb-4"><h2 className="font-bold">إضافة عملية تحصيل</h2><p className="text-xs text-muted-foreground">اكتب الإجمالي المحصَّل حتى اليوم، والنظام يحسب الجديد بطرح المسجل سابقًا</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="تاريخ التحصيل"><Input type="date" value={entryDate} onChange={(e)=>setEntryDate(e.target.value)}/></Field>
        <Field label="إجمالي تحصيل الفواتير حتى اليوم"><Input dir="ltr" inputMode="decimal" value={invoiceTotal} onChange={(e)=>setInvoiceTotal(e.target.value)} placeholder={String(soFarInvoices)}/><p className="text-xs text-muted-foreground">المسجل سابقًا {formatMoney(soFarInvoices)} • الجديد {formatMoney(invoiceDelta)}</p></Field>
        <Field label="إجمالي الإيرادات الأخرى حتى اليوم"><Input dir="ltr" inputMode="decimal" value={otherTotal} onChange={(e)=>setOtherTotal(e.target.value)} placeholder={String(soFarOther)}/><p className="text-xs text-muted-foreground">المسجل سابقًا {formatMoney(soFarOther)} • الجديد {formatMoney(otherDelta)}</p></Field>
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-border bg-secondary/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">صورة شاشة الكمبيوتر (اختياري)</h3>
            <p className="text-xs text-muted-foreground">أضف صورة للشاشة بجوار التسجيل اليدوي لتوثيق الأرقام — JPG, PNG, WEBP</p>
          </div>
          <div className="flex items-center gap-2">
            {shotPreview ? <>
              <img src={shotPreview} alt="صورة شاشة الكمبيوتر" className="size-14 rounded-lg border border-border object-cover" />
              <Button variant="ghost" size="icon" aria-label="إزالة الصورة" onClick={()=>pickShot(null)}><X className="size-4 text-destructive"/></Button>
            </> : null}
            <Button variant="outline" asChild>
              <label htmlFor="cycle-shot" className="cursor-pointer"><ImagePlus className="size-4"/> {shotPreview ? "تغيير الصورة" : "إضافة صورة"}</label>
            </Button>
            <input id="cycle-shot" type="file" className="sr-only" accept={ALLOWED_TYPES.join(",")} onChange={(e)=>pickShot(e.target.files?.[0] ?? null)} />
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold">بنود الإيرادات الأخرى (اختياري)</h3><p className="text-xs text-muted-foreground">الملفات، المخالفات، الأعمال الأخرى — بمبالغ اليوم فقط، ومجموعها يساوي الجديد {formatMoney(otherDelta)}{itemsSum?` (المكتوب ${formatMoney(itemsSum)})`:""}</p></div><Button variant="outline" size="sm" onClick={()=>setItems(s=>[...s,blankItem()])}><Plus className="size-4"/> إضافة بند</Button></div>
        <div className="space-y-3">{items.map((item,index)=><div key={index} className="grid gap-2 rounded-lg bg-secondary/50 p-3 sm:grid-cols-[1fr_160px_1fr_auto]"><Input placeholder="نوع الإيراد" value={item.category} onChange={(e)=>setItems(s=>s.map((x,i)=>i===index?{...x,category:e.target.value}:x))}/><Input dir="ltr" inputMode="decimal" placeholder="المبلغ" value={item.amount} onChange={(e)=>setItems(s=>s.map((x,i)=>i===index?{...x,amount:e.target.value}:x))}/><Input placeholder="ملاحظات البند" value={item.notes} onChange={(e)=>setItems(s=>s.map((x,i)=>i===index?{...x,notes:e.target.value}:x))}/><Button variant="ghost" size="icon" aria-label="حذف البند" disabled={items.length===1} onClick={()=>setItems(s=>s.filter((_,i)=>i!==index))}><Trash2 className="size-4 text-destructive"/></Button></div>)}</div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]"><Field label="ملاحظات العملية"><Textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="ملاحظات اختيارية"/></Field><Button className="self-end" disabled={addEntry.isPending} onClick={()=>addEntry.mutate()}><Plus className="size-4"/> حفظ عملية التحصيل</Button></div>
    </section> : <div className="rounded-lg border border-border bg-secondary/50 p-4 text-center text-sm text-muted-foreground"><LockKeyhole className="mx-auto mb-2 size-5"/>تم تثبيت النتائج. أعد فتح الدورة لإضافة عمليات جديدة.</div>}

    <section className="card-elevated overflow-hidden"><div className="border-b border-border p-4"><h2 className="font-bold">سجل عمليات التحصيل</h2><p className="text-xs text-muted-foreground">{formatNumber(entries?.length??0)} عملية مسجلة</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-right text-sm"><thead className="bg-secondary/60 text-xs text-muted-foreground"><tr><th className="p-3">التاريخ</th><th className="p-3">الوقت</th><th className="p-3">فواتير جديدة</th><th className="p-3">إجمالي الفواتير</th><th className="p-3">إيرادات أخرى جديدة</th><th className="p-3">إجمالي الإيرادات الأخرى</th><th className="p-3">بنود الإيرادات الأخرى</th><th className="p-3">صورة الشاشة</th><th className="p-3">ملاحظات</th><th className="p-3">أدخلها</th><th className="p-3"></th></tr></thead><tbody>
      {(entries??[]).map(entry=><tr key={entry.id} className="border-t border-border align-top"><td className="p-3">{formatDate(entry.entry_date)}</td><td className="p-3">{formatTime(entry.created_at)}</td><td className="p-3 font-semibold">{formatMoney(entry.invoices_collection_amount)}</td><td className="p-3">{formatMoney(running.get(entry.id)?.invoices??0)}</td><td className="p-3 font-semibold">{formatMoney(entry.other_revenue_amount)}</td><td className="p-3">{formatMoney(running.get(entry.id)?.other??0)}</td><td className="p-3">{entry.items.length?<ul className="space-y-1">{entry.items.map(item=><li key={item.id}>{item.category}: <span className="font-semibold">{formatMoney(item.amount)}</span>{item.notes?<span className="text-xs text-muted-foreground"> — {item.notes}</span>:null}</li>)}</ul>:"-"}</td><td className="p-3">{entry.screenshot_url?<ReceiptThumb path={entry.screenshot_url} label="صورة شاشة الكمبيوتر"/>:<span className="text-muted-foreground">-</span>}</td><td className="p-3 text-muted-foreground">{entry.notes??"-"}</td><td className="p-3">{entry.creator_name}</td><td className="p-3">{canEdit?<div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="تعديل العملية" onClick={()=>setEditEntry({id:entry.id,date:String(entry.entry_date).slice(0,10),invoices:String(Number(entry.invoices_collection_amount??0)),other:String(Number(entry.other_revenue_amount??0)),notes:entry.notes??""})}><Pencil className="size-4"/></Button><Button variant="ghost" size="icon" className="text-destructive" aria-label="حذف العملية" onClick={()=>setEntryToDelete(entry.id)}><Trash2 className="size-4"/></Button></div>:null}</td></tr>)}

      {!entries?.length?<tr><td colSpan={11} className="p-10 text-center text-muted-foreground">لا توجد عمليات تحصيل في هذه الدورة بعد</td></tr>:null}
    </tbody></table></div></section>

    <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right"><DialogTitle>تعديل مبلغ الربط</DialogTitle><DialogDescription>يمكن إضافة أو تعديل مبلغ ربط الفواتير في أي وقت أثناء فتح الدورة.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <Field label="مبلغ ربط الفواتير"><Input dir="ltr" inputMode="decimal" value={targetAmount} onChange={(e)=>setTargetAmount(e.target.value)} placeholder="850000"/></Field>
          <Field label="عدد فواتير الربط (اختياري)"><Input dir="ltr" type="number" min="0" value={targetInvoices} onChange={(e)=>setTargetInvoices(e.target.value)}/></Field>
          <Button disabled={saveTarget.isPending} onClick={()=>saveTarget.mutate()}>حفظ الربط</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!editEntry} onOpenChange={(o)=>{if(!o)setEditEntry(null)}}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right"><DialogTitle>تعديل عملية التحصيل</DialogTitle><DialogDescription>المبالغ هنا هي المبالغ الجديدة الخاصة بهذه العملية فقط، وستتحدث الإجماليات والنسبة تلقائيًا.</DialogDescription></DialogHeader>
        {editEntry?<div className="grid gap-4">
          <Field label="تاريخ التحصيل"><Input type="date" value={editEntry.date} onChange={(e)=>setEditEntry({...editEntry,date:e.target.value})}/></Field>
          <Field label="مبلغ تحصيل الفواتير (جديد)"><Input dir="ltr" inputMode="decimal" value={editEntry.invoices} onChange={(e)=>setEditEntry({...editEntry,invoices:e.target.value})}/></Field>
          <Field label="مبلغ الإيرادات الأخرى (جديد)"><Input dir="ltr" inputMode="decimal" value={editEntry.other} onChange={(e)=>setEditEntry({...editEntry,other:e.target.value})}/></Field>
          <Field label="ملاحظات العملية"><Textarea value={editEntry.notes} onChange={(e)=>setEditEntry({...editEntry,notes:e.target.value})}/></Field>
          <Button disabled={updateEntry.isPending} onClick={()=>updateEntry.mutate()}>حفظ التعديل</Button>
        </div>:null}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!entryToDelete} onOpenChange={(o)=>{if(!o)setEntryToDelete(null)}}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader><AlertDialogTitle>حذف عملية التحصيل؟</AlertDialogTitle><AlertDialogDescription>سيتم حذف العملية وكل بنود الإيرادات الأخرى الخاصة بها، وستتحدث الإجماليات والنسبة تلقائيًا.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={()=>entryToDelete&&deleteEntry.mutate(entryToDelete)}>تأكيد الحذف</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>}
function ConfirmAction({title,description,action,onConfirm,children}:{title:string;description:string;action:string;onConfirm:()=>void;children:React.ReactNode}){return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
