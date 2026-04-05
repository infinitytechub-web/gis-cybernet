import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Download, Copy, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CreatedAccount {
  staffId: string;
  name: string;
  username: string;
  password: string;
}

export function BulkCreateAccounts() {
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [results, setResults] = useState<CreatedAccount[] | null>(null);
  const [errors, setErrors] = useState<Array<{ staffId: string; error: string }>>([]);
  const [total, setTotal] = useState(0);

  const handleBulkCreate = async () => {
    setIsLoading(true);
    setResults(null);
    setErrors([]);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-create-accounts");
      if (error) throw error;

      setResults(data.created ?? []);
      setErrors(data.errors ?? []);
      setTotal(data.total ?? 0);

      if (data.created?.length > 0) {
        toast.success(`${data.created.length} accounts created successfully`);
      } else {
        toast.info(data.message || "No new accounts to create");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create accounts");
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
      if (error) throw error;

      setResults(data.created ?? []);
      setErrors(data.errors ?? []);
      setTotal(data.total ?? 0);

      if (data.created?.length > 0) {
        toast.success(`${data.created.length} accounts regenerated successfully`);
      } else {
        toast.info(data.message || "No accounts to regenerate");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to reset and create accounts");
    } finally {
      setIsResetting(false);
    }
  };

  const copyCredentials = (account: CreatedAccount) => {
    const text = `Username: ${account.username}\nPassword: ${account.password}`;
    navigator.clipboard.writeText(text);
    toast.success(`Credentials copied for ${account.name}`);
  };

  const downloadCSV = () => {
    if (!results?.length) return;
    const header = "Staff ID,Name,Username,Default Password\n";
    const rows = results.map((r) => `${r.staffId},"${r.name}",${r.username},${r.password}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Credentials CSV downloaded");
  };

  const isAnyLoading = isLoading || isResetting;

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
        {!results ? (
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
        ) : (
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
                <Button variant="outline" size="sm" className="gap-1" onClick={downloadCSV}>
                  <Download className="h-4 w-4" /> Download CSV
                </Button>
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
        )}
      </CardContent>
    </Card>
  );
}
