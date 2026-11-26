// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chownSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run the actual deployed trigger functions in a disposable PostgreSQL cluster.
// Never connects to the project database or changes operational records.
const dir = mkdtempSync(join(tmpdir(), "selected-security-pg-"));
const dataDir = join(dir, "data");
const root = process.getuid?.() === 0;
const owner = "security_test_owner";
const self = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
let started = false;
function pg(command: string, args: string[]) {
  return root
    ? execFileSync("setpriv", ["--reuid=1000", "--regid=1000", "--clear-groups", command, ...args], { encoding: "utf8" })
    : execFileSync(command, args, { encoding: "utf8" });
}
function sql(query: string) {
  return execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", "55439", "-U", owner, "-d", "postgres"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function asCaller(query: string, role = "admin") {
  return sql(`BEGIN; SET LOCAL "test.user"='${self}'; SET LOCAL "test.role"='${role}'; ${query}; ROLLBACK;`);
}
function expectDenied(query: string, role = "admin") {
  expect(() => asCaller(query, role)).toThrow(/must be|cannot decide|access denied/i);
}

beforeAll(() => {
  if (root) chownSync(dir, 1000, 1000);
  pg("initdb", ["-D", dataDir, "-U", owner, "--auth=trust", "--no-locale"]);
  pg("pg_ctl", ["-D", dataDir, "-l", join(dir, "server.log"), "-o", `-k ${dir} -p 55439 -c listen_addresses=''`, "-w", "start"]);
  started = true;
  sql(`CREATE SCHEMA auth;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TYPE public.app_role AS ENUM ('admin','oic','2ic','supervisor','staff_officer','staff');
    CREATE TYPE public.staff_status AS ENUM ('active','inactive');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
    CREATE FUNCTION public.has_role(_user uuid,_role public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(_user=auth.uid() AND _role::text=current_setting('test.role',true),false) $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,user_id uuid,department_id uuid,staff_id text,first_name text,last_name text,status public.staff_status);
    CREATE TABLE public.staff_payroll_records(id integer PRIMARY KEY,profile_id uuid,gross_pay numeric,status text);
    CREATE TABLE public.postings_transfers(id integer PRIMARY KEY,profile_id uuid,status text,approved_by uuid,remarks text);
    INSERT INTO public.profiles VALUES('${self}','${self}',null,'ADMIN-001','RICHARD','AFARI','active'),('${other}','${other}',null,'STAFF-002','HENRY','O''NEIL','active');
    INSERT INTO public.staff_payroll_records VALUES(1,'${self}',1000,'recorded'),(2,'${other}',1000,'recorded');
    INSERT INTO public.postings_transfers VALUES(1,'${self}','pending',null,null),(2,'${other}','pending',null,null);`);
  sql(readFileSync("drizzle/migrations/0114_selected_self_changes_and_officer_search.sql", "utf8"));
}, 30_000);
afterAll(() => {
  if (started) pg("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
  rmSync(dir, { recursive: true, force: true });
});

describe("independent payroll recording", () => {
  it("blocks a Super Admin inserting their own pay", () => expectDenied(`INSERT INTO staff_payroll_records VALUES(3,'${self}',9999,'recorded')`));
  it("blocks a Super Admin increasing their own pay", () => expectDenied("UPDATE staff_payroll_records SET gross_pay=9999 WHERE id=1"));
  it("blocks voiding one's own pay", () => expectDenied("UPDATE staff_payroll_records SET status='void' WHERE id=1"));
  it("blocks retargeting another record to oneself", () => expectDenied(`UPDATE staff_payroll_records SET profile_id='${self}' WHERE id=2`));
  it("blocks retargeting one's own record to someone else", () => expectDenied(`UPDATE staff_payroll_records SET profile_id='${other}' WHERE id=1`));
  it("allows independent recording without changing existing amounts", () => {
    expect(asCaller("UPDATE staff_payroll_records SET gross_pay=1250 WHERE id=2; SELECT gross_pay FROM staff_payroll_records WHERE id=2")).toBe("1250");
    expect(sql("SELECT gross_pay FROM staff_payroll_records WHERE id=2")).toBe("1000");
  });
});
describe("independent department assignment", () => {
  it.each(["supervisor", "oic", "2ic", "staff_officer"])("blocks %s changing their own department", role => expectDenied(`UPDATE profiles SET department_id='${other}' WHERE id='${self}'`, role));
  it("allows unchanged self-profile edits", () => expect(asCaller(`UPDATE profiles SET first_name='NEW NAME' WHERE id='${self}'; SELECT first_name FROM profiles WHERE id='${self}'`, "supervisor")).toBe("NEW NAME"));
  it("preserves Super Admin department authority", () => expect(asCaller(`UPDATE profiles SET department_id='${other}' WHERE id='${self}'; SELECT department_id FROM profiles WHERE id='${self}'`)).toBe(other));
  it("does not trust the older command-action bypass flag", () => expectDenied(`SET LOCAL "app.command_admin_action"='1'; UPDATE profiles SET department_id='${other}' WHERE id='${self}'`, "supervisor"));
});
describe("independent posting decisions", () => {
  it.each(["admin", "oic", "2ic", "staff_officer", "supervisor"])("blocks %s approving their own transfer", role => expectDenied("UPDATE postings_transfers SET status='approved' WHERE id=1", role));
  it("blocks self rejection", () => expectDenied("UPDATE postings_transfers SET status='rejected' WHERE id=1"));
  it("blocks inserting an already approved self posting", () => expectDenied(`INSERT INTO postings_transfers VALUES(3,'${self}','approved',null,null)`));
  it("blocks supplying approval attribution on a pending self posting", () => expectDenied(`INSERT INTO postings_transfers VALUES(3,'${self}','pending','${other}',null)`));
  it("blocks replacing the subject to bypass self checks", () => expectDenied(`UPDATE postings_transfers SET profile_id='${other}',status='approved' WHERE id=1`));
  it("allows a pending self request", () => expect(asCaller(`INSERT INTO postings_transfers VALUES(3,'${self}','pending',null,null); SELECT status FROM postings_transfers WHERE id=3`)).toBe("pending"));
  it("allows an independent decision", () => expect(asCaller(`UPDATE postings_transfers SET status='approved',approved_by='${self}' WHERE id=2; SELECT status FROM postings_transfers WHERE id=2`)).toBe("approved"));
  it("leaves previous records untouched", () => expect(sql("SELECT string_agg(status,',' ORDER BY id) FROM postings_transfers")).toBe("pending,pending"));
});
describe("literal command officer search", () => {
  it("matches ordinary names", () => expect(asCaller("SELECT staff_id FROM admin_command_officer_search('AFARI')")).toBe("ADMIN-001"));
  it("matches apostrophes without corrupting the filter", () => expect(asCaller("SELECT staff_id FROM admin_command_officer_search('O''NEIL')")).toBe("STAFF-002"));
  it.each(["%,id.not.is.null", "%%", "__", "AFARI),id.not.is.null", "\\%"])("treats %s literally", attack => {
    expect(asCaller(`SELECT count(*) FROM admin_command_officer_search('${attack.replace(/'/g, "''")}')`)).toBe("0");
  });
  it("denies non-administrators", () => expectDenied("SELECT * FROM admin_command_officer_search('AFARI')", "supervisor"));
  it("rejects oversized search input", () => expect(() => asCaller("SELECT * FROM admin_command_officer_search(repeat('x',101))")).toThrow(/too long/));
});