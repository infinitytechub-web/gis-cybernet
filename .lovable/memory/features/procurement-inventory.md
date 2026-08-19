---
name: Procurement & Inventory
description: /procurement Requests + Inventory tabs, stock-linked request lines, receipts topping up stock, branch procurement KPIs
type: feature
---
- `/procurement` has a **Requests** tab (shared `ProcurementTab` from the Command Console) and an **Inventory** tab (`ProcurementStockTab`).
- Request lines can be linked to a stock item (`purchase_requisition_items.inventory_item_id`). On receipt, `procurement_request_receive` tops up `inventory_items.qty_on_hand`, refreshes `unit_cost` and writes an `in` `inventory_movements` row referencing the PR number.
- `procurement_inventory(_days)` RPC (storekeeper + command tier) returns stock levels joined to procurement activity: ordered/procured/outstanding qty, open requests, stock_level (out|low|ok), last receipt and last PR.
- `command_dashboard(_days)` includes per-branch procurement KPIs: proc_total, proc_pending, proc_approved, proc_received, proc_rejected, proc_committed, proc_items_ordered, proc_items_received — surfaced as KPI cards and a Procurement column in `CommandDashboardTab`.
- `procurement_request_events` is immutable (delete/update blocked by trigger), so test requests cannot be deleted — cancel and label them instead.
- `purchase_requisitions.pr_number` is NOT NULL with no default; the client generates `PR-<timestamp>`.
