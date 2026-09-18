import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BackButton({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ms-2 gap-1 text-muted-foreground">
      <Link to={to as never}>
        <ArrowRight className="size-4" /> {label}
      </Link>
    </Button>
  );
}
