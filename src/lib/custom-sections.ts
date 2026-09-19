export type FieldKey =
  | "property_no"
  | "address"
  | "subscriptions"
  | "subscription_no"
  | "previous_reading"
  | "current_reading"
  | "reading"
  | "notes"
  | "images";

export type FieldKind = "text" | "textarea" | "number" | "images";

export type FieldDef = {
  key: FieldKey;
  label: string;
  kind: FieldKind;
  placeholder?: string;
};

export const FIELD_CATALOG: FieldDef[] = [
  { key: "property_no", label: "رقم العقار", kind: "text", placeholder: "مثال: 145" },
  { key: "address", label: "عنوان العقار", kind: "textarea", placeholder: "الشارع والعلامة المميزة" },
  { key: "subscriptions", label: "الاشتراكات الموجودة", kind: "textarea", placeholder: "أرقام الاشتراكات" },
  { key: "subscription_no", label: "رقم الاشتراك", kind: "text", placeholder: "مثال: 1023456" },
  { key: "previous_reading", label: "القراءة السابقة", kind: "number" },
  { key: "current_reading", label: "القراءة الحالية", kind: "number" },
  { key: "reading", label: "القراءة", kind: "number" },
  { key: "notes", label: "ملاحظات", kind: "textarea" },
  { key: "images", label: "الصور", kind: "images" },
];

export function fieldDef(key: string): FieldDef | undefined {
  return FIELD_CATALOG.find((f) => f.key === key);
}

export type CustomSection = {
  id: string;
  name: string;
  description: string | null;
  fields: FieldKey[];
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type CustomSectionEntry = {
  id: string;
  section_id: string;
  collector_id: string;
  values: Record<string, string | number | null>;
  images: string[];
  created_at: string;
  profiles?: { full_name: string } | null;
};

export function parseSection(row: Record<string, unknown>): CustomSection {
  const raw = row['fields'];
  const fields = (Array.isArray(raw) ? raw : []).filter((k): k is FieldKey => !!fieldDef(String(k)));
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string | null) ?? null,
    fields,
    active: row['active'] as boolean,
    sort_order: (row['sort_order'] as number) ?? 0,
    created_at: row['created_at'] as string,
  };
}

export function readingDiff(values: Record<string, string | number | null>): number | null {
  const prev = Number(values['previous_reading']);
  const cur = Number(values['current_reading']);
  if (!Number.isFinite(prev) || !Number.isFinite(cur)) return null;
  return cur - prev;
}
