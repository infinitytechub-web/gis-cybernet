import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** While mounted, points the page's app manifest at the armory command shortcut so "Add to Home Screen" opens the Command Dashboard. */
export function ArmoryHomeShortcut() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [open, setOpen] = useState(false);
  const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const prev = link?.getAttribute("href") ?? null;
    link?.setAttribute("href", "/manifest-armory.json");
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); if (link && prev) link.setAttribute("href", prev); };
  }, []);
  if (standalone) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <Card><CardContent className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div><p className="font-medium">Add an Armory icon to your phone</p>
          {open && <p className="text-muted-foreground">{ios ? "In Safari, tap Share, then \"Add to Home Screen\", then Add." : "In Chrome, tap the ⋮ menu, then \"Add to Home screen\" or \"Install app\"."} The icon opens straight to this dashboard and your approvals.</p>}
        </div></div>
      <Button size="sm" variant="outline" className="min-h-10 shrink-0" onClick={async () => { if (prompt) { await prompt.prompt(); setPrompt(null); } else setOpen(o => !o); }}>{prompt ? "Add to home screen" : open ? "Hide steps" : "How to add"}</Button>
    </CardContent></Card>
  );
}
