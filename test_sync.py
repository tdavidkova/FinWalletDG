import requests

BASE = "http://127.0.0.1:8000"

# Get group
groups = requests.get(f"{BASE}/api/groups").json()
gid = groups[0]["id"]
print(f"Group: {groups[0]['name']}")

# Get students
students = requests.get(f"{BASE}/api/groups/{gid}/students?status=active").json()
print(f"Active students: {len(students)}")
sids = [s["id"] for s in students]

# Create invoice with student_ids (should create transactions too)
inv_data = {
    "description": "Test invoice with transactions",
    "total_amount": 100.0,
    "currency": "BGN",
    "date": "2026-04-30",
    "student_ids": sids[:2] if len(sids) >= 2 else sids,
    "invoice_number": "TEST-001",
}
r = requests.post(f"{BASE}/api/groups/{gid}/invoices", json=inv_data)
print(f"\nCreate invoice: {r.status_code}")
inv = r.json()
print(f"Invoice: batch={inv.get('expense_batch_id')}, per_child={inv.get('per_child_cost')}, children={inv.get('num_children')}")

# Check transactions
txs = requests.get(f"{BASE}/api/groups/{gid}/transactions").json()
batch_txs = [t for t in txs if t.get("expense_batch_id") == inv.get("expense_batch_id")]
print(f"\nLinked transactions: {len(batch_txs)}")
for t in batch_txs:
    print(f"  {t['student_name']}: {t['amount_bgn']} BGN, {t['amount_eur']} EUR, reason={t['reason']}")

# Check dashboard
dash = requests.get(f"{BASE}/api/groups/{gid}/dashboard").json()
print(f"\nDashboard:")
print(f"  Total balance: {dash['total_balance_bgn']} BGN / {dash['total_balance_eur']} EUR")
print(f"  Total deposits: {dash['total_deposits_bgn']} BGN")
print(f"  Total expenses: {dash['total_expenses_bgn']} BGN")

# Clean up - delete the test invoice (should also delete transactions)
r = requests.delete(f"{BASE}/api/invoices/{inv['id']}")
print(f"\nCleanup delete: {r.status_code}")
