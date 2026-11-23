import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/date-format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AdminHrHistory({ module, id, onClose }: { module: string; id: string; onClose: () => void }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["admin-hr-history", module, id, user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_hr_record_history", { _module: module, _id: id });
    if (error) throw error;
    return data as unknown as { id: string; action: string; actor: string; created_at: string; reason: string }[];
  } });
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Record history</DialogTitle></DialogHeader>
    {query.isLoading && <p role="status">Loading history…</p>}{query.isError && <div role="alert">History could not be loaded. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>}
    {query.data?.length === 0 && <p className="text-muted-foreground">No changes recorded.</p>}
    {query.data?.map(event => <div key={event.id} className="space-y-1 border-b py-3 text-sm"><p className="font-medium capitalize">{event.action} · {event.actor || "Administrator"}</p><p className="text-muted-foreground">{formatDateTime(event.created_at)}</p><p className="whitespace-pre-wrap">{event.reason}</p></div>)}
  </DialogContent></Dialog>;
}