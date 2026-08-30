import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Copy, CheckCircle, AlertTriangle, RefreshCw, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/ui/export-menu";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { logAdminAudit } from "@/lib/admin-audit";

interface CreatedAccount {
  staffId: string;
  name: string;
  username: string;
  password: string;
}

const MASK = "••••••••••••";

export function BulkCreateAccounts() {
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [results, setResults] = useState<CreatedAccount[] | null>(null);
  const [errors, setErrors] = useState<Array<{ staffId: string; error: string }>>([]);
  const [total, setTotal] = useState(0);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [revealAll, setRevealAll] = useState(false);
  const [verified, setVerified] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const pollJob = (jobId: string) => {
    setJobStatus("processing");
    setJobProgress(0);
    let consecutivePollErrors = 0;

    pollingRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select("status, progress, total, error")
        .eq("id", jobId)
        .single();

      if (error || !data) {
        consecutivePollErrors += 1;
        // Tolerate transient network blips, but bail out after ~30s of failures
        if (consecutivePollErrors >= 10) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setJobStatus(null);
          setIsResetting(false);
          toast.error(
            error?.message
              ? `Lost connection to job status: ${error.message}`
              : "Lost connection to job status. Please refresh and check the audit log."
          );
        }
        return;
      }
      consecutivePollErrors = 0;

      setJobProgress(data.progress ?? 0);
      setTotal(data.total ?? 0);

      if (data.status === "completed") {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setJobStatus(null);
        setIsResetting(false);

        // Fetch credentials via admin-only RPC that scrubs passwords from storage after read
        const { data: result, error: rpcErr } = await supabase
          .rpc("consume_processing_job_credentials", { p_job_id: jobId });
        if (rpcErr) {
          toast.error(rpcErr.message || "Failed to retrieve credentials. They may have already been consumed — check the audit log.");
          return;
        }
        const r = result as any;
        showResults(r?.created ?? [], r?.errors ?? [], r?.total ?? 0, "reset_and_regenerate");


        if (r?.created?.length > 0) {
          const errCount = r?.errors?.length ?? 0;
          if (errCount > 0) {
            toast.warning(`${r.created.length} accounts regenerated, ${errCount} failed — review the errors list.`);
          } else {
            toast.success(`${r.created.length} accounts regenerated successfully`);
          }
        } else if (r?.errors?.length > 0) {
          toast.error(`Job finished with ${r.errors.length} errors and no accounts created.`);
        } else {
          toast.info(r?.message || "No accounts to regenerate");
        }
      } else if (data.status === "failed") {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setJobStatus(null);
        setIsResetting(false);
        toast.error(data.error || "Reset job failed. Check the audit log for details.");
      }
    }, 3000);
  };

  const handleBulkCreate = async () => {
    setIsLoading(true);
    setResults(null);
    setErrors([]);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-create-accounts");
      if (error) {
        const msg = await extractEdgeFunctionError(error, "Failed to create accounts");
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      setResults(data.created ?? []);
      setErrors(data.errors ?? []);
      setTotal(data.total ?? 0);

      const createdCount = data.created?.length ?? 0;
      const errorCount = data.errors?.length ?? 0;
      if (createdCount > 0 && errorCount > 0) {
        toast.warning(`${createdCount} accounts created, ${errorCount} failed — review the errors list.`);
      } else if (createdCount > 0) {
        toast.success(`${createdCount} accounts created successfully`);
      } else if (errorCount > 0) {
        toast.error(`No accounts created — ${errorCount} errors occurred.`);
      } else {
        toast.info(data.message || "No new accounts to create");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to create accounts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAndCreate = async () => {
    setIsResetting(true);
    setResults(null);
    setErrors([]);
    try {
      const { data, error } = await supabase.functions.invoke("reset-and-create-accounts");
      if (error) {
        const msg = await extractEdgeFunctionError(error, "Failed to reset and create accounts");
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      if (data.job_id) {
        // Background job mode — poll for results
        pollJob(data.job_id);
      } else {
        // Legacy direct response
        setResults(data.created ?? []);
        setErrors(data.errors ?? []);
        setTotal(data.total ?? 0);
        setIsResetting(false);

        if (data.created?.length > 0) {
          toast.success(`${data.created.length} accounts regenerated successfully`);
        } else {
          toast.info(data.message || "No accounts to regenerate");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset and create accounts");
      setIsResetting(false);
    }
  };

  const copyCredentials = async (account: CreatedAccount) => {
    const text = `Username: ${account.username}\nPassword: ${account.password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Credentials copied for ${account.name}`);
    } catch {
      toast.error("Clipboard blocked — select the password text and copy manually.");
    }
  };

  const getCredentialsExportData = () => {
    if (!results?.length) return null;
    return {
      title: "Staff Login Credentials",
      filename: `staff-credentials-${new Date().toISOString().slice(0, 10)}`,
      subtitle: `${results.length} accounts generated`,
      headers: ["Staff ID", "Name", "Username", "Default Password"],
      rows: results.map((r) => [r.staffId, r.name, r.username, r.password]),
    };
  };

  const handleRepair = async () => {
    setIsRepairing(true);
    setResults(null);
    setErrors([]);
    try {
      const { data, error } = await supabase.functions.invoke("repair-missing-auth");
      if (error) {
        const msg = await extractEdgeFunctionError(error, "Repair failed");
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setResults(data.created ?? []);
      setErrors(data.errors ?? []);
      setTotal(data.total ?? 0);
      const createdCount = data.created?.length ?? 0;
      const errorCount = data.errors?.length ?? 0;
      if (createdCount > 0 && errorCount > 0) {
        toast.warning(`${createdCount} profile(s) repaired, ${errorCount} failed.`);
      } else if (createdCount > 0) {
        toast.success(`${createdCount} profile(s) repaired`);
      } else if (errorCount > 0) {
        toast.error(`Repair finished with ${errorCount} errors and no successes.`);
      } else {
        toast.info("No profiles need repair");
      }
    } catch (err: any) {
      toast.error(err?.message || "Repair failed");
    } finally {
      setIsRepairing(false);
    }
  };

  const isAnyLoading = isLoading || isResetting || isRepairing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" /> Bulk Create Staff Accounts
        </CardTitle>
        <CardDescription>
          Generate login accounts for all active staff who don't have one yet, or reset and regenerate all credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobStatus === "processing" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Resetting and regenerating accounts... This may take a few minutes.
            </div>
            <Progress value={jobProgress} className="w-full" />
            <p className="text-xs text-muted-foreground">{jobProgress}% complete{total > 0 ? ` — ${total} accounts to process` : ""}</p>
          </div>
        )}

        {!results && !jobStatus ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isAnyLoading} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  {isLoading ? "Creating accounts..." : "Create New Accounts"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create accounts for all staff?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create login accounts for every active staff member who doesn't have one yet. Each account will receive a unique username (first.last) and an auto-generated password.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkCreate}>Create Accounts</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary" disabled={isAnyLoading} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  {isRepairing ? "Repairing..." : "Repair Missing Auth"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Repair profiles missing auth accounts?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Finds every profile marked login_enabled but with no linked auth user (any status). Reuses an existing matching auth user if available, otherwise creates a new one. Safe to run repeatedly.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRepair}>Repair Now</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isAnyLoading} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  {isResetting ? "Resetting..." : "Reset & Regenerate All"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all staff accounts?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will DELETE all existing staff login accounts (except admin) and generate brand new usernames and passwords for every active staff member. This action cannot be undone. Make sure to download the new credentials after.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetAndCreate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Reset All Accounts
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : results ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant="outline" className="gap-1 text-sm py-1 px-3">
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                {results.length} created
              </Badge>
              {errors.length > 0 && (
                <Badge variant="outline" className="gap-1 text-sm py-1 px-3 border-destructive/30 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {errors.length} errors
                </Badge>
              )}
              {results.length > 0 && (
                <ExportMenu
                  getData={getCredentialsExportData}
                  label="Download"
                  size="sm"
                  variant="outline"
                />
              )}
              <Button variant="ghost" size="sm" onClick={() => setResults(null)}>
                Back
              </Button>
            </div>

            {results.length > 0 && (
              <>
                <p className="text-xs text-destructive font-medium">
                  ⚠️ Save these credentials now — passwords cannot be retrieved later.
                </p>
                <div className="rounded-lg border max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Password</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((account) => (
                        <TableRow key={account.staffId}>
                          <TableCell className="font-mono text-xs">{account.staffId}</TableCell>
                          <TableCell className="font-medium">{account.name}</TableCell>
                          <TableCell className="font-mono text-xs">{account.username}</TableCell>
                          <TableCell className="font-mono text-xs">{account.password}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyCredentials(account)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">Errors:</p>
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {e.staffId}: {e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
