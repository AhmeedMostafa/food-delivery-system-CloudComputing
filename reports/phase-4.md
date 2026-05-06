## Phase 4 — Docker Compose Dev Environment

- **Date:** 2026-05-06
- **Commit SHA:** c9de0eab6767bd9a3c57821f27faca868e0549c5
- **Assertions passed:** 14 / 15 (1 defect found and fixed during this phase)
- **Verdict:** ✅ PASS (after hotfix)

---

### Commands Executed

```bash
# Teardown prior state
docker compose -f docker-compose.dev.yml down -v

# Copy env
# (Written via tool — .env did not exist)

# Bring up
docker compose -f docker-compose.dev.yml up -d --build

# Container status
docker compose -f docker-compose.dev.yml ps

# Network container count
docker network inspect food-delivery-dev_food_net_dev

# DNS resolution from order-service
docker compose -f docker-compose.dev.yml exec -T order-service sh -c \
  "getent hosts user-service && getent hosts restaurant-service && getent hosts postgres && getent hosts rabbitmq"

# Health endpoints
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:3003/health
curl -fsS http://localhost:3004/health

# Database introspection
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery -c "\dn"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery \
  -c "SELECT count(*) FROM restaurant_svc.restaurants;"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery \
  -c "SELECT count(*) FROM restaurant_svc.menu_items;"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery \
  -c "SELECT role, count(*) FROM user_svc.users GROUP BY role ORDER BY role;"

# Cross-schema FK audit
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery \
  -c "SELECT tc.constraint_name, tc.table_schema, ccu.table_schema AS foreign_schema ..."

# RabbitMQ queues
docker compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_queues name durable messages consumers

# Frontend
curl -fsS http://localhost:5173/
```

---

### Container Status

```
NAME                                     STATUS                   PORTS
food-delivery-dev-cadvisor-1             Up (healthy)             0.0.0.0:8080->8080/tcp
food-delivery-dev-frontend-1             Up                       0.0.0.0:5173->5173/tcp
food-delivery-dev-grafana-1              Up                       0.0.0.0:3000->3000/tcp
food-delivery-dev-order-service-1        Up                       0.0.0.0:3003->3003/tcp
food-delivery-dev-payment-service-1      Up                       0.0.0.0:3004->3004/tcp
food-delivery-dev-postgres-1             Up (healthy)             0.0.0.0:5433->5432/tcp
food-delivery-dev-prometheus-1           Up                       0.0.0.0:9090->9090/tcp
food-delivery-dev-rabbitmq-1             Up                       0.0.0.0:5672->5672/tcp, 15672/tcp
food-delivery-dev-restaurant-service-1   Up                       0.0.0.0:3002->3002/tcp
food-delivery-dev-user-service-1         Up                       0.0.0.0:3001->3001/tcp
```

Total containers: **10** ✅

---

### Network

- **Containers on food_net_dev:** 10 ✅ (expected ≥ 8)
- **DNS resolution from order-service:**
  - `user-service` → 172.19.0.10 ✅
  - `restaurant-service` → 172.19.0.7 ✅
  - `postgres` → 172.19.0.2 ✅
  - `rabbitmq` → 172.19.0.6 ✅

---

### Health Endpoints

| Service            | Port | Response                                          | Status |
|--------------------|------|---------------------------------------------------|--------|
| user-service       | 3001 | `{"status":"ok","service":"user-service"}`        | ✅     |
| restaurant-service | 3002 | `{"status":"ok","service":"restaurant-service"}` | ✅     |
| order-service      | 3003 | `{"status":"ok","service":"order-service"}`       | ✅     |
| payment-service    | 3004 | `{"status":"ok","service":"payment-service"}`     | ✅     |

---

### Database

- **Schemas:** `user_svc`, `restaurant_svc`, `order_svc`, `payment_svc`, `public` ✅
- **Restaurants:** 4 (expected 4) ✅
- **Menu items:** 10 (expected 10) ✅
- **Restaurant owners:** 4 (expected 4) ✅
- **Delivery drivers:** 2 (expected 2) ✅
- **Cross-schema foreign keys:** None detected — microservice isolation intact ✅

---

### RabbitMQ

| Queue               | Durable | Messages | Consumers | Status |
|---------------------|---------|----------|-----------|--------|
| `payment_queue`     | true    | 0        | 1         | ✅     |
| `payment_queue_dead` | true   | 0        | 0         | ✅ (DLQ present) |

---

### Frontend

- **Vite dev server on 5173:** ✅ — Returns HTML with React entry point and `/@vite/client` script

---

### Defects Found & Fixed

#### DEFECT-4-1: order-service crashes on RabbitMQ queue re-assertion (FIXED)

**Symptom:** `order-service` exited on startup with:
```
Error: Channel closed by server: 406 (PRECONDITION-FAILED)
inequivalent arg 'x-dead-letter-exchange' for queue 'payment_queue'
received none but current is the value 'payment_queue_dlx'
```

**Root Cause:** `payment-service` declares `payment_queue` with `x-dead-letter-exchange: payment_queue_dlx`. The `order-service` declared the same queue **without** the DLX argument. RabbitMQ rejects re-assertion of a queue with mismatched arguments (406 PRECONDITION_FAILED).

**Fix Applied:** Updated `services/order-service/src/rabbitmq.js` line 36 to include matching queue arguments:
```js
// Before:
await channel.assertQueue('payment_queue', { durable: true });

// After:
await channel.assertQueue('payment_queue', {
  durable: true,
  arguments: { 'x-dead-letter-exchange': 'payment_queue_dlx' },
});
```

**Result:** order-service connects and starts successfully. ✅

---

### Stdout/Stderr Highlights

- All images built from cache (no layer changes). Total build time: ~4s.
- One compose warning: `the attribute 'version' is obsolete` — harmless, version key in docker-compose.dev.yml can be removed.
- `order-service` initially crashed (see DEFECT-4-1 above), fixed inline and restarted.
- RabbitMQ management UI available at http://localhost:15672 (guest/guest).
- Grafana available at http://localhost:3000 (admin/admin — rotate in prod, known issue A.3.13).
- Prometheus available at http://localhost:9090.
