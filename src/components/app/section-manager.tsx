import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, Loader2, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { FIELD_CATALOG, parseSection, type CustomSection, type FieldKey } from "@/lib/custom-sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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

export function useCustomSections(onlyActive = false) {
  return useQuery({
    queryKey: ["custom-sections", onlyActive],
    queryFn: async (): Promise<CustomSection[]> => {
      let query = supabase
        .from("custom_sections")
        .select("id, name, description, fields, active, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (onlyActive) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => parseSection(row as Record<string, unknown>));
    },
  });
}

export function SectionManager() {
  const queryClient = useQueryClient();
  const sections = useCustomSections();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldKey[]>(["property_no", "images"]);
  const [target, setTarget] = useState<CustomSection | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["custom-sections"] });
    queryClient.invalidateQueries({ queryKey: ["custom-section"] });
  }

  const create = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2) throw new Error("اكتب اسم القسم");
      if (!fields.length) throw new Error("اختر البيانات التي ستظهر في القسم");
      const { error } = await supabase.from("custom_sections").insert({
        name: name.trim(),
        description: description.trim() || null,
        fields,
        sort_order: (sections.data?.length ?? 0) + 1,
      });
      if (error) throw new Error("تعذر إضافة القسم");
    },
    onSuccess: () => {
      toast.success("تم إضافة القسم");
      setName("");
      setDescription("");
      setFields(["property_no", "images"]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (row: CustomSection) => {
      const { error } = await supabase
        .from("custom_sections")
        .update({ active: !row.active })
        .eq("id", row.id);
      if (error) throw new Error("تعذر تحديث القسم");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: CustomSection) => {
      const { data: entries } = await supabase
        .from("custom_section_entries")
        .select("images")
        .eq("section_id", row.id);
      const paths = ((entries ?? []) as { images: string[] }[]).flatMap((e) => e.images ?? []);
      if (paths.length) await supabase.storage.from("receipts").remove(paths);
      const { error } = await supabase.from("custom_sections").delete().eq("id", row.id);
      if (error) throw new Error("تعذر حذف القسم");
    },
    onSuccess: () => {
      toast.success("تم حذف القسم وبياناته");
      setTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-elevated space-y-4 p-5" dir="rtl">
      <div className="flex items-center gap-2">
        <LayoutGrid className="size-5 text-primary" />
        <div>
          <h2 className="text-base font-bold">أقسام المحصلين</h2>
          <p className="text-sm text-muted-foreground">
            أضف قسمًا جديدًا للمحصلين واختر البيانات التي يسجلونها فيه، أو أوقفه أو احذفه.
          </p>
        </div>
      </div>

      <form
        className="space-y-3 rounded-2xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="section-name">اسم القسم</Label>
            <Input
              id="section-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: العقارات المغلقة"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section-desc">وصف مختصر (اختياري)</Label>
            <Input
              id="section-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="يظهر للمحصل أعلى القسم"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>البيانات التي تظهر في القسم</Label>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {FIELD_CATALOG.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-2 rounded-xl border border-border p-2.5 text-sm"
              >
                <Checkbox
                  checked={fields.includes(field.key)}
                  onCheckedChange={(checked) =>
                    setFields((prev) =>
                      checked ? [...prev, field.key] : prev.filter((k) => k !== field.key),
                    )
                  }
                />
                {field.label}
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" className="h-12 w-full font-bold" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Plus className="size-4" /> إضافة القسم
            </>
          )}
        </Button>
      </form>

      <div className="space-y-2">
        {sections.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : (sections.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أقسام مضافة.</p>
        ) : (
          (sections.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3 text-sm"
            >
              <div>
                <p className="font-bold">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.fields.map((k) => FIELD_CATALOG.find((f) => f.key === k)?.label).join(" • ")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={row.active} onCheckedChange={() => toggle.mutate(row)} />
                  {row.active ? "ظاهر للمحصلين" : "موقوف"}
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setTarget(row)}
                >
                  <Trash2 className="size-4" /> حذف
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القسم</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف القسم وكل البيانات والصور المسجلة فيه نهائيًا.
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
    </section>
  );
}
