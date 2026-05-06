## Phase 11 — Acceptance Tests (Role-Based)

- Date: 2026-05-06
- Commit SHA: c9de0ea

### Commands Executed

```bash
# Run acceptance test suite against prod compose (port 80)
node tests/acceptance/run-acceptance.js

# Manual investigations:
curl -s http://localhost/api/payments/by-order/1    # → 404 (wrong path)
curl -s http://localhost/api/payments/order/1       # → 200 (correct path)
curl -s http://localhost/api/orders/restaurant/1    # → 200 (no auth required — defect)
curl -s http://localhost/api/users/me               # → 401 (correct)
```

### Test Results: 22 / 26 PASSED

#### Scenario 1: Customer Journey

| Test | Result |
|------|--------|
| Customer register returns 201 | PASS |
| Register returns userId | PASS |
| Register returns JWT token | PASS |
| GET /api/restaurants returns 200 | PASS |
| Restaurants list has 4 items | PASS |
| POST /api/orders returns 201 | PASS |
| Order has PLACED status | PASS |
| Order total computed server-side | PASS |
| Order has delivery_address | PASS |
| GET /api/payments/by-order/:id returns 200 | FAIL — route is /api/payments/order/:id |
| Payment status is COMPLETED | FAIL — cascades from wrong path |

#### Scenario 2: Restaurant Owner Journey

| Test | Result |
|------|--------|
| Owner login (burger@owner.com) returns 200 | PASS |
| Token has role=restaurant_owner | PASS |
| GET /api/orders/restaurant/1 returns 200 | PASS |
| Returns array of orders | PASS |
| PATCH order to ACCEPTED returns 200 | PASS |
| Order status is now ACCEPTED | PASS |
| PATCH order to PREPARING returns 200 | PASS |

#### Scenario 3: Driver Login

| Test | Result |
|------|--------|
| Driver login (driver1@test.com) returns 200 | PASS |
| Driver has delivery_driver role | PASS |
| Driver token returned | PASS |

#### Scenario 4: Unauthorized Access

| Test | Result |
|------|--------|
| PUT /api/users/1 without auth returns 401 | FAIL — route /api/users/:id doesn't exist (404) |
| PUT /api/users/me with valid token updates own profile | PASS |
| GET /api/orders/restaurant/:id without auth returns 401 | FAIL — returns 200 (security defect) |
| Tampered JWT returns 401 | PASS |
| Back-transition DELIVERED→ACCEPTED returns 400 | PASS |

### Defects Found

**DEFECT-11-01 (MEDIUM):** Payment route path mismatch. The test plan specifies `GET /api/payments/by-order/{order_id}`, but the actual route is `GET /api/payments/order/:orderId`. The route does exist and works — this is a documentation/API contract inconsistency, not a broken feature.

**DEFECT-11-02 (HIGH - SECURITY):** `GET /api/orders/restaurant/:restaurantId` does not require authentication. Any unauthenticated user can retrieve all orders for any restaurant including customer names, addresses, and order details. This is a data exposure vulnerability. Fix: add `authenticate` middleware to this route.

**DEFECT-11-03 (LOW):** `PUT /api/users/:id` (with numeric ID) returns 404 — that route does not exist. The profile update endpoint is `PUT /api/users/me`. The test plan referenced the `:id` pattern. This is a documentation gap, not a bug.

### Persona Scenarios — Manual Assessment

| Persona | Scenario | Automated Result | Assessment |
|---------|----------|-----------------|------------|
| Customer | Register → browse → order → see payment | 9/11 pass | ✅ Core happy path works; payment route name mismatch in test plan |
| Restaurant owner (burger@owner.com) | Login → see restaurant orders → update status | 7/7 pass | ✅ Fully working |
| Driver (driver1@test.com) | Login, verify role | 3/3 pass | ✅ Login and role work |
| Unauthorized | Access protected endpoints | 2/4 pass | ❌ /api/orders/restaurant endpoint lacks auth |

### Verdict: ⚠️ PARTIAL PASS

22/26 tests pass. The 4 failures include 2 that are test script path issues (not app bugs) and 2 real defects: the missing auth middleware on `/api/orders/restaurant/:id` (DEFECT-11-02, HIGH severity) and the route path mismatch in test plan docs (DEFECT-11-01). Core happy-path functionality (customer register/order, owner login/accept order, driver login) all work correctly.
