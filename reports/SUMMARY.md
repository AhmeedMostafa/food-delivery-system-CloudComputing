# FoodieGo — Test Plan Summary

- **Date:** 2026-05-06
- **Repository branch:** main
- **Commit SHA:** c9de0ea
- **Environment:** Windows 11 + Docker Desktop (WSL2 backend)

---

## Phase Verdicts

| Phase | Name | Verdict | Key Findings |
|-------|------|---------|-------------|
| 0 | Conflicts Audit & Fixes | ✅ PASS | 20 conflicts audited; 8 fixed, 12 documented. Critical fixes: RabbitMQ reconnect loop, auth middleware, bcrypt cost, CORS headers |
| 1 | Static Analysis | ✅ PASS | All 4 services + frontend pass eslint, npm audit (0 high/critical), node --check syntax |
| 2 | Unit Tests | ✅ PASS | All 4 services pass jest; coverage ≥70% on routes. 69 tests total, 0 failures |
| 3 | Container Builds | ✅ PASS | All 6 images build successfully; non-root users; backend < 200MB; frontend < 50MB |
| 4 | Dev Compose | ✅ PASS | All 10 containers running, all /health endpoints respond, DB schemas and seeds verified |
| 5 | E2E API Tests | ✅ PASS | 13 happy-path + negative-case tests via Newman; all assertions pass |
| 6 | Messaging & Async | ⚠️ PARTIAL PASS | Queue visibility, throughput (20 orders), consumer-down all pass. Broker-down: message silently dropped |
| 7 | Observability | ⚠️ PARTIAL PASS | Prometheus targets up, cAdvisor scraping. Grafana accessible but no datasource provisioned |
| 8 | Test & Prod Compose | ⚠️ PARTIAL PASS | Prod compose: all pass (correct ports, nginx proxy, restart policies). Test compose: FAIL (jest stripped by --omit=dev) |
| 9 | Kubernetes | ✅ PASS (with caveats) | All 13 pods Running; DNS, health probes, external access, self-healing, RabbitMQ PVC persistence all verified. emptyDir on Postgres confirmed. NEW: pg.Pool no-reconnect (DEFECT-9-05 HIGH) and CoreDNS desync after minikube crash (DEFECT-9-06 MEDIUM) found during resilience testing. |
| 10 | Non-Functional | ⚠️ PARTIAL PASS | Load: p95=120ms, 0% error rate (PASS). Security: JWT 7d too long (DEFECT). Chaos: postgres & user-service recovery work |
| 11 | Acceptance Tests | ⚠️ PARTIAL PASS | 22/26 pass; owner + driver + customer flows work; /api/orders/restaurant missing auth (security defect) |

---

## Phase-0 Conflicts Re-check

| # | Issue | Final Status |
|---|-------|-------------|
| A.1.1 | Frontend dev port mismatch (nginx vs Vite 5173) | **Fixed** — dev compose uses separate Vite stage; prod uses nginx |
| A.1.2 | NODE_ENV=production strips devDeps (nodemon/jest) | **Confirmed** — test compose fails; dev compose hot-reload works. Dockerfile test stage not added |
| A.1.3 | Test env ports 4001-4004 vs internal 3001-3004 | **N/A** — internal URLs use service names (not host ports), no mismatch |
| A.1.4 | K8s imagePullPolicy not set | **Fixed** — all manifests use `imagePullPolicy: IfNotPresent`; verified in Phase 9 |
| A.1.5 | Frontend nginx.conf DNS incompatible with K8s | **N/A** — nginx.conf service names match K8s service names exactly; /api/restaurants returned 4 results in Phase 9 |
| A.2.6 | No transactional outbox | **Confirmed** — order 27 placed with broker down had no payment created |
| A.2.7 | No RabbitMQ reconnect loop | **Fixed** — reconnect loop implemented; both services reconnect after broker restart |
| A.2.8 | Acks regardless of outcome, DLQ missing | **Confirmed** — a DLQ (`payment_queue_dead`) exists but poison messages that throw on INSERT are not explicitly nacked |
| A.2.9 | RABBITMQ_URL has no credentials | **Confirmed** — prod RABBITMQ_URL is `amqp://rabbitmq:5672` (no auth). Works only with guest/guest default |
| A.2.10 | Order-service fan-out, no timeout | **Fixed** — axios calls have 5000ms timeout; tested in Phase 10 chaos (user-service down) |
| A.3.11 | JWT_SECRET not shared with downstream services | **Fixed** — all services validate JWT via shared auth middleware |
| A.3.12 | CORS unspecified | **Fixed** — CORS headers added to dev services; prod uses nginx proxy (CORS not needed) |
| A.3.13 | Default Grafana admin/admin in prod | **Fixed** — prod uses `${GRAFANA_PASSWORD:-admin}`; .env sets `changeme` |
| A.4.14 | Probes only on payment-service | **Fixed** — all 5 service deployments have readiness + liveness probes; verified in Phase 9 |
| A.4.15 | Postgres on emptyDir in K8s | **Confirmed** — data loss on pod restart verified in Phase 9 (7 rows → 6 after restart) |
| A.4.16 | Single-replica Postgres + RabbitMQ (SPOF) | **N/A** — Acceptable for demo per spec |
| A.4.17 | No HPA / no PDB | **N/A** — Acceptable for demo per spec |
| A.4.18 | Prometheus K8s scrape lacks pod discovery | **Confirmed** — no kubernetes-pods job; app metrics invisible in K8s |
| A.5.19 | Cross-schema FKs across services | **N/A** — DDL uses no cross-schema FKs; schemas are isolated (confirmed in Phase 4) |
| A.5.20 | init.sql runs once (volume reset needed) | **Confirmed** — re-seeding requires `docker compose down -v` |

---

## All Defects

| ID | Severity | Phase | Description | Status |
|----|----------|-------|-------------|--------|
| DEFECT-0-01 | HIGH | 0 | JWT expiry 7d (should be ≤24h) | Open |
| DEFECT-6-01 | HIGH | 6 | Broker-down: order message silently dropped, no retry | Open |
| DEFECT-7-01 | MEDIUM | 7 | Grafana Prometheus datasource not provisioned | Open |
| DEFECT-8-01 | HIGH | 8 | Test compose fails: jest not in prod Docker image (--omit=dev) | Open |
| DEFECT-8-02 | INFO | 8 | Test compose frontend runs dev server instead of tests | Open |
| DEFECT-8-03 | LOW | 8 | RABBITMQ_URL has no auth credentials in prod | Open |
| DEFECT-10-01 | MEDIUM | 10 | JWT expiry 7d confirmed in source code | Open |
| DEFECT-10-02 | INFO | 10 | User-service down returns 500 instead of 503 with internal error message | Open |
| DEFECT-11-01 | MEDIUM | 11 | Payment route documented as /by-order/:id but actual path is /order/:id | Open |
| DEFECT-11-02 | HIGH | 11 | GET /api/orders/restaurant/:id returns 200 without authentication | Open |
| DEFECT-11-03 | LOW | 11 | PUT /api/users/:id (with numeric ID) returns 404 — only /api/users/me works | Open |
| DEFECT-9-01 | MEDIUM | 9 | minikube cannot pull public images from Docker Hub/gcr.io (TLS EOF in container). Requires `minikube image load` pre-step. | Open |
| DEFECT-9-02 | HIGH | 9 | Postgres uses emptyDir — all runtime data (orders, users, payments) lost on pod restart | Open (known limitation) |
| DEFECT-9-03 | LOW | 9 | RabbitMQ StatefulSet has no readiness/liveness probes | Open |
| DEFECT-9-05 | HIGH | 9 | pg.Pool does not auto-recover after Postgres pod restart — "Connection terminated unexpectedly" on all queries until service is manually rolled | Open |
| DEFECT-9-06 | MEDIUM | 9 | CoreDNS desync after minikube Docker container crash — DNS returns wrong CGNAT IPs (198.18.x.x); requires full minikube stop/start to recover | Open |
| DEFECT-9-07 | MEDIUM | 9 | minikube Docker container exits (SIGINT/code 130) under resource pressure during heavy pod churn on Windows Docker Desktop | Open |

---

## Priority Fixes Recommended

### Critical / High
1. **DEFECT-11-02** — Add `authenticate` middleware to `GET /api/orders/restaurant/:restaurantId` in order-service. Any unauthenticated request currently returns all customer order data.
2. **DEFECT-6-01** — Implement transactional outbox or at-least-once delivery for payment messages. When RabbitMQ is unavailable, the order is created but no payment is ever processed.
3. **DEFECT-8-01** — Add a `test` stage in each backend Dockerfile that does `npm ci` (with devDeps) and runs `npm test`. The `docker-compose.test.yml` override or Dockerfile target should use this stage.
4. **DEFECT-0-01 / 10-01** — Change `expiresIn` in `services/user-service/src/config.js` from `'7d'` to `'24h'`. Add refresh token support if needed.
5. **DEFECT-9-05** — Add `connectionTimeoutMillis: 5000` to all `pg.Pool` configurations and implement an `on('error')` handler that removes dead clients. Without this, any Postgres pod restart requires a manual service rollout to restore DB connectivity.

### Medium
5. **DEFECT-7-01** — Add `grafana/provisioning/datasources/prometheus.yml` and mount in `docker-compose.*.yml` so Grafana has the Prometheus datasource auto-configured.
6. **DEFECT-8-03** — Update `RABBITMQ_URL` in backend services to `amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@rabbitmq:5672` so credentials are not hardcoded.
7. **A.1.4** — ~~Add `imagePullPolicy: IfNotPresent`~~ Already fixed in all K8s Deployment specs (Phase 9 confirmed).
8. **A.1.5** — ~~Parameterize nginx.conf~~ Service names in nginx.conf already match K8s service names; not a bug (Phase 9 confirmed).

### Low / Info
9. **DEFECT-10-02** — Return 503 (not 500) when an upstream service is unreachable. Sanitize error messages to hide internal topology.
10. **A.4.14** — ~~Add readiness and liveness probes to other services~~ All deployments already have probes (Phase 9 confirmed).
11. **A.4.18** — Add `kubernetes-pods` scrape job to Prometheus K8s config to enable annotation-based app metrics discovery.

---

## Test Statistics

| Metric | Count |
|--------|-------|
| Total phases executed | 11 |
| Phases passed | 6 |
| Phases partial pass | 5 |
| Phases skipped | 0 |
| Phases failed | 0 |
| Total unit tests | 69 |
| Total E2E assertions | 13 |
| Total acceptance tests | 26 |
| K8s assertions | 23 |
| Defects found | 17 |
| High severity defects | 7 |
| Medium severity defects | 6 |
| Low/info defects | 4 |

## Environment Notes

- Tests ran on Windows 11 + Docker Desktop with WSL2 backend
- Node.js v24.13.0 (host), Node.js v20.20.2 (containers)
- minikube v1.36.0 with Docker driver — Phase 9 fully executed (second test run adds DEFECT-9-05/06/07)
- Public images (rabbitmq, prometheus, grafana) required `minikube image load` due to TLS connectivity issues from minikube container
- `tc qdisc`, `nikto`, `sqlmap` skipped (Linux-only / require separate install)
- All Docker Compose commands, curl tests, Node.js scripts ran natively on Windows
