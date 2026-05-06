## Phase 5 — End-to-End API Tests

- **Date:** 2026-05-06
- **Commit SHA:** c9de0eab6767bd9a3c57821f27faca868e0549c5
- **Test script:** `tests/e2e/run-e2e.js`
- **Stack:** `docker-compose.dev.yml` (running, not restarted)

---

### Commands Executed

```bash
mkdir -p tests/e2e reports
cd tests/e2e && npm install   # installs axios ^1.6
node run-e2e.js
```

---

### Stdout / Stderr Highlights

```
Pre-flight: all 4 /health endpoints returned {"status":"ok"} ✅

H1  POST /api/users/register              → 201  user.id=7, role=customer, token issued
H2  POST /api/users/login (customer)      → 200  token re-issued
H3  POST /api/users/login (burger@owner)  → 200  role=restaurant_owner, restaurant_id=1
H4  GET  /api/restaurants                 → 200  4 restaurants
H5  GET  /api/restaurants/1/menu          → 200  3 items, selected menu_item_id=2
H6  POST /api/orders                      → 201  status=PLACED, total=11.98 (server-side)
H7  sleep 3000ms
H8  GET  /api/payments/order/1            → 200  status=COMPLETED (RabbitMQ consumer ran)
H9  PATCH /api/orders/1/status (×4)
      PLACED→ACCEPTED      → 200
      ACCEPTED→PREPARING   → 200
      PREPARING→OUT_FOR_DELIVERY → 200
      OUT_FOR_DELIVERY→DELIVERED → 200

N1  duplicate email register              → 409
N2  wrong password login                  → 401
N3  order user_id=99999                   → 404
N4  order qty=0                           → 400
N5  order items=[]                        → 400
N6  DELIVERED→ACCEPTED (backward)         → 400
N7  GET /me no auth                       → 401
N8  GET /me tampered JWT                  → 401
```

---

### Assertions Passed: 44 / 44

| Category | Passed | Failed |
|---|---|---|
| Pre-flight health checks | 4 / 4 | 0 |
| Happy-path (H1–H9) | 32 / 32 | 0 |
| Negative cases (N1–N8) | 8 / 8 | 0 |
| **Total** | **44 / 44** | **0** |

---

### Key Observations

1. **RabbitMQ async payment works** — within 3 s of order creation, payment_svc recorded a COMPLETED transaction (H8).
2. **Server-side total calculation confirmed** — total_price=11.98 (2 × $5.99) was computed by the order-service, not trusted from the client.
3. **Forward-only status transitions enforced** — backward DELIVERED→ACCEPTED correctly returns 400 (N6).
4. **JWT auth middleware functional** — missing header (N7) and tampered token (N8) both return 401.
5. **Duplicate email detection** — user-service returns 409 (N1).

---

### Defects Found

None. All 44 assertions passed on the first run.

---

### Verdict: ✅ PASS
