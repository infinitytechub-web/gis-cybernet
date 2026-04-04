import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { format, isPast, isFuture, isToday } from "date-fns";
import { toast } from "sonner";

export default function Holidays() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [recurring, setRecurring] = useState(false);

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("*").order("date");
      if (error) throw error;
      return data;
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDate("");
    setRecurring(false);
    setDialogOpen(true);
  };

  const openEdit = (h: any) => {
    setEditing(h);
    setName(h.name);
    setDate(h.date);
    setRecurring(h.recurring);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !date) throw new Error("Name and date are required");
      const payload = { name: name.trim(), date, recurring };
      if (editing) {
        const { error } = await supabase.from("holidays").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("holidays").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setDialogOpen(false);
      toast.success(editing ? "Holiday updated" : "Holiday added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upcoming = holidays.filter((h) => isFuture(new Date(h.date)) || isToday(new Date(h.date))).length;

  const dateStatus = (d: string) => {
    const hDate = new Date(d);
    if (isToday(hDate)) return "bg-primary/10 text-primary font-semibold";
    if (isPast(hDate)) return "text-muted-foreground";
    return "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Holidays</h1>
          <p className="text-sm text-muted-foreground">{holidays.length} holidays · {upcoming} upcoming</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> Add Holiday
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holiday</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Day</TableHead>
                <TableHead>Recurring</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">No holidays configured</TableCell>
                </TableRow>
              ) : (
                holidays.map((h) => (
                  <TableRow key={h.id} className={dateStatus(h.date)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium">{h.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(h.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{format(new Date(h.date), "EEEE")}</TableCell>
                    <TableCell>
                      <Badge variant={h.recurring ? "default" : "secondary"} className="text-xs">
                        {h.recurring ? "Yearly" : "One-time"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(h)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{h.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>This holiday will be permanently removed.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(h.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Holiday Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Independence Day" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={recurring} onCheckedChange={setRecurring} id="recurring" />
              <Label htmlFor="recurring">Recurring every year</Label>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim() || !date} className="w-full">
              {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Add Holiday"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
