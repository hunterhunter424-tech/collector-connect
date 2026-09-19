import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Plus, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ALLOWED_TYPES, compressReceipt } from "@/lib/image";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  fieldDef,
  parseSection,
  readingDiff,
  type CustomSection,
  type CustomSectionEntry,
} from "@/lib/custom-sections";
import { ReceiptThumb } from "@/components/app/receipt-image";
import { BackButton } from "@/components/app/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/collector/section/$sectionId")({
  head: () => ({
    meta: [
      { title: "قسم إضافي | توريدات المحصلين" },
      { name: "description", content: "تسجيل بيانات القسم الإضافي الذي أضافته الإدارة." },
      { property: "og:title", content: "قسم إضافي | توريدات المحصلين" },
      { property: "og:description", content: "تسجيل بيانات القسم الإضافي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SectionPage,
});

function SectionPage() {
  const { sectionId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: auth } = useAuth();
  const profile = auth?.profile;
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const section = useQuery({
    queryKey: ["custom-section", sectionId],
    queryFn: async (): Promise<CustomSection | null> => {
      const { data, error } = await supabase
        .from("custom_sections")
        .select("id, name, description, fields, active, sort_order, created_at")
        .eq("id", sectionId)
        .maybeSingle();
      if (error) throw error;
      return data ? parseSection(data as Record<string, unknown>) : null;
    },
  });

  const list = useQuery({
    queryKey: ["custom-section-entries", sectionId, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_section_entries")
        .select("id, section_id, collector_id, values, images, created_at")
        .eq("section_id", sectionId)
        .eq("collector_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomSectionEntry[];
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
      const fields = section.data?.fields ?? [];
      const dataValues: Record<string, string | number | null> = {};
      let hasValue = false;
      for (const key of fields) {
        if (key === "images") continue;
        const def = fieldDef(key);
        const raw = (values[key] ?? "").trim();
        if (!raw) {
          dataValues[key] = null;
          continue;
        }
        hasValue = true;
        dataValues[key] = def?.kind === "number" ? Number(raw) : raw;
      }
      if (!hasValue && !files.length) throw new Error("أدخل بيانات القسم أولاً");

      const paths: string[] = [];
      for (const file of files) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${profile.id}/custom-sections/${sectionId}/${Date.now()}-${paths.length}.${ext}`;
        const upload = await supabase.storage
          .from("receipts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) {
          if (paths.length) await supabase.storage.from("receipts").remove(paths);
          throw new Error("تعذر رفع الصور");
        }
        paths.push(path);
      }

      const { error } = await supabase.from("custom_section_entries").insert({
        section_id: sectionId,
        collector_id: profile.id,
        branch_id: profile.branch_id,
        area_id: profile.area_id,
        values: dataValues,
        images: paths,
      });
      if (error) {
        if (paths.length) await supabase.storage.from("receipts").remove(paths);
        throw new Error("تعذر حفظ البيانات");
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ بنجاح");
      setValues({});
      setFiles([]);
      setPreviews([]);
      queryClient.invalidateQueries({ queryKey: ["custom-section-entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (section.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!section.data || !section.data.active)
    return (
      <div className="space-y-4" dir="rtl">
        <BackButton to="/collector/dashboard" label="رجوع" />
        <p className="card-elevated p-4 text-sm text-muted-foreground">هذا القسم غير متاح حاليًا.</p>
      </div>
    );

  const fields = section.data.fields;
  const showImages = fields.includes("images");

  return (
    <div className="space-y-5" dir="rtl">
      <BackButton to="/collector/dashboard" label="رجوع" />
      <div>
        <h1 className="text-xl font-bold">{section.data.name}</h1>
        {section.data.description ? (
          <p className="text-sm text-muted-foreground">{section.data.description}</p>
        ) : null}
      </div>

      <form
        className="card-elevated space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {fields
          .filter((key) => key !== "images")
          .map((key) => {
            const def = fieldDef(key)!;
            return (
              <div key={key} className="space-y-2">
                <Label htmlFor={`f-${key}`}>{def.label}</Label>
                {def.kind === "textarea" ? (
                  <Textarea
                    id={`f-${key}`}
                    rows={3}
                    value={values[key] ?? ""}
                    placeholder={def.placeholder}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`f-${key}`}
                    className="h-12 text-lg"
                    inputMode={def.kind === "number" ? "decimal" : "text"}
                    type={def.kind === "number" ? "number" : "text"}
                    step="any"
                    value={values[key] ?? ""}
                    placeholder={def.placeholder}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}

        {fields.includes("previous_reading") && fields.includes("current_reading") ? (
          <div className="rounded-xl bg-secondary p-3 text-sm font-bold">
            فرق القراءة:{" "}
            {(() => {
              const diff = readingDiff({
                previous_reading: values['previous_reading'] ?? "",
                current_reading: values['current_reading'] ?? "",
              });
              return diff == null ? "-" : formatNumber(diff);
            })()}
          </div>
        ) : null}

        {showImages ? (
          <>
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
                    <img src={src} alt={`صورة ${i + 1}`} className="h-24 w-full object-cover" />
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
              <Button
                type="button"
                variant="outline"
                className="h-14 text-base font-bold"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="size-5" /> تصوير
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
          </>
        ) : null}

        <Button type="submit" className="h-14 w-full text-base font-bold" disabled={submit.isPending}>
          {submit.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <Plus className="size-5" /> حفظ البيانات
            </>
          )}
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
                <span className="font-bold">{section.data!.name}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
              </div>
              {fields
                .filter((key) => key !== "images")
                .map((key) => {
                  const value = row.values?.[key];
                  if (value === null || value === undefined || value === "") return null;
                  return (
                    <p key={key} className="whitespace-pre-wrap text-muted-foreground">
                      {fieldDef(key)!.label}: {String(value)}
                    </p>
                  );
                })}
              {row.images?.length ? (
                <div className="flex flex-wrap gap-2">
                  {row.images.map((p) => (
                    <ReceiptThumb key={p} path={p} label="صورة مرفقة" />
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
