import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const db = supabase as any;

export function OfficerStoresPanel() {
  const { data: issuance = [], isLoading } = useQuery({
    queryKey: ["command-portal-my-store-issuance"],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_store_issuance");
      if (error) throw error;
      return data ?? [];
    },
  });
  const open = issuance.filter((row: any) => !row.returned_at);
  return <div className="space-y-4"><div><h2 className="text-lg font-semibold">My stores report</h2><p className="text-sm text-muted-foreground">Items issued to your account only.</p></div><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Issued items <Badge variant="secondary">{open.length} open</Badge></CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Quantity</TableHead><TableHead>Issued</TableHead><TableHead>Returned</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>
    {isLoading ? <TableRow><TableCell colSpan={5}>Loading issued items…</TableCell></TableRow> : issuance.map((row: any) => <TableRow key={row.id}><TableCell className="font-medium">{row.item_name}</TableCell><TableCell>{Number(row.quantity)} {row.unit}</TableCell><TableCell>{format(new Date(row.issued_at), "dd/MM/yyyy")}</TableCell><TableCell>{row.returned_at ? format(new Date(row.returned_at), "dd/MM/yyyy") : <Badge>Open</Badge>}</TableCell><TableCell>{row.notes || "—"}</TableCell></TableRow>)}
    {!isLoading && issuance.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No store items have been issued to you.</TableCell></TableRow>}
  </TableBody></Table></CardContent></Card></div>;
}