import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Plus, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ALLOWED_TYPES, compressReceipt } from "@/lib/image";
import { formatDateTime } from "@/lib/format";
import { ReceiptThumb } from "@/components/app/receipt-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export type PropertyTable = "abandoned_properties" | "demolished_properties";

export type PropertyRow = {
  id: string;
  property_no: string;
  subscriptions: string | null;
  images: string[];
  notes: string | null;
  created_at: string;
};

export function PropertyReportSection({
  table,
  title,
  description,
  subsLabel,
}: {
  table: PropertyTable;
  title: string;
  description: string;
  subsLabel: string;
}) {
  const queryClient = useQueryClient();
  const { data: auth } = useAuth();
  const profile = auth?.profile;
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [propertyNo, setPropertyNo] = useState("");
  const [subscriptions, setSubscriptions] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const list = useQuery({
    queryKey: [table, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, property_no, subscriptions, images, notes, created_at")
        .eq("collector_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PropertyRow[];
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

  function removeImage(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("لم يتم تحميل بيانات الحساب");
      if (!propertyNo.trim()) throw new Error("أدخل رقم العقار");

      const paths: string[] = [];
      for (const file of files) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${profile.id}/${table}/${Date.now()}-${paths.length}.${ext}`;
        const upload = await supabase.storage
          .from("receipts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) {
          if (paths.length) await supabase.storage.from("receipts").remove(paths);
          throw new Error("تعذر رفع الصور");
        }
        paths.push(path);
      }

      const { error } = await supabase.from(table).insert({
        collector_id: profile.id,
        branch_id: profile.branch_id,
        area_id: profile.area_id,
        property_no: propertyNo.trim(),
        subscriptions: subscriptions.trim() || null,
        notes: notes.trim() || null,
        images: paths,
      });
      if (error) {
        if (paths.length) await supabase.storage.from("receipts").remove(paths);
        throw new Error("تعذر حفظ البيانات");
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ بنجاح");
      setPropertyNo("");
      setSubscriptions("");
      setNotes("");
      setFiles([]);
      setPreviews([]);
      queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <form
        className="card-elevated space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="property-no">رقم العقار</Label>
          <Input
            id="property-no"
            className="h-12 text-lg"
            value={propertyNo}
            onChange={(e) => setPropertyNo(e.target.value)}
            placeholder="مثال: 145"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="subs">{subsLabel}</Label>
          <Textarea
            id="subs"
            rows={3}
            value={subscriptions}
            onChange={(e) => setSubscriptions(e.target.value)}
            placeholder="اكتب أرقام الاشتراكات، كل رقم في سطر أو مفصولة بفاصلة"
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
                <img src={src} alt={`صورة العقار ${i + 1}`} className="h-24 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label="حذف الصورة"
                  className="absolute end-1 top-1 rounded-full bg-foreground/70 p-1 text-background"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-14 text-base font-bold"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="size-5" /> تصوير العقار
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 text-base font-bold"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-5" /> اختيار من الملفات
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-notes">ملاحظات (اختياري)</Label>
          <Textarea
            id="report-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <Button type="submit" className="h-14 w-full text-base font-bold" disabled={submit.isPending}>
          {submit.isPending ? <Loader2 className="size-5 animate-spin" /> : <><Plus className="size-5" /> حفظ البيانات</>}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="text-base font-bold">السجل المضاف</h2>
        {list.isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : (list.data ?? []).length === 0 ? (
          <p className="card-elevated p-4 text-sm text-muted-foreground">لا توجد بيانات مضافة بعد.</p>
        ) : (
          (list.data ?? []).map((row) => (
            <div key={row.id} className="card-elevated space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">عقار رقم {row.property_no}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
              </div>
              {row.subscriptions ? (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {subsLabel}: {row.subscriptions}
                </p>
              ) : null}
              {row.notes ? <p className="text-muted-foreground">{row.notes}</p> : null}
              {row.images?.length ? (
                <div className="flex flex-wrap gap-2">
                  {row.images.map((p) => (
                    <ReceiptThumb key={p} path={p} label="صورة العقار" />
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">الحذف يتم من خلال المشرفين فقط.</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
