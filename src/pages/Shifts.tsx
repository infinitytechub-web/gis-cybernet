import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

export default function Shifts() {
  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shifts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-secondary">Office Shifts</h1>
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {shifts.map((s) => (
            <Card key={s.id} className="border-border/50">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{s.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant="secondary">{s.pattern}</Badge>
                {s.start_time && s.end_time && (
                  <p className="text-sm text-muted-foreground">{s.start_time} — {s.end_time}</p>
                )}
                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              </CardContent>
            </Card>
          ))}
          {shifts.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">No shifts configured</p>}
        </div>
      )}
    </div>
  );
}
