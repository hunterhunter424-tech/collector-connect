import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar } from "recharts";
import { ArrowDown, ArrowLeft, ArrowUp, Banknote, CalendarRange, FileStack, Gauge, Loader2, Plus, ReceiptText, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logAudit } from "@/lib/admin.functions";
import { deleteCollectionCycle } from "@/lib/maintenance.functions";
import { ARABIC_MONTHS, cycleName, displayCycleTotals, fetchCycleSummaries } from "@/lib/collections";
import { formatMoney, formatNumber } from "@/lib/format";
import { CycleStatusBadge } from "@/components/app/cycle-status-badge";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/collections/")({
  head: () => ({ meta: [
    { title: "شاشة التحصيل الكمبيوتر | نظام توريدات المحصلين" },
    { name: "description", content: "إدارة دورات التحصيل والربط ونسب التحصيل والمقارنات الشهرية." },
    { property: "og:title", content: "شاشة التحصيل الكمبيوتر | نظام توريدات المحصلين" },
    { property: "og:description", content: "متابعة دورات التحصيل والإيرادات والمقارنات الشهرية." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: CollectionsPage,
});

const ALL = "all";
const now = new Date();
const initialForm = {
  month: String(now.getMonth() + 1), year: String(now.getFullYear()), branchId: "", areaId: "none",
  collectorId: "none", target: "", invoices: "", receivedDate: now.toISOString().slice(0, 10), notes: "",
};

type OptionData = {
  branches: { id: string; name: string }[];
  areas: { id: string; name: string; branch_id: string }[];
  collectors: { id: string; full_name: string; branch_id: string | null; area_id: string | null }[];
};

function CollectionsPage() {
  const qc = useQueryClient();
  const audit = useServerFn(logAudit);
  const { data: auth } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [year, setYear] = useState(ALL);
  const [month, setMonth] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [area, setArea] = useState(ALL);
  const [collector, setCollector] = useState(ALL);
  const [cycle, setCycle] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const removeCycle = useServerFn(deleteCollectionCycle);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const deleteCycle = useMutation({
    mutationFn: async (id: string) => { await removeCycle({ data: { id } }); },
    onSuccess: () => { toast.success("تم حذف الدورة المنتهية"); setToDelete(null); qc.invalidateQueries({ queryKey: ["collection-cycles"] }); },
    onError: (e: Error) => toast.error(e.message || "تعذر حذف الدورة"),
  });

  const { data: options } = useQuery<OptionData>({
    queryKey: ["collection-options"],
    queryFn: async () => {
      const [b, a, p] = await Promise.all([
        supabase.from("branches").select("id,name").eq("active", true).order("name"),
        supabase.from("areas").select("id,name,branch_id").eq("active", true).order("name"),
        supabase.from("profiles").select("id,full_name,branch_id,area_id").eq("active", true).order("full_name"),
      ]);
      if (b.error) throw b.error; if (a.error) throw a.error; if (p.error) throw p.error;
      return { branches: b.data ?? [], areas: a.data ?? [], collectors: p.data ?? [] };
    },
  });

  const filters = {
    year: year === ALL ? undefined : Number(year), month: month === ALL ? undefined : Number(month),
    branchId: branch === ALL ? undefined : branch, areaId: area === ALL ? undefined : area,
    collectorId: collector === ALL ? undefined : collector, cycleId: cycle === ALL ? undefined : cycle,
    from: from || undefined, to: to || undefined,
  };
  const { data: rows, isLoading } = useQuery({ queryKey: ["collection-cycles", filters], queryFn: () => fetchCycleSummaries(filters) });
  const allRows = rows ?? [];
  const openRows = allRows.filter((row) => row.status === "open");
  const current = openRows[0] ?? allRows[0];
  const totals = current ? displayCycleTotals(current) : null;

  const timeline = useMemo(() => [...allRows].sort((a, b) => Number(a.year) - Number(b.year) || Number(a.month) - Number(b.month)).map((row) => {
    const t = displayCycleTotals(row);
    return { name: `${ARABIC_MONTHS[Number(row.month) - 1]} ${row.year}`, percentage: Number((t.percentage ?? 0).toFixed(1)), invoices: t.invoices, other: t.other, grand: t.grand };
  }), [allRows]);
  const latest = timeline.at(-1);
  const previous = timeline.at(-2);
  const change = latest && previous ? latest.percentage - previous.percentage : null;

  const createCycle = useMutation({
    mutationFn: async () => {
      const target = Number(form.target); const invoices = form.invoices ? Number(form.invoices) : null;
      if (!form.branchId || !form.receivedDate || Number.isNaN(target) || target < 0) throw new Error("أكمل بيانات الربط المطلوبة");
      const { data, error } = await supabase.from("collection_cycles").insert({
        month: Number(form.month), year: Number(form.year), branch_id: form.branchId,
        area_id: form.areaId === "none" ? null : form.areaId, collector_id: form.collectorId === "none" ? null : form.collectorId,
        billing_target_amount: target, billing_invoices_count: invoices, target_received_date: form.receivedDate,
        notes: form.notes.trim() || null, created_by: auth?.userId ?? "",
      }).select("id").single();
      if (error) throw error;
      await audit({ data: { action: "إنشاء دورة تحصيل", details: `${cycleName(Number(form.month), Number(form.year))} - ربط ${target}` } });
      return data.id;
    },
    onSuccess: () => { toast.success("تم إنشاء دورة التحصيل"); setDialogOpen(false); setForm(initialForm); qc.invalidateQueries({ queryKey: ["collection-cycles"] }); },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "هذه الدورة مسجلة بالفعل لنفس النطاق" : e.message),
  });

  const formAreas = (options?.areas ?? []).filter((x) => x.branch_id === form.branchId);
  const formCollectors = (options?.collectors ?? []).filter((x) => x.branch_id === form.branchId && (form.areaId === "none" || x.area_id === form.areaId));
  const years = [...new Set([now.getFullYear(), ...allRows.map((r) => Number(r.year))])].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold">شاشة التحصيل الكمبيوتر</h1><p className="text-sm text-muted-foreground">دورات مستقلة للربط والتحصيل والإيرادات الأخرى</p></div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button disabled={!auth?.permissions.collections}><Plus className="size-4" /> إنشاء دورة جديدة</Button></DialogTrigger>
          <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="text-right"><DialogTitle>إنشاء دورة تحصيل</DialogTitle><DialogDescription>حدد نطاق الدورة وبيانات الربط عند وصوله.</DialogDescription></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الشهر"><Select value={form.month} onValueChange={(v) => setForm((s) => ({...s, month:v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ARABIC_MONTHS.map((m,i)=><SelectItem key={m} value={String(i+1)}>{m}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="السنة"><Input type="number" min="2020" max="2100" value={form.year} onChange={(e)=>setForm(s=>({...s,year:e.target.value}))} /></Field>
              <Field label="الفرع"><Select value={form.branchId} onValueChange={(v)=>setForm(s=>({...s,branchId:v,areaId:"none",collectorId:"none"}))}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{(options?.branches??[]).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="المنطقة"><Select value={form.areaId} onValueChange={(v)=>setForm(s=>({...s,areaId:v,collectorId:"none"}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">كل مناطق الفرع</SelectItem>{formAreas.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="المحصل"><Select value={form.collectorId} onValueChange={(v)=>setForm(s=>({...s,collectorId:v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">دورة عامة</SelectItem>{formCollectors.map(x=><SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="مبلغ ربط الفواتير"><Input dir="ltr" inputMode="decimal" value={form.target} onChange={(e)=>setForm(s=>({...s,target:e.target.value}))} placeholder="850000" /></Field>
              <Field label="عدد فواتير الربط (اختياري)"><Input dir="ltr" type="number" min="0" value={form.invoices} onChange={(e)=>setForm(s=>({...s,invoices:e.target.value}))} /></Field>
              <Field label="تاريخ وصول الربط"><Input type="date" value={form.receivedDate} onChange={(e)=>setForm(s=>({...s,receivedDate:e.target.value}))} /></Field>
              <div className="sm:col-span-2"><Field label="ملاحظات اختيارية"><Textarea value={form.notes} onChange={(e)=>setForm(s=>({...s,notes:e.target.value}))} /></Field></div>
            </div>
            <Button className="w-full" disabled={createCycle.isPending} onClick={()=>createCycle.mutate()}>حفظ الدورة</Button>
          </DialogContent>
        </Dialog>
      </div>

      <section className="card-elevated border-primary/20 bg-secondary/30 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">الدورة الحالية</p><h2 className="text-lg font-bold">{current ? cycleName(Number(current.month), Number(current.year)) : "لا توجد دورة"}</h2></div>{current ? <CycleStatusBadge status={current.status} /> : null}</div>
        {current && totals ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Mini label="إجمالي الربط" value={formatMoney(totals.target)} />
          <Mini label="تحصيل الفواتير" value={formatMoney(totals.invoices)} />
          <Mini label="نسبة التحصيل" value={totals.percentage == null ? "لم يتم إدخال الربط بعد" : `${totals.percentage.toFixed(1)}%`} />
          <Mini label="الإيرادات الأخرى" value={formatMoney(totals.other)} />
          <Mini label="الإجمالي العام" value={formatMoney(totals.grand)} />
        </div> : <p className="py-8 text-center text-sm text-muted-foreground">أنشئ أول دورة تحصيل لبدء المتابعة</p>}
      </section>

      <div className="card-elevated grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect value={year} setValue={setYear} label="كل السنوات" options={years.map(x=>({value:String(x),label:String(x)}))} />
        <FilterSelect value={month} setValue={setMonth} label="كل الشهور" options={ARABIC_MONTHS.map((x,i)=>({value:String(i+1),label:x}))} />
        <FilterSelect value={branch} setValue={(v)=>{setBranch(v);setArea(ALL);setCollector(ALL)}} label="كل الفروع" options={(options?.branches??[]).map(x=>({value:x.id,label:x.name}))} />
        <FilterSelect value={area} setValue={setArea} label="كل المناطق" options={(options?.areas??[]).filter(x=>branch===ALL||x.branch_id===branch).map(x=>({value:x.id,label:x.name}))} />
        <FilterSelect value={collector} setValue={setCollector} label="كل المحصلين" options={(options?.collectors??[]).filter(x=>branch===ALL||x.branch_id===branch).map(x=>({value:x.id,label:x.full_name}))} />
        <FilterSelect value={cycle} setValue={setCycle} label="كل الدورات" options={allRows.map(x=>({value:x.id??"",label:cycleName(Number(x.month),Number(x.year))}))} />
        <Field label="من تاريخ"><Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></Field>
        <Field label="إلى تاريخ"><Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></Field>
      </div>

      {current && totals ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مبلغ الربط" value={formatMoney(totals.target)} icon={CalendarRange} />
        <StatCard label="متحصلات الفواتير" value={formatMoney(totals.invoices)} icon={ReceiptText} tone="success" />
        <StatCard label="الإيرادات الأخرى" value={formatMoney(totals.other)} icon={WalletCards} tone="accent" />
        <StatCard label="إجمالي المتحصلات" value={formatMoney(totals.grand)} icon={Banknote} />
      </div> : null}

      {change != null ? <div className={`card-elevated flex items-center gap-3 p-4 ${change >= 0 ? "border-success/30" : "border-destructive/30"}`}>
        <div className={change >= 0 ? "flex size-11 items-center justify-center rounded-lg bg-success/15 text-success" : "flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive"}>{change >= 0 ? <ArrowUp /> : <ArrowDown />}</div>
        <div><p className="text-xs text-muted-foreground">مقارنة آخر دورة بالدورة السابقة</p><p className="font-bold">{change >= 0 ? "تحسن" : "انخفاض"} {change > 0 ? "+" : ""}{change.toFixed(1)}%</p></div>
      </div> : null}

      {timeline.length ? <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="نسبة التحصيل الشهرية"><ResponsiveContainer width="100%" height={260}><LineChart data={timeline}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis unit="%"/><Tooltip/><Line type="monotone" dataKey="percentage" stroke="var(--color-primary)" strokeWidth={3}/></LineChart></ResponsiveContainer></ChartPanel>
        <ChartPanel title="متحصلات الفواتير"><ResponsiveContainer width="100%" height={260}><BarChart data={timeline}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="invoices" fill="var(--color-success)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartPanel>
        <ChartPanel title="الإيرادات الأخرى"><ResponsiveContainer width="100%" height={260}><BarChart data={timeline}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="other" fill="var(--color-chart-4)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartPanel>
        <ChartPanel title="إجمالي المتحصلات"><ResponsiveContainer width="100%" height={260}><BarChart data={timeline}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="grand" fill="var(--color-primary)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartPanel>
      </div> : null}

      <section className="card-elevated overflow-hidden"><div className="border-b border-border p-4"><h2 className="font-bold">مقارنة دورات التحصيل</h2></div>
        {isLoading ? <Skeleton className="h-64" /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-secondary/60 text-xs text-muted-foreground"><tr><th className="p-3">الدورة</th><th className="p-3">النطاق</th><th className="p-3">الربط</th><th className="p-3">الفواتير</th><th className="p-3">النسبة</th><th className="p-3">إيرادات أخرى</th><th className="p-3">الإجمالي</th><th className="p-3">الحالة</th><th className="p-3"></th></tr></thead><tbody>
          {allRows.map((row)=>{const t=displayCycleTotals(row);return <tr key={row.id} className="border-t border-border"><td className="p-3 font-semibold">{cycleName(Number(row.month),Number(row.year))}</td><td className="p-3 text-xs">{row.branch_name}<br/><span className="text-muted-foreground">{row.area_name??"كل المناطق"} • {row.collector_name??"دورة عامة"}</span></td><td className="p-3">{formatMoney(t.target)}</td><td className="p-3">{formatMoney(t.invoices)}</td><td className="p-3 font-bold">{t.percentage==null?"لم يُدخل الربط":`${t.percentage.toFixed(1)}%`}</td><td className="p-3">{formatMoney(t.other)}</td><td className="p-3 font-semibold">{formatMoney(t.grand)}</td><td className="p-3"><CycleStatusBadge status={row.status}/></td><td className="p-3"><div className="flex items-center gap-1"><Button asChild variant="ghost" size="icon"><Link to="/admin/collections/$cycleId" params={{cycleId:row.id??""}} aria-label="عرض التفاصيل"><ArrowLeft className="size-4"/></Link></Button>{auth?.role==="admin"&&row.status==="closed"?<Button variant="ghost" size="icon" className="text-destructive" aria-label="حذف الدورة المنتهية" onClick={()=>setToDelete({id:row.id??"",name:cycleName(Number(row.month),Number(row.year))})}><Trash2 className="size-4"/></Button>:null}</div></td></tr>})}
          {!allRows.length?<tr><td colSpan={9} className="p-10 text-center text-muted-foreground">لا توجد دورات تطابق الفلاتر</td></tr>:null}
        </tbody></table></div>}
      </section>

      <Dialog open={!!toDelete} onOpenChange={(o)=>{if(!o)setToDelete(null)}}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>حذف الدورة المنتهية؟</DialogTitle>
            <DialogDescription>
              سيتم حذف دورة {toDelete?.name} وكل عمليات التحصيل والإيرادات الأخرى التابعة لها نهائيًا، ولا يمكن استعادتها.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" disabled={deleteCycle.isPending} onClick={()=>toDelete&&deleteCycle.mutate(toDelete.id)}>
              {deleteCycle.isPending?<Loader2 className="size-4 animate-spin"/>:<Trash2 className="size-4"/>} تأكيد الحذف
            </Button>
            <Button variant="secondary" className="flex-1" onClick={()=>setToDelete(null)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p></div>}
function ChartPanel({title,children}:{title:string;children:React.ReactNode}){return <section className="card-elevated min-w-0 p-4"><h3 className="mb-4 flex items-center gap-2 font-bold"><Gauge className="size-4 text-primary"/>{title}</h3><div dir="ltr" className="h-[260px] w-full text-xs">{children}</div></section>}
function FilterSelect({value,setValue,label,options}:{value:string;setValue:(v:string)=>void;label:string;options:{value:string;label:string}[]}){return <Select value={value} onValueChange={setValue}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{label}</SelectItem>{options.filter(x=>x.value).map(x=><SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>}
