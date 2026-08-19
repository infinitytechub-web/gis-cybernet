/** In-cab communications — command side of the two-way driver channel. */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Radio } from "lucide-react";
import {
  MESSAGE_PRIORITY_CLASSES, MESSAGE_PRIORITY_LABELS, markMessagesRead, sendFleetMessage,
  unreadFor, useFleetMessages, type MessagePriority,
} from "@/hooks/useFleetComms";
import { vehicleLabel, type FleetVehicle } from "@/lib/fleet";

interface Props {
  vehicles: FleetVehicle[];
  canManage: boolean;
  initialVehicleId?: string | null;
}

export function FleetCommsTab({ vehicles, canManage, initialVehicleId }: Props) {
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState<string>(initialVehicleId ?? vehicles[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("normal");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vehicleId && vehicles.length) setVehicleId(vehicles[0].id);
  }, [vehicleId, vehicles]);

  const messagesQuery = useFleetMessages(vehicleId || null);
  const messages = messagesQuery.data ?? [];
  const thread = useMemo(() => [...messages].reverse(), [messages]);
  const unreadFromDrivers = unreadFor(messages, "driver_to_command");
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const send = async () => {
    if (!vehicleId || !body.trim()) return;
    setBusy(true);
    try {
      await sendFleetMessage({ vehicleId, body: body.trim(), direction: "command_to_driver", priority });
      setBody("");
      setPriority("normal");
      toast({ title: "Message sent to cab", description: vehicle ? vehicleLabel(vehicle) : undefined });
      queryClient.invalidateQueries({ queryKey: ["fleet", "messages"] });
    } catch (error: any) {
      toast({ title: "Could not send the message", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async () => {
    if (!vehicleId) return;
    try {
      const count = await markMessagesRead(vehicleId, "driver_to_command");
      toast({ title: `${count} message(s) marked read` });
      queryClient.invalidateQueries({ queryKey: ["fleet", "messages"] });
    } catch (error: any) {
      toast({ title: "Could not update receipts", description: error?.message, variant: "destructive" });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
              In-cab channel
            </CardTitle>
            <CardDescription>
              Two-way traffic between command and the driver of {vehicle ? vehicleLabel(vehicle) : "the selected vehicle"}.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {unreadFromDrivers > 0 && (
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground">
                {unreadFromDrivers} unread
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={acknowledge} disabled={unreadFromDrivers === 0}>
              Mark read
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="comms-vehicle">Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="comms-vehicle" className="w-full sm:w-80">
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[420px] rounded-md border border-border p-3">
            {thread.length === 0 && (
              <p className="text-sm text-muted-foreground">No traffic on this channel yet.</p>
            )}
            <ul className="space-y-3">
              {thread.map((m) => {
                const fromCommand = m.direction === "command_to_driver";
                return (
                  <li key={m.id} className={fromCommand ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[85%] rounded-lg border p-3 text-sm ${
                        fromCommand
                          ? "border-primary/30 bg-primary/10"
                          : "border-border bg-muted/60"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {fromCommand ? m.sender_label ?? "Command" : m.sender_label ?? "Driver"}
                        </span>
                        <span>{format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}</span>
                        {m.priority !== "normal" && (
                          <Badge variant="outline" className={MESSAGE_PRIORITY_CLASSES[m.priority as MessagePriority]}>
                            {MESSAGE_PRIORITY_LABELS[m.priority as MessagePriority]}
                          </Badge>
                        )}
                        {!m.read_at && <span className="text-warning-foreground">unread</span>}
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-primary" aria-hidden="true" />
            Send to cab
          </CardTitle>
          <CardDescription>Delivered instantly to the driver's in-cab console.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="comms-priority">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as MessagePriority)}>
              <SelectTrigger id="comms-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-body">Message</Label>
            <Textarea
              id="comms-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Instruction or alert for the driver"
              rows={5}
              maxLength={2000}
            />
          </div>
          <Button className="w-full" onClick={send} disabled={busy || !canManage || !body.trim() || !vehicleId}>
            <Send className="mr-1 h-4 w-4" aria-hidden="true" />
            {busy ? "Sending…" : "Send message"}
          </Button>
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              You do not hold fleet authority to message a cab.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
