import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { AssetQrCode } from "./AssetQrCode";
import { printAssetLabel } from "./AssetLabelPrint";
import {
  Printer,
  Tag,
  MapPin,
  AlertTriangle,
  Wrench,
  CalendarClock,
  History,
  Package,
  Loader2,
  QrCode,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

interface Item {
  id: string;
  asset_tag: string | null;
  name: string;
  sku: string | null;
  unit: string;
  qty_on_hand: number | string;
  min_stock: number | string;
  unit_cost: number | string;
  location: string | null;
  condition: string | null;
  notes: string | null;
  photo_url: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_expires: string | null;
  inventory_categories?: { name: string } | null;
}

interface Props {
  item: Item | null;
  onOpenChange: (open: boolean) => void;
}

export function ItemDetailDrawer({ item, onOpenChange }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPhotoUrl(null);
    if (!item?.photo_url) return;
    (async () => {
      if (item.photo_url!.startsWith("http")) {
        if (active) setPhotoUrl(item.photo_url);
        return;
      }
      const { data } = await supabase.storage
        .from("inventory-photos")
        .createSignedUrl(item.photo_url!, 60 * 60);
      if (active) setPhotoUrl(data?.signedUrl ?? null);
    })();
    return () => {
      active = false;
    };
  }, [item?.photo_url]);

  const { data: movements = [], isLoading: movLoading } = useQuery({
    queryKey: ["item-movements", item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, movement_type, quantity, reference, notes, movement_date")
        .eq("item_id", item!.id)
        .order("movement_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const qty = Number(item?.qty_on_hand ?? 0);
  const min = Number(item?.min_stock ?? 0);
  const cost = Number(item?.unit_cost ?? 0);
  const value = qty * cost;
  const out = qty <= 0;
  const low = !out && min > 0 && qty <= min;

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-primary" /> {item.name}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {item.asset_tag ?? "No asset tag"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              {/* Photo + QR */}
              <div className="grid grid-cols-2 gap-3">
                <div className="aspect-square rounded-lg border overflow-hidden bg-muted/30 flex items-center justify-center">
                  {photoUrl ? (
                    <img src={photoUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="aspect-square rounded-lg border bg-card flex flex-col items-center justify-center gap-2 p-2">
                  {item.asset_tag ? (
                    <>
                      <AssetQrCode value={item.asset_tag} size={140} />
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {item.asset_tag}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No tag</span>
                  )}
                </div>
              </div>

              {/* Action row */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!item.asset_tag}
                  onClick={() =>
                    printAssetLabel({
                      asset_tag: item.asset_tag!,
                      name: item.name,
                      category: item.inventory_categories?.name ?? null,
                      location: item.location,
                      serial_number: item.serial_number,
                    })
                  }
                >
                  <Printer className="h-3.5 w-3.5" /> Print label
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!item.asset_tag}
                  onClick={async () => {
                    try {
                      const dataUrl = await QRCode.toDataURL(item.asset_tag!, {
                        width: 1024,
                        margin: 2,
                        errorCorrectionLevel: "M",
                        color: { dark: "#0f172a", light: "#ffffff" },
                      });
                      const a = document.createElement("a");
                      a.href = dataUrl;
                      a.download = `${item.asset_tag}.png`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      toast.success("QR code downloaded");
                    } catch {
                      toast.error("Could not generate QR code");
                    }
                  }}
                >
                  <QrCode className="h-3.5 w-3.5" /> Download QR
                </Button>
                {out ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Out of stock
                  </Badge>
                ) : low ? (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
                    <AlertTriangle className="h-3 w-3" /> Low stock
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                    In stock
                  </Badge>
                )}
              </div>

              {/* Stock card */}
              <div className="rounded-lg border p-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">On hand</div>
                  <div className="text-xl font-semibold">
                    {qty} <span className="text-xs text-muted-foreground font-normal">{item.unit}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Min</div>
                  <div className="text-xl font-semibold">{min}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Value</div>
                  <div className="text-xl font-semibold">₵{value.toFixed(2)}</div>
                </div>
              </div>

              {/* Meta */}
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <Field icon={Tag} label="SKU" value={item.sku ?? "—"} mono />
                <Field
                  icon={Tag}
                  label="Category"
                  value={item.inventory_categories?.name ?? "—"}
                />
                <Field icon={MapPin} label="Location" value={item.location ?? "—"} />
                <Field icon={Wrench} label="Condition" value={(item.condition ?? "—").toString()} />
                <Field icon={Tag} label="Manufacturer" value={item.manufacturer ?? "—"} />
                <Field icon={Tag} label="Model" value={item.model ?? "—"} />
                <Field icon={Tag} label="Serial #" value={item.serial_number ?? "—"} mono />
                <Field
                  icon={CalendarClock}
                  label="Purchased"
                  value={item.purchase_date ? format(new Date(item.purchase_date), "PP") : "—"}
                />
                <Field
                  icon={CalendarClock}
                  label="Warranty"
                  value={
                    item.warranty_expires
                      ? `${format(new Date(item.warranty_expires), "PP")} (${formatDistanceToNow(new Date(item.warranty_expires), { addSuffix: true })})`
                      : "—"
                  }
                />
              </div>

              {item.notes && (
                <div className="rounded-lg border p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {item.notes}
                </div>
              )}

              <Separator />

              {/* History */}
              <div>
                <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                  <History className="h-4 w-4 text-primary" /> Recent movements
                </h3>
                {movLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : movements.length === 0 ? (
                  <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                    No movements recorded yet.
                  </div>
                ) : (
                  <ol className="space-y-2 relative border-l border-border pl-4">
                    {movements.map((m: any) => (
                      <li key={m.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background bg-primary" />
                        <div className="rounded-md border bg-card px-3 py-2 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium capitalize">{m.movement_type}</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {Number(m.quantity)} {item.unit}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground">
                            {format(new Date(m.movement_date), "PPp")} ·{" "}
                            {formatDistanceToNow(new Date(m.movement_date), { addSuffix: true })}
                          </div>
                          {m.reference && (
                            <div className="text-muted-foreground">Ref: {m.reference}</div>
                          )}
                          {m.notes && <div>{m.notes}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className={`text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
