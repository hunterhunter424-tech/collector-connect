import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { fetchAuthState, useAuth, useSignOut } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const state = await fetchAuthState();
    if (!state) throw redirect({ to: "/" });
    if (!state.isStaff) throw redirect({ to: "/collector/dashboard" });
    return { auth: state };
  },
  component: AdminLayout,
});

const COMPUTER_NAV = [
  { to: "/admin/collections", label: "شاشة التحصيل الكمبيوتر", icon: Gauge, need: null },
] as const;

const NAV = [
  { to: "/admin/dashboard", label: "الرئيسية", icon: LayoutDashboard, need: null },
  { to: "/admin/collectors", label: "المحصلون", icon: Users, need: null },
  { to: "/admin/new-user", label: "إنشاء مستخدم", icon: UserPlus, need: "collectors" },
  { to: "/admin/deposits", label: "التوريدات", icon: ClipboardList, need: null },
  { to: "/admin/branches", label: "الفروع والمناطق", icon: Building2, need: null },
  { to: "/admin/reports", label: "التقارير", icon: BarChart3, need: null },
  { to: "/admin/audit", label: "سجل العمليات", icon: BadgeCheck, need: null },
  { to: "/admin/settings", label: "الإعدادات", icon: Settings2, need: null },
] as const;

type NavItem = {
  to: string;
  label: string;
  icon: typeof Gauge;
  need: string | null;
};

function NavGroup({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: readonly NavItem[];
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[11px] font-bold text-muted-foreground">{title}</p>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeProps={{ className: "bg-primary text-primary-foreground" }}
          inactiveProps={{ className: "text-foreground hover:bg-secondary" }}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { data: auth } = useAuth();
  const items = NAV.filter(
    (item) => !item.need || auth?.permissions[item.need as "collectors"] !== false,
  );
  return (
    <nav className="space-y-5">
      <NavGroup title="شاشة التحصيل الكمبيوتر" items={COMPUTER_NAV} onNavigate={onNavigate} />
      <NavGroup
        title="شاشة التحصيل والتوريد للمحصلين"
        items={items as readonly NavItem[]}
        onNavigate={onNavigate}
      />
    </nav>
  );
}


function AdminLayout() {
  const { data: auth } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: "/admin/deposits", search: { q: query || undefined, status: undefined } });
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 end-0 z-30 hidden w-64 flex-col border-s border-border bg-card p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3">
          <div className="brand-gradient flex size-10 items-center justify-center rounded-xl text-primary-foreground">
            <Wallet className="size-5" />
          </div>
          <div className="text-sm font-bold leading-tight">
            توريدات
            <br />
            المحصلين
          </div>
        </div>
        <NavLinks />
        <div className="mt-auto space-y-3 pt-4">
          <div className="rounded-xl bg-secondary p-3 text-xs">
            <p className="font-semibold">{auth?.profile?.full_name ?? "مدير النظام"}</p>
            <p className="text-muted-foreground">
              {auth?.role === "supervisor" ? "مشرف" : "مدير النظام"}
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="size-4" /> تسجيل الخروج
          </Button>
        </div>
      </aside>

      <div className="lg:me-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="القائمة">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-4">
              <SheetTitle className="mb-4 text-base">القائمة الرئيسية</SheetTitle>
              <NavLinks onNavigate={() => setOpen(false)} />
              <Button variant="outline" className="mt-6 w-full" onClick={signOut}>
                <LogOut className="size-4" /> تسجيل الخروج
              </Button>
            </SheetContent>
          </Sheet>

          <form onSubmit={submitSearch} className="relative flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث: اسم المحصل، اسم المستخدم، الفرع، المنطقة، رقم العملية"
              className="h-10 pe-10"
            />
          </form>
        </header>

        <main className="p-4 pb-16 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
