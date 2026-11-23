import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useRbac } from "@/hooks/useRbac";
import { Landmark, GraduationCap, ClipboardCheck } from "lucide-react";

export function AdminHrHeader({ title }: { title: string }) {
  const rbac = useRbac();
  return <header className="space-y-3"><h1 className="text-2xl font-semibold">{title}</h1><nav aria-label="Personnel administration" className="flex flex-wrap gap-2">
    {[{ key: "payroll-admin", path: "/admin/payroll", label: "Payroll", icon: Landmark }, { key: "training-admin", path: "/admin/training", label: "Training records", icon: GraduationCap }, { key: "performance-admin", path: "/admin/performance", label: "Performance reviews", icon: ClipboardCheck }].filter(item => rbac.can(item.key)).map(item => <Button key={item.key} asChild variant={item.label === title ? "default" : "outline"} size="sm"><Link to={item.path}><item.icon className="mr-2 h-4 w-4" />{item.label}</Link></Button>)}
  </nav></header>;
}