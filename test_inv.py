import requests

gid = 'e35f5bcd-74f4-4b44-98b0-14dafccdf13e'
invs = requests.get(f'http://127.0.0.1:8000/api/groups/{gid}/invoices').json()
print('Invoices:', len(invs))

if invs:
    inv = invs[0]
    inv_id = inv["id"]
    print(f"Updating invoice {inv_id}...")
    r = requests.put(
        f"http://127.0.0.1:8000/api/invoices/{inv_id}",
        json={"description": "UPDATED TEST", "total_amount": 999.0, "per_child_cost": 99.0, "date": "2026-04-30", "currency": "BGN"}
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
else:
    print("No invoices found")
