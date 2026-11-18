// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function handler(file: string, mocks: Record<string, unknown>) {
  const source = readFileSync(`supabase/functions/${file}/index.ts`, "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];?\s*/g, "");
  let serve: (req: Request) => Promise<Response>;
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, {
    Request, Response, Date, Map, Uint8Array, JSON, console,
    Deno: { env: { get: () => "test" }, serve: (fn: typeof serve) => { serve = fn; } },
    ...mocks,
  });
  return (body: unknown) => serve(new Request("https://app.test", { method: "POST", body: JSON.stringify(body) }));
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("remaining selected security protections", () => {
  for (const password of [undefined, "wrong", "correct"]) {
    it(`does not disclose an email without password proof (${password ?? "missing"})`, async () => {
      let lookups = 0;
      const scoped = { auth: {
        signInWithPassword: async () => ({ data: { session: password === "correct" ? {} : null }, error: password === "correct" ? null : {} }),
        signOut: async () => {},
      } };
      const admin = { rpc: async (name: string) => {
        if (name === "get_email_by_staff_id") { lookups++; return { data: "test@example.test" }; }
        return { data: false };
      }, from: () => { throw new Error("Policy read unavailable"); } };
      let clients = 0;
      const invoke = handler("resolve-staff-email", { createClient: () => ++clients === 1 ? admin : scoped, verifyRecaptcha: async () => ({ ok: true }) });
      const result = await invoke({ staff_id: "TEST-001", password });
      const data = await result.json();
      if (password === "correct") expect(data.email).toBe("test@example.test");
      else { expect(result.status).toBe(401); expect(data.email).toBeUndefined(); }
      if (!password) expect(lookups).toBe(0);
    });
  }
  it("returns account-independent public passkey options without enrollment queries", async () => {
    const queries: string[] = [];
    const invoke = handler("webauthn-login-options", {
      corsHeaders: {}, json, clientIp: () => "test", relyingParty: () => ({ rpID: "app.test" }),
      adminClient: () => ({ rpc: async () => ({ data: false }), from: (table: string) => {
        queries.push(table);
        return { select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { biometric_login_enabled: true } }) }) }) };
      } }),
      generateAuthenticationOptions: async (options: unknown) => ({ ...options as object, challenge: "random" }),
      storeChallenge: async () => {},
    });
    const known = await (await invoke({ staff_id: "KNOWN-001" })).json();
    const unknown = await (await invoke({ staff_id: "UNKNOWN-001" })).json();
    expect(known).toEqual(unknown);
    expect(known.enrolled).toBeUndefined();
    expect(known.options.allowCredentials).toEqual([]);
    expect(queries).toEqual(["app_settings", "app_settings"]);
  });
  it("requires an authorized exact record and server-generated email/PDF", () => {
    const source = readFileSync("supabase/functions/send-record-email/index.ts", "utf8");
    expect(source).toContain('supabase.from(table).select("*").eq("id", body.record_id)');
    expect(source).toContain("body.subject = verified.subject");
    expect(source).toContain("body.message = verified.message");
    expect(source).toContain("body.attachment_base64 = verified.content");
    expect(source).toContain('errors.push("extra_attachments")');
    const helper = readFileSync("supabase/functions/_shared/verified-record-email.ts", "utf8");
    expect(helper).toContain("for (const key of FIELDS[kind])");
    expect(helper).not.toContain("Object.entries(record)");
  });
  it("derives profile notices from the recorded reviewer and fixed link", () => {
    const source = readFileSync("supabase/functions/send-transactional-email/index.ts", "utf8");
    expect(source).toContain("actorId !== callerId");
    expect(source).toContain("recipientEmail = target.email");
    expect(source).toContain("https://admin.infinitytechub.com/my-profile?request=${event.id}");
    expect(source).toContain("templateName === 'test-email' && callerIsAdmin");
    expect(readFileSync("src/pages/ProfileChangeApprovals.tsx", "utf8")).not.toContain("templateData:");
  });
  it("binds passkeys to the requested active account only after signature proof", () => {
    const source = readFileSync("supabase/functions/webauthn-login-verify/index.ts", "utf8");
    expect(source.indexOf("if (!verification.verified)")).toBeLessThan(source.indexOf('db.from("profiles")'));
    expect(source).toContain("profile?.user_id !== cred.user_id");
    expect(source).toContain("enabled?.biometric_login_enabled === false");
    expect(source).toContain("locked === true");
  });
});
