## Phase 2 — Unit Tests

- Date: 2026-05-06
- Commit SHA: c9de0ea
- Commands executed:
  ```
  # Install test dependencies (all 4 services)
  npm install -D jest supertest  (in each service dir)

  # Run tests
  cd services/user-service       && npm test
  cd services/restaurant-service && npm test
  cd services/order-service      && npm test
  cd services/payment-service    && npm test
  ```
- Assertions passed: 97 / 97
- Defects found: 1 (see below)
- Verdict: ✅ PASS

---

### Per-Service Results

#### user-service
- Tests: **29 passed, 0 failed**
- Coverage: 55% lines on `src/routes/users.js` (PUT /me and GET /me routes are covered at integration level but not in unit tests)
- Test cases:
  - ✅ Password hashing round-trip (bcryptjs)
  - ✅ Wrong password returns false
  - ✅ bcrypt cost factor is 10
  - ✅ JWT sign/verify with correct payload
  - ✅ JWT includes restaurant_id
  - ✅ Expired token throws TokenExpiredError
  - ✅ Tampered token throws JsonWebTokenError
  - ✅ Wrong secret is rejected
  - ✅ `customer` role is valid
  - ✅ `restaurant_owner` role is valid
  - ✅ `delivery_driver` role is valid
  - ✅ `admin` role is not valid
  - ✅ Empty string is not a valid role
  - ✅ POST /register 400 when name missing
  - ✅ POST /register 400 when email missing
  - ✅ POST /register 400 when password missing
  - ✅ POST /register 409 when email already registered
  - ✅ POST /register 400 when restaurant_owner missing restaurant_name
  - ✅ POST /register 201 successful customer registration (with JWT)
  - ✅ POST /register invalid role defaults to customer
  - ✅ POST /login 400 when email missing
  - ✅ POST /login 400 when password missing
  - ✅ POST /login 401 when user not found
  - ✅ POST /login 401 for wrong password
  - ✅ POST /login 200 with JWT on correct credentials (password not in response)
  - ✅ GET /users/:id 400 for non-numeric id
  - ✅ GET /users/:id 404 when user not found
  - ✅ GET /users/:id returns role info
  - ✅ GET /health returns ok

#### restaurant-service
- Tests: **17 passed, 0 failed**
- Coverage: 62% lines on `src/routes/` (UPDATE and complex query paths not covered)
- Test cases:
  - ✅ POST /restaurants/:id/menu rejects negative price
  - ✅ POST /restaurants/:id/menu rejects price=NaN string
  - ✅ POST /restaurants/:id/menu accepts price=0 (DB-level enforcement)
  - ✅ POST /restaurants/:id/menu accepts positive price
  - ✅ POST /restaurants/:id/menu requires name
  - ✅ PUT /menu-items/:id rejects negative price update
  - ✅ New menu item has is_available=true by default (DB schema default)
  - ✅ POST /restaurants 400 when name missing
  - ✅ POST /restaurants 201 creates restaurant successfully
  - ✅ GET /restaurants/:id 400 for non-numeric id
  - ✅ GET /restaurants/:id 404 for unknown restaurant
  - ✅ GET /menu-items/:id 400 for non-numeric id
  - ✅ GET /menu-items/:id 404 when item not found
  - ✅ GET /menu-items/:id returns price and availability
  - ✅ DELETE /menu-items/:id 404 when item not found
  - ✅ DELETE /menu-items/:id deletes and returns confirmation
  - ✅ GET /health returns ok

#### order-service
- Tests: **25 passed, 0 failed**
- Coverage: 48% lines on `src/routes/orders.js` (GET collection routes not covered)
- Test cases:
  - ✅ Total calculation: Σ(price × qty) = correct sum
  - ✅ Floating point total is rounded to 2 decimal places
  - ✅ Single item total is price × qty
  - ✅ PLACED → ACCEPTED transition is allowed
  - ✅ ACCEPTED → PREPARING is allowed
  - ✅ PREPARING → OUT_FOR_DELIVERY is allowed
  - ✅ OUT_FOR_DELIVERY → DELIVERED is allowed
  - ✅ PLACED → DELIVERED (skip) is allowed (route only enforces forward movement)
  - ✅ DELIVERED → ACCEPTED (backward) is rejected
  - ✅ PREPARING → PLACED (backward) is rejected
  - ✅ PLACED → PLACED (same status) is rejected
  - ✅ DELIVERED → DELIVERED (same status) is rejected
  - ✅ PATCH /orders/:id/status 400 for invalid status value
  - ✅ PATCH /orders/:id/status 400 for non-numeric order id
  - ✅ PATCH /orders/:id/status 404 when order not found
  - ✅ PATCH /orders/:id/status 400 for backward transition DELIVERED → ACCEPTED
  - ✅ PATCH /orders/:id/status 400 for same-status PLACED → PLACED
  - ✅ PATCH /orders/:id/status 200 for valid forward transition
  - ✅ POST /orders 400 when user_id missing
  - ✅ POST /orders 400 when items is empty array
  - ✅ POST /orders 400 when items is not array
  - ✅ POST /orders 400 when item qty < 1
  - ✅ POST /orders 404 when user does not exist
  - ✅ POST /orders 201 creates order successfully (mocked services)
  - ✅ GET /health returns ok

#### payment-service
- Tests: **26 passed, 0 failed**
- Coverage: 91% lines on `src/routes/payments.js`
- Test cases:
  - ✅ parseMessage: parses valid message correctly
  - ✅ parseMessage: handles malformed JSON without crashing
  - ✅ parseMessage: handles empty string without crashing
  - ✅ parseMessage: error when order_id missing
  - ✅ parseMessage: error when user_id missing
  - ✅ parseMessage: error when amount missing (undefined)
  - ✅ parseMessage: amount=0 triggers "missing fields" error (documents falsy-check bug)
  - ✅ parseMessage: error for negative amount
  - ✅ parseMessage: error for non-numeric amount string
  - ✅ parseMessage: defaults unknown method to CREDIT_CARD
  - ✅ parseMessage: accepts WALLET
  - ✅ parseMessage: accepts CASH
  - ✅ POST /payments 400 when order_id missing
  - ✅ POST /payments 400 when user_id missing
  - ✅ POST /payments 400 when amount missing
  - ✅ POST /payments 400 for amount=0 (documents falsy-check bug)
  - ✅ POST /payments 400 for negative amount
  - ✅ POST /payments 400 for non-numeric amount string
  - ✅ POST /payments 201 creates COMPLETED transaction
  - ✅ POST /payments defaults to CREDIT_CARD for unknown method
  - ✅ GET /payments/order/:orderId 400 for non-numeric id
  - ✅ GET /payments/order/:orderId 404 when no payment found
  - ✅ GET /payments/order/:orderId returns transaction
  - ✅ GET /payments/user/:userId 400 for non-numeric id
  - ✅ GET /payments/user/:userId returns empty list
  - ✅ GET /health returns ok

---

### Defects Found

#### DEF-001: Falsy check treats `amount=0` as missing field
- **Services affected:** `payment-service` (route + RabbitMQ consumer)
- **Root cause:** `if (!order_id || !user_id || !amount)` — JavaScript's `!0` is `true`, so `amount=0` is treated as "missing" instead of reaching the `parsedAmount <= 0` validation that would give a more accurate error message.
- **Severity:** Low (amount of 0 is not a realistic payment value, but the error message is misleading)
- **Fix:** Change `!amount` to `amount === undefined || amount === null || amount === ''`

---

### Code Changes Made

1. **`services/user-service/src/index.js`** — Extracted Express app creation to `src/app.js`; `index.js` now just starts the server.
2. **`services/user-service/src/app.js`** — New file: exports the configured Express app for testing.
3. **`services/restaurant-service/src/index.js`** — Same refactor as user-service.
4. **`services/restaurant-service/src/app.js`** — New file.
5. **`services/order-service/src/index.js`** — Same refactor; `connectRabbitMQ()` call stays here (not in app.js) so tests don't trigger it.
6. **`services/order-service/src/app.js`** — New file.
7. **`services/payment-service/src/index.js`** — Same refactor; `connectRabbitMQ()` call stays here.
8. **`services/payment-service/src/app.js`** — New file.
9. **All 4 `package.json`** — Updated `test` script to: `node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage --forceExit`
10. **All 4 `jest.config.js`** — New file in each service root configuring Jest for ESM.
11. **`services/user-service/tests/users.test.js`** — 29 unit tests.
12. **`services/restaurant-service/tests/restaurants.test.js`** — 17 unit tests.
13. **`services/order-service/tests/orders.test.js`** — 25 unit tests.
14. **`services/payment-service/tests/payments.test.js`** — 26 unit tests.
