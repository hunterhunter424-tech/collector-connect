import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ALLOWED_TYPES, compressReceipt } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/collector/new-deposit")({
  head: () => ({
    meta: [
      { title: "إضافة توريد جديد | توريدات المحصلين" },
      { name: "description", content: "تصوير إيصال التوريد وإدخال عدد الفواتير والمبلغ." },
      { property: "og:title", content: "إضافة توريد جديد | توريدات المحصلين" },
      { property: "og:description", content: "تصوير الإيصال وتسجيل التوريد." },
    ],
  }),
  component: NewDepositPage,
});

function NewDepositPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: auth } = useAuth();
  const profile = auth?.profile;
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [invoices, setInvoices] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [areaId, setAreaId] = useState("");

  const myAreas = profile?.areas ?? [];
  const multiArea = myAreas.length > 1;
  const selectedArea = areaId || profile?.area_id || myAreas[0]?.id || "";

  async function pickFile(input: File | null) {
    if (!input) return;
    if (!ALLOWED_TYPES.includes(input.type)) {
      toast.error("الصور المسموحة: JPG أو PNG أو WEBP فقط");
      return;
    }
    try {
      const compressed = await compressReceipt(input);
      setFile(compressed);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      toast.error("تعذر معالجة الصورة، حاول مرة أخرى");
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("لم يتم تحميل بيانات الحساب");
      if (!file) throw new Error("صورة إيصال التوريد مطلوبة");
      const rawInvoices = invoices.trim();
      const count = rawInvoices === "" ? 0 : Number(rawInvoices);
      const value = Number(amount);
      if (!Number.isFinite(count) || count < 0) throw new Error("أدخل عدد فواتير صحيح أو اتركه فارغًا");
      if (!Number.isFinite(value) || value <= 0) throw new Error("أدخل مبلغًا صحيحًا");
      if (multiArea && !selectedArea) throw new Error("اختر المنطقة التي تورّد عنها");

      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const upload = await supabase.storage
        .from("receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error("تعذر رفع صورة الإيصال");

      const { error } = await supabase.from("deposits").insert({
        collector_id: profile.id,
        area_id: selectedArea || null,
        invoices_count: count,
        amount: value,
        receipt_image_url: path,
        notes: notes.trim() || null,
      });
      if (error) {
        await supabase.storage.from("receipts").remove([path]);
        throw new Error("تعذر تسجيل التوريد");
      }
    },
    onSuccess: () => {
      toast.success("تم تسجيل التوريد بنجاح");
      queryClient.invalidateQueries();
      navigate({ to: "/collector/my-deposits" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">إضافة توريد جديد</h1>
        <p className="text-sm text-muted-foreground">
          {multiArea
            ? "التاريخ والوقت والفرع تُسجل تلقائيًا، واختر المنطقة التي تورّد عنها."
            : "التاريخ والوقت والفرع والمنطقة تُسجل تلقائيًا من حسابك."}
        </p>
      </div>

      <div className="card-elevated space-y-2 p-4 text-sm">
        <Row label="اسم المحصل" value={profile?.full_name ?? "-"} />
        <Row label="الفرع" value={profile?.branch_name ?? "-"} />
        {multiArea ? (
          <div className="space-y-2 rounded-lg bg-secondary/60 px-3 py-2">
            <Label htmlFor="area">المنطقة</Label>
            <Select value={selectedArea} onValueChange={setAreaId}>
              <SelectTrigger id="area" className="h-11 bg-background">
                <SelectValue placeholder="اختر المنطقة" />
              </SelectTrigger>
              <SelectContent>
                {myAreas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Row label="المنطقة" value={profile?.area_name ?? myAreas[0]?.name ?? "-"} />
        )}
      </div>


      <form
        className="card-elevated space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

        {preview ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="block w-full overflow-hidden rounded-xl border border-border"
          >
            <img src={preview} alt="معاينة إيصال التوريد" className="w-full" />
          </button>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={preview ? "outline" : "default"}
            className="h-16 w-full text-base font-bold"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="size-6" />
            {preview ? "تصوير من جديد" : "تصوير الإيصال"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-16 w-full text-base font-bold"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-6" />
            اختيار من الملفات
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoices">عدد الفواتير (اختياري)</Label>
          <Input
            id="invoices"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="اتركه فارغًا لو مش متوفر"
            className="h-12 text-lg"
            value={invoices}
            onChange={(e) => setInvoices(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">المبلغ</Label>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="h-12 text-lg"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">ملاحظات (اختياري)</Label>
          <Textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أي ملاحظة تخص هذا التوريد"
          />
        </div>

        <Button type="submit" className="h-14 w-full text-base font-bold" disabled={submit.isPending}>
          {submit.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <Send className="size-5" /> تسجيل التوريد
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
