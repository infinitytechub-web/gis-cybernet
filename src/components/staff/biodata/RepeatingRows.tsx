/**
 * Add / edit / remove rows for the repeating parts of the bio-data form
 * (schools attended, employment history, emergency contacts and any table an
 * administrator adds). Renders as a table on wide screens and as stacked cards
 * on phones so nothing is cut off.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionCombobox } from "./OptionCombobox";
import { DateInput } from "@/components/ui/date-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type RowColumn = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "boolean";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export type RowValue = Record<string, string>;

export function RepeatingRows({
  columns,
  rows,
  onChange,
  addLabel = "Add row",
  maxRows,
  disabled,
  idPrefix,
}: {
  columns: RowColumn[];
  rows: RowValue[];
  onChange: (rows: RowValue[]) => void;
  addLabel?: string;
  maxRows?: number;
  disabled?: boolean;
  idPrefix: string;
}) {
  const update = (index: number, key: string, value: string) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [key]: value } : r));
    onChange(next);
  };
  const addRow = () => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, ""]))]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const field = (row: RowValue, index: number, col: RowColumn) => {
    const id = `${idPrefix}-${index}-${col.key}`;
    const value = row[col.key] ?? "";
    if (col.type === "select") {
      return (
        <OptionCombobox
          id={id}
          value={value}
          onChange={(v) => update(index, col.key, v)}
          options={col.options ?? []}
          disabled={disabled}
          placeholder={col.placeholder ?? "Select…"}
        />
      );
    }
    if (col.type === "date") {
      return (
        <DateInput id={id} value={value} onChange={(e) => update(index, col.key, e.target.value)} disabled={disabled} />
      );
    }
    if (col.type === "boolean") {
      return (
        <Select value={value} onValueChange={(v) => update(index, col.key, v)} disabled={disabled}>
          <SelectTrigger id={id}><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        id={id}
        type={col.type === "number" ? "number" : "text"}
        value={value}
        placeholder={col.placeholder}
        disabled={disabled}
        onChange={(e) => update(index, col.key, e.target.value)}
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Wide screens: table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" style={{ minWidth: 700 }}>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 text-left font-medium">No.</th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-2 py-2 text-left font-medium">{c.label}</th>
              ))}
              {!disabled && <th scope="col" className="w-12 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-4 text-center text-muted-foreground">
                  No entries yet
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t align-top">
                  <td className="px-2 py-2 text-muted-foreground">{index + 1}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="px-2 py-2">{field(row, index, c)}</td>
                  ))}
                  {!disabled && (
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove entry ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phones / tablets: stacked cards */}
      <div className="space-y-3 md:hidden">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No entries yet</p>}
        {rows.map((row, index) => (
          <div key={index} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Entry {index + 1}</span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove entry ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            {columns.map((c) => (
              <div key={c.key} className="space-y-1">
                <Label htmlFor={`${idPrefix}-${index}-${c.key}`} className="text-xs">{c.label}</Label>
                {field(row, index, c)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {!disabled && (!maxRows || rows.length < maxRows) && (
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
          <Plus className="h-4 w-4" aria-hidden="true" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

export default RepeatingRows;
