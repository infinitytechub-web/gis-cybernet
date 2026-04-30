import { lazy, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { useConfidentialityCommands } from "@/hooks/useConfidentialityCommands";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Crown, Construction } from "lucide-react";

const Dashboard = lazy(() => import("./Dashboard"));

/**
 * Per-command workspace.
 *
 * For now this reuses the main Dashboard, with a banner identifying which command
 * the admin is viewing. Future iterations can scope queries by command_id.
 */
export default function CommandWorkspace() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { data: commands = [], isLoading } = useConfidentialityCommands();
  const command = commands.find((c) => c.slug === slug);

  return (
    <div className="space-y-4">
      <div className="px-6 pt-6">
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 text-amber-600" />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Command workspace</div>
                <div className="text-base font-semibold">
                  {isLoading ? "Loading…" : command ? command.name : `Unknown command: ${slug}`}
                </div>
              </div>
              <Badge variant="outline" className="ml-2 text-[10px]">
                <Construction className="h-3 w-3 mr-1" /> in development
              </Badge>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/commands">
                <ArrowLeft className="h-4 w-4 mr-1" /> All commands
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {command ? (
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading workspace…</div>}>
          <Dashboard />
        </Suspense>
      ) : !isLoading && (
        <div className="p-6">
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            This command does not exist or has been removed.
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
