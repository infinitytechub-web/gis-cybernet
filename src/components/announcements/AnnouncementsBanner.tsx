import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Megaphone, Plus, Globe, Building2, Trash2, AlertTriangle, Info, Bell } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

const priorityConfig = {
  urgent: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  important: { icon: Bell, color: "text-warning", bg: "bg-warning/10 border-warning/30" },
  normal: { icon: Info, color: "text-info", bg: "bg-info/10 border-info/30" },
};

export function AnnouncementsBanner() {
  const { isAdminOrSupervisor, user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("normal");
  const [deptId, setDeptId] = useState<string>("global");

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements", "history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*, departments(name)")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
    enabled: isAdminOrSupervisor,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("announcements").insert({
        title,
        content,
        priority,
        department_id: deptId === "global" ? null : deptId,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement posted");
      setOpen(false);
      setTitle("");
      setContent("");
      setPriority("normal");
      setDeptId("global");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (announcements.length === 0 && !isAdminOrSupervisor) return null;

  return (
    <Card className="border-destructive/40 bg-white text-destructive">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-bold tracking-tight text-sm flex items-center gap-2 text-destructive">
            <Megaphone className="h-4 w-4 text-destructive" />
            Announcements
            {announcements.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] h-4 border-destructive/40 text-destructive bg-transparent">
                {announcements.length}
              </Badge>
            )}
          </CardTitle>
          {isAdminOrSupervisor && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <Plus className="h-3 w-3" /> New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Post Announcement</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <Textarea placeholder="Announcement content..." value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="important">Important</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={deptId} onValueChange={setDeptId}>
                      <SelectTrigger><SelectValue placeholder="Audience" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">All Staff</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => createMutation.mutate()}
                    disabled={!title.trim() || !content.trim() || createMutation.isPending}
                  >
                    Post Announcement
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {announcements.length === 0 ? (
          <p className="text-xs text-destructive/80 text-center py-2">No active announcements</p>
        ) : (
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-2">
              {announcements.length > 5 && (
                <p className="text-[10px] text-destructive/70 text-center pb-1 border-b border-destructive/20 mb-1">
                  Scroll for older announcements ({announcements.length} total)
                </p>
              )}
              {announcements.map((a: any) => {
                const cfg = priorityConfig[a.priority as keyof typeof priorityConfig] || priorityConfig.normal;
                const Icon = cfg.icon;
                return (
                  <div key={a.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-destructive">{a.title}</span>
                            <Badge variant="outline" className="text-[10px] h-4 gap-1 border-destructive/40 text-destructive bg-transparent">
                              {a.department_id ? (
                                <><Building2 className="h-2.5 w-2.5" />{(a as any).departments?.name}</>
                              ) : (
                                <><Globe className="h-2.5 w-2.5" />All Staff</>
                              )}
                            </Badge>
                          </div>
                          <p className="text-xs font-bold text-destructive mt-1">{a.content}</p>
                          <p className="text-[10px] mt-1 text-[hsl(210_70%_25%)]">{format(new Date(a.created_at), "dd/MM/yyyy, HH:mm")}</p>
                        </div>
                      </div>
                      {isAdminOrSupervisor && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete announcement?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this announcement. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(a.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
