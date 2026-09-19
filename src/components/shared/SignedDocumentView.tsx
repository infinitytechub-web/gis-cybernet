/**
 * Signed document viewer.
 *
 * Presents the signature certificate for a record: every completed sign-off
 * step with its signature image, the signatory's name, position and the moment
 * of signing, the tamper-evident fingerprints, and the full approval trail.
 * Printable so a signed copy can be filed.
 */
import { Printer, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/date-format";
import {
  SIGNOFF_STEP_LABEL, SIGNOFF_STEP_WHO, type SignOffState,
} from "@/lib/signoff";

export function SignedDocumentView({
  documentTitle,
  subjectName,
  state,
}: {
  documentTitle: string;
  subjectName: string;
  state: SignOffState | null;
}) {
  const steps = state?.steps ?? [];
  const signed = steps.filter((s) => s.signed);
  const complete = steps.length > 0 && signed.length === steps.length;

  const print = () => {
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!win) return;
    // Build the print document with DOM APIs only (no document.write /
    // innerHTML) so user-controlled values can never break out as markup.
    const doc = win.document;
    doc.title = documentTitle;

    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:system-ui,sans-serif;padding:24px;color:#111}" +
      "table{width:100%;border-collapse:collapse;margin-top:12px}" +
      "th,td{border:1px solid #999;padding:6px;text-align:left;font-size:12px;vertical-align:top}" +
      "footer{margin-top:24px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#555}";
    doc.head.appendChild(style);

    const h2 = doc.createElement("h2");
    h2.textContent = documentTitle;
    doc.body.appendChild(h2);

    const p = doc.createElement("p");
    const strong = doc.createElement("strong");
    strong.textContent = subjectName;
    p.appendChild(strong);
    p.appendChild(doc.createElement("br"));
    p.appendChild(
      doc.createTextNode(
        `Status: ${complete ? "Fully signed" : `${signed.length} of ${steps.length} signed`}`,
      ),
    );
    doc.body.appendChild(p);

    const table = doc.createElement("table");
    const thead = doc.createElement("thead");
    const headRow = doc.createElement("tr");
    for (const label of ["Step", "Signatory", "Signed", "Signature", "Fingerprint"]) {
      const th = doc.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    for (const s of signed) {
      const tr = doc.createElement("tr");

      const stepCell = doc.createElement("td");
      stepCell.textContent = SIGNOFF_STEP_LABEL[s.step] ?? s.step;
      tr.appendChild(stepCell);

      const signerCell = doc.createElement("td");
      signerCell.appendChild(doc.createTextNode(s.signer_name ?? ""));
      signerCell.appendChild(doc.createElement("br"));
      const small = doc.createElement("small");
      small.textContent = s.signer_role ?? "";
      signerCell.appendChild(small);
      tr.appendChild(signerCell);

      const whenCell = doc.createElement("td");
      whenCell.textContent = s.signed_at ? formatDateTime(s.signed_at) : "";
      tr.appendChild(whenCell);

      const sigCell = doc.createElement("td");
      if (s.signature_data && /^data:image\/(png|jpe?g|webp);base64,/i.test(s.signature_data)) {
        const img = doc.createElement("img");
        img.src = s.signature_data;
        img.style.height = "46px";
        sigCell.appendChild(img);
      }
      tr.appendChild(sigCell);

      const hashCell = doc.createElement("td");
      hashCell.style.fontFamily = "monospace";
      hashCell.style.fontSize = "10px";
      hashCell.textContent = (s.signature_hash ?? "").slice(0, 24);
      tr.appendChild(hashCell);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    doc.body.appendChild(table);

    const footer = doc.createElement("footer");
    footer.textContent = "Confidential — Ghana Immigration Service";
    doc.body.appendChild(footer);

    win.focus();
    win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {complete ? (
            <Badge className="bg-emerald-100 text-emerald-800">
              <ShieldCheck className="mr-1 h-3 w-3" /> Fully signed
            </Badge>
          ) : (
            <Badge variant="secondary">{signed.length} of {steps.length} signed</Badge>
          )}
          {state?.stage && (
            <span className="text-xs text-muted-foreground">
              Last action: {SIGNOFF_STEP_LABEL[state.stage] ?? state.stage}
            </span>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={print} disabled={!signed.length}>
          <Printer className="mr-1 h-4 w-4" /> Print signed copy
        </Button>
      </div>

      {signed.length === 0 && (
        <p className="text-sm text-muted-foreground">No signatures on this record yet.</p>
      )}

      <div className="space-y-3">
        {signed.map((s) => (
          <div key={s.step} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{SIGNOFF_STEP_LABEL[s.step] ?? s.step}</p>
              <p className="text-xs text-muted-foreground">
                {s.signed_at ? formatDateTime(s.signed_at) : ""}
              </p>
            </div>
            {s.signature_data && (
              <img
                src={s.signature_data}
                alt={`Signature of ${s.signer_name ?? "signatory"}`}
                className="mt-2 h-16 rounded border bg-background"
              />
            )}
            <p className="mt-1 text-sm">
              {s.signer_name}
              {s.signer_role ? ` · ${s.signer_role}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{SIGNOFF_STEP_WHO[s.step]}</p>
            {s.note && <p className="mt-1 text-xs italic text-muted-foreground">“{s.note}”</p>}
            <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="uppercase tracking-wide">Signature fingerprint</dt>
                <dd className="break-all font-mono">{s.signature_hash}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide">Record fingerprint</dt>
                <dd className="break-all font-mono">{s.record_fingerprint}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {(state?.history.length ?? 0) > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Approval trail</p>
          <ol className="space-y-1 text-xs text-muted-foreground">
            {state!.history.map((h) => (
              <li key={h.id}>
                <span className="font-medium text-foreground">
                  {SIGNOFF_STEP_LABEL[h.to_status] ?? h.to_status}
                </span>{" "}
                · {formatDateTime(h.created_at)}
                {h.actor ? ` · ${h.actor}` : ""}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

export default SignedDocumentView;
