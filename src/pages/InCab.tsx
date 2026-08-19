/**
 * IN-CAB CONSOLE — the driver's side of the two-way fleet channel.
 *
 * Open to every signed-in staff member, but it only ever shows the vehicle the
 * user is the assigned driver of; RLS makes that boundary real.
 */
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
import { Fuel, Gauge, Lock, MessageSquare, Radio, Send, Siren, Truck } from "lucide-react";
import {
  MESSAGE_PRIORITY_CLASSES, MESSAGE_PRIORITY_LABELS, markMessagesRead, sendFleetMessage,
  useFleetMessages, useFleetMessagesRealtime, useMyVehicle, type MessagePriority,
} from "@/hooks/useFleetComms";
import { raisePanic } from "@/hooks/useFleet";
import { MOTION_CLASSES, MOTION_LABELS, motionState, vehicleLabel } from "@/lib/fleet";

export default function InCab() {
  const queryClient = useQueryClient();
  const vehicleQuery = useMyVehicle();
  const vehicle = vehicleQuery.data ?? null;
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("normal");
  const [busy, setBusy] = useState(false);

  useFleetMessagesRealtime(!!vehicle);
  const messagesQuery = useFleetMessages(vehicle?.id ?? null, !!vehicle);
  const messages = messagesQuery.data ?? [];
  const thread = useMemo(() => [...messages].reverse(), [messages]);
  const unreadFromCommand = messages.filter((m) => m.direction === "command_to_driver" && !m.read_at).length;

  // Reading the console counts as receipt for command-issued traffic.
  useEffect(() => {
    if (!vehicle || unreadFromCommand === 0) return;
    markMessagesRead(vehicle.id, "command_to_driver")
      .then(() => queryClient.invalidateQueries({ queryKey: ["fleet", "messages"] }))
      .catch(() => undefined);
  }, [vehicle, unreadFromCommand, queryClient]);

  const send = async () => {
    if (!vehicle || !body.trim()) return;
    setBusy(true);
    try {
      await sendFleetMessage({
        vehicleId: vehicle.id,
        body: body.trim(),
        direction: "driver_to_command",
        priority,
      });
      setBody("");
      setPriority("normal");
      toast({ title: "Message sent to command" });
      queryClient.invalidateQueries({ queryKey: ["fleet", "messages"] });
    } catch (error: any) {
      toast({ title: "Could not send the message", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const sos = async () => {
    if (!vehicle) return;
    setBusy(true);
    try {
      await raisePanic(vehicle.id, "Driver SOS from in-cab console");
      toast({ title: "SOS raised", description: "Command has been alerted." });
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    } catch (error: any) {
      toast({ title: "Could not raise the SOS", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Radio className="h-6 w-6 text-primary" aria-hidden="true" />
          In-Cab Console
        </h1>
        <p className="text-sm text-muted-foreground">
          Message command, receive instructions and raise an emergency from your assigned vehicle.
        </p>
      </header>

      {vehicleQuery.isLoading && <p className="text-sm text-muted-foreground">Loading your vehicle…</p>}

      {!vehicleQuery.isLoading && !vehicle && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You are not currently the assigned driver of a fleet vehicle. Once fleet command assigns you a
            vehicle, its in-cab channel appears here.
          </CardContent>
        </Card>
      )}

      {vehicle && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Truck className="h-5 w-5 text-primary" aria-hidden="true" />
                {vehicleLabel(vehicle)}
                <Badge variant="outline" className={MOTION_CLASSES[motionState(vehicle)]}>
                  {MOTION_LABELS[motionState(vehicle)]}
                </Badge>
                {vehicle.immobilized && (
                  <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                    <Lock className="mr-1 h-3 w-3" aria-hidden="true" />Immobilised
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="flex flex-wrap gap-4">
                <span className="flex items-center gap-1">
                  <Gauge className="h-3 w-3" aria-hidden="true" />
                  {vehicle.last_speed_kph != null ? `${Math.round(Number(vehicle.last_speed_kph))} km/h` : "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Fuel className="h-3 w-3" aria-hidden="true" />
                  {vehicle.last_fuel_level_pct != null ? `${Math.round(Number(vehicle.last_fuel_level_pct))}%` : "—"}
                </span>
                <span>
                  {vehicle.last_seen_at
                    ? `last report ${format(new Date(vehicle.last_seen_at), "dd/MM/yyyy HH:mm")}`
                    : "no report yet"}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vehicle.immobilized && (
                <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  This vehicle has been immobilised by command. Reason: {vehicle.immobilizer_reason ?? "not stated"}.
                  Stop safely and await instructions.
                </p>
              )}
              <ScrollArea className="h-[400px] rounded-md border border-border p-3">
                {thread.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                )}
                <ul className="space-y-3">
                  {thread.map((m) => {
                    const mine = m.direction === "driver_to_command";
                    return (
                      <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                        <div
                          className={`max-w-[85%] rounded-lg border p-3 text-sm ${
                            mine ? "border-primary/30 bg-primary/10" : "border-border bg-muted/60"
                          }`}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {mine ? "You" : m.sender_label ?? "Command"}
                            </span>
                            <span>{format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}</span>
                            {m.priority !== "normal" && (
                              <Badge variant="outline" className={MESSAGE_PRIORITY_CLASSES[m.priority as MessagePriority]}>
                                {MESSAGE_PRIORITY_LABELS[m.priority as MessagePriority]}
                              </Badge>
                            )}
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
                <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                Message command
              </CardTitle>
              <CardDescription>Kept on the vehicle's permanent record.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="incab-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as MessagePriority)}>
                  <SelectTrigger id="incab-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="incab-body">Message</Label>
                <Textarea
                  id="incab-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Status, request or situation report"
                />
              </div>
              <Button className="w-full" onClick={send} disabled={busy || !body.trim()}>
                <Send className="mr-1 h-4 w-4" aria-hidden="true" />
                {busy ? "Sending…" : "Send to command"}
              </Button>
              <Button
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={sos}
                disabled={busy}
              >
                <Siren className="mr-1 h-4 w-4" aria-hidden="true" />
                Raise SOS
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
