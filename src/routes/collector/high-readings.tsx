import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Plus, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ALLOWED_TYPES, compressReceipt } from "@/lib/image";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ReceiptThumb } from "@/components/app/receipt-image";
import { BackButton } from "@/components/app/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/collector/high-readings")({
  head: () => ({
    meta: [
      { title: "القراءات العالية | توريدات المحصلين" },
      { name: "description", content: "تسجيل أرقام الاشتراكات ذات القراءات العالية لمراجعتها آخر الشهر." },
      { property: "og:title", content: "القراءات العالية | توريدات المحصلين" },
      { property: "og:description", content: "تسجيل القراءات العالية لمراجعتها آخر كل شهر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HighReadingsPage,
});

type Row = {
  id: string;
  subscription_no: string;
  reading: number;
  notes: string | null;
  images: string[];
  reviewed: boolean;
  created_at: string;
};

function HighReadingsPage() {
  const queryClient = useQueryClient();
  const { data: auth } = useAuth();
  const profile = auth?.profile;
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [subscriptionNo, setSubscriptionNo] = useState("");
  const [reading, setReading] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const list = useQuery({
    queryKey: ["high_readings", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("high_readings")
        .select("id, subscription_no, reading, notes, images, reviewed, created_at")
        .eq("collector_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function pickFiles(input: FileList | null) {
    if (!input?.length) return;
    for (const raw of Array.from(input)) {
      if (!ALLOWED_TYPES.includes(raw.type.toLowerCase())) {
        toast.error("الصور المسموحة: JPG أو PNG أو WEBP فقط");
        continue;
      }
      try {
        const compressed = await compressReceipt(raw);
        setFiles((prev) => [...prev, compressed]);
        setPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
      } catch {
        toast.error("تعذر معالجة الصورة، حاول مرة أخرى");
      }
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("لم يتم تحميل بيانات الحساب");
      if (!subscriptionNo.trim()) throw new Error("أدخل رقم الاشتراك");
      const value = Number(reading);
      if (!Number.isFinite(value) || value <= 0) throw new Error("أدخل القراءة العالية بشكل صحيح");

      const paths: string[] = [];
      for (const file of files) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${profile.id}/high_readings/${Date.now()}-${paths.length}.${ext}`;
        const upload = await supabase.storage
          .from("receipts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) {
          if (paths.length) await supabase.storage.from("receipts").remove(paths);
          throw new Error("تعذر رفع الصور");
        }
        paths.push(path);
      }

      const { error } = await supabase.from("high_readings").insert({
        collector_id: profile.id,
        branch_id: profile.branch_id,
        area_id: profile.area_id,
        subscription_no: subscriptionNo.trim(),
        reading: value,
        notes: notes.trim() || null,
        images: paths,
      });
      if (error) {
        if (paths.length) await supabase.storage.from("receipts").remove(paths);
        throw new Error("تعذر حفظ القراءة");
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ القراءة بنجاح");
      setSubscriptionNo("");
      setReading("");
      setNotes("");
      setFiles([]);
      setPreviews([]);
      queryClient.invalidateQueries({ queryKey: ["high_readings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <BackButton to="/collector/dashboard" label="رجوع" />
      <div>
        <h1 className="text-xl font-bold">القراءات العالية</h1>
        <p className="text-sm text-muted-foreground">
          أضف رقم الاشتراك والقراءة العالية لمراجعتها آخر كل شهر. الحذف من خلال المشرفين فقط.
        </p>
      </div>

      <form
        className="card-elevated space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="sub-no">رقم الاشتراك</Label>
          <Input
            id="sub-no"
            className="h-12 text-lg"
            value={subscriptionNo}
            onChange={(e) => setSubscriptionNo(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reading">القراءة العالية</Label>
          <Input
            id="reading"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="h-12 text-lg"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
          />
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />

        {previews.length ? (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative overflow-hidden rounded-xl border border-border">
                <img src={src} alt={`صورة القراءة ${i + 1}`} className="h-24 w-full object-cover" />
                <button
                  type="button"
                  aria-label="حذف الصورة"
                  onClick={() => {
                    setFiles((prev) => prev.filter((_, idx) => idx !== i));
                    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                  className="absolute end-1 top-1 rounded-full bg-foreground/70 p-1 text-background"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" className="h-14 text-base font-bold" onClick={() => cameraRef.current?.click()}>
            <Camera className="size-5" /> تصوير العداد
          </Button>
          <Button type="button" variant="outline" className="h-14 text-base font-bold" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-5" /> اختيار من الملفات
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hr-notes">ملاحظات (اختياري)</Label>
          <Textarea id="hr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button type="submit" className="h-14 w-full text-base font-bold" disabled={submit.isPending}>
          {submit.isPending ? <Loader2 className="size-5 animate-spin" /> : <><Plus className="size-5" /> حفظ القراءة</>}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="text-base font-bold">القراءات المسجلة</h2>
        {list.isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : (list.data ?? []).length === 0 ? (
          <p className="card-elevated p-4 text-sm text-muted-foreground">لا توجد قراءات مسجلة بعد.</p>
        ) : (
          (list.data ?? []).map((row) => (
            <div key={row.id} className="card-elevated space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">اشتراك {row.subscription_no}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                <span className="text-muted-foreground">القراءة</span>
                <span className="font-semibold">{formatNumber(row.reading)}</span>
              </div>
              {row.notes ? <p className="text-muted-foreground">{row.notes}</p> : null}
              {row.images?.length ? (
                <div className="flex flex-wrap gap-2">
                  {row.images.map((p) => (
                    <ReceiptThumb key={p} path={p} label="صورة القراءة" />
                  ))}
                </div>
              ) : null}
              <span
                className={
                  row.reviewed
                    ? "inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    : "inline-block rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground"
                }
              >
                {row.reviewed ? "تمت المراجعة" : "في انتظار المراجعة"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
