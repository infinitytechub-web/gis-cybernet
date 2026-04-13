import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSearch, Stamp, FileText, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ProcessingQueueWidget() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["processing-queue-counts"],
    queryFn: async () => {
      const [visaRes, extRes, passRes] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "processing"]),
      ]);
      return {
        visa: visaRes.count ?? 0,
        extensions: extRes.count ?? 0,
        passport: passRes.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  if (!data) return null;
  const total = data.visa + data.extensions + data.passport;
  if (total === 0) return null;

  const queues = [
    { label: "Visa Apps", count: data.visa, icon: Stamp, color: "text-blue-600 dark:text-blue-400", tab: "visa" },
    { label: "Extensions", count: data.extensions, icon: FileText, color: "text-purple-600 dark:text-purple-400", tab: "extensions" },
    { label: "Passports", count: data.passport, icon: BookOpen, color: "text-emerald-600 dark:text-emerald-400", tab: "passport" },
  ];

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Processing Queue
          <Badge variant="outline" className="ml-auto text-[10px]">{total} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {queues.filter(q => q.count > 0).map((q) => (
            <button
              key={q.label}
              onClick={() => navigate("/processing")}
              className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:border-primary/50 transition-colors cursor-pointer"
            >
              <q.icon className={`h-6 w-6 ${q.color}`} />
              <div className="text-left">
                <div className="text-xl font-bold">{q.count}</div>
                <div className="text-xs text-muted-foreground">{q.label}</div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}