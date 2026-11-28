import { handleGpsExport } from "./index.ts";

const owner = "00000000-0000-0000-0000-000000000001";
const recipient = "00000000-0000-0000-0000-000000000002";
const unit = "00000000-0000-0000-0000-000000000003";
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

Deno.test("GPS sharing checks live roles and scope on every download", async () => {
  const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = keys.map(key => Deno.env.get(key));
  Deno.env.set(keys[0], "http://localhost:9999");
  Deno.env.set(keys[1], "test-publishable");
  Deno.env.set(keys[2], "test-service");
  const originalFetch = globalThis.fetch;
  let identity = owner;
  const roles: Record<string, string[]> = { [owner]: ["oic"], [recipient]: ["2ic"] };
  const scopes: Record<string, boolean> = { [owner]: true, [recipient]: true };
  const files = new Map<string, string>();
  let fileReads = 0;
  const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") return response({ id: identity, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" });
    if (url.pathname === "/rest/v1/user_roles") {
      const id = url.searchParams.get("user_id")?.replace("eq.", "") ?? "";
      return response((roles[id] ?? []).map(role => ({ role })));
    }
    if (url.pathname === "/rest/v1/profiles") return response({ org_unit_id: unit });
    if (url.pathname === "/rest/v1/rpc/command_vault_can_access") {
      const body = await request.json();
      return response(scopes[body._user_id] === true && body._org_unit_id === unit);
    }
    if (url.pathname === "/rest/v1/front_desk_audit_log") return response([]);
    const prefix = "/storage/v1/object/";
    if (url.pathname.startsWith(prefix)) {
      const object = decodeURIComponent(url.pathname.slice(prefix.length).replace(/^authenticated\//, "").replace(/^command-vault\//, ""));
      if (request.method === "POST") {
        files.set(object, await request.text());
        return response({ Key: `command-vault/${object}`, Id: owner });
      }
      fileReads++;
      const csv = files.get(object);
      return csv === undefined ? new Response("Not found", { status: 404 }) : new Response(csv);
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  const invoke = (body: unknown, auth = true) => handleGpsExport(new Request("http://localhost/gps-cloud-export", {
    method: "POST", headers: { Origin: "http://localhost:8080", "x-cybernet-app": "cybernet-web", "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer test-session" } : {}) },
    body: JSON.stringify(body),
  }));
  try {
    const create = await invoke({ csv: "latitude,longitude\n5.6,-0.2", filename: "gps.csv", expiresIn: 3600 });
    assert(create.status === 200, `Creation status ${create.status}: ${await create.clone().text()}`);
    const exportResult = await create.json();
    assert(!("url" in exportResult), "Must not return a storage bearer URL");
    assert(exportResult.object_path.startsWith("gps-auth-exports/"), "Private export prefix required");
    identity = recipient;
    const body = { action: "download", objectPath: exportResult.object_path };
    const downloaded = await invoke(body);
    assert(downloaded.status === 200, `Download status ${downloaded.status}: ${await downloaded.clone().text()}`);
    assert(await downloaded.text() === "latitude,longitude\n5.6,-0.2", "CSV readback must match");
    assert(downloaded.headers.get("Cache-Control")?.includes("no-store"), "Downloads must not be cached");
    const readsBeforeDenials = fileReads;
    roles[owner] = [];
    assert((await invoke(body)).status === 403, "Revoking creator must invalidate every copy");
    roles[owner] = ["oic"];
    roles[recipient] = [];
    assert((await invoke(body)).status === 403, "Revoked recipient must be denied");
    roles[recipient] = ["2ic"];
    scopes[recipient] = false;
    assert((await invoke(body)).status === 403, "Cross-command recipients must be denied");
    scopes[recipient] = true;
    scopes[owner] = false;
    assert((await invoke(body)).status === 403, "Creator command access removal must invalidate copies");
    scopes[owner] = true;
    assert((await invoke(body, false)).status === 401, "Signed-out downloads must be denied");
    assert((await invoke({ action: "download", objectPath: `gps-exports/${owner}/gps.csv` })).status === 404, "Legacy paths must be rejected");
    assert((await invoke({ action: "download", objectPath: exportResult.object_path.replace(/\/\d{13}\//, "/1000000000000/") })).status === 404, "Expired links must be rejected");
    assert(fileReads === readsBeforeDenials, "Denied requests must never read storage");
    const preflight = await handleGpsExport(new Request("http://localhost/gps-cloud-export", { method: "OPTIONS" }));
    assert(preflight.headers.get("Access-Control-Allow-Headers")?.includes("x-cybernet-app"), "Browser preflight must allow app header");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { const value = previous[index]; if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); });
  }
});
