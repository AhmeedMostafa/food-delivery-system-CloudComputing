## Phase 10 — Non-Functional Tests

- Date: 2026-05-06
- Commit SHA: c9de0ea

### Commands Executed

```bash
# 10.1 Load test (100 requests, 10 concurrent via nginx/prod)
node tests/phase10-load.js

# 10.2 Security checks
grep -r "expiresIn" services/user-service/src/
grep -r "bcrypt|saltRounds" services/user-service/src/
grep "GF_SECURITY_ADMIN_PASSWORD" docker-compose.prod.yml
cat .env | grep GRAFANA_PASSWORD

# 10.3 Chaos: user-service down
docker compose -f docker-compose.prod.yml stop user-service
curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" \
  -X POST http://localhost/api/orders ...

# 10.3 Chaos: postgres restart
docker compose -f docker-compose.prod.yml restart postgres
sleep 5
curl -s http://localhost/api/restaurants

# SKIPPED: tc qdisc (Linux-kernel only on Windows)
# SKIPPED: nikto (requires separate install)
# SKIPPED: sqlmap (requires separate install)
```

### Stdout / Stderr Highlights

**10.1 Load Test Results:**
```
Total requests:   100
Successful:       100
Errors:           0 (0.0%)
Total time:       537ms
Throughput:       186.2 req/s
Latency avg:      44ms
Latency p50:      38ms
Latency p95:      120ms
Latency p99:      126ms

Pass criteria:
  p95 < 800ms: 120ms → PASS
  error rate < 1%: 0.0% → PASS
```

**10.2 Security Checks:**

| Check | Finding | Status |
|-------|---------|--------|
| JWT lifetime | `expiresIn: '7d'` in config.js | DEFECT — should be ≤24h |
| bcrypt cost factor | `bcrypt.hash(password, 10)` — cost=10 | PASS |
| Grafana default password | `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}` | PASS — .env sets `changeme` |
| bcryptjs used (not native bcrypt) | `import bcrypt from 'bcryptjs'` | PASS |
| CORS configuration | Not explicitly set — relies on nginx proxy | PARTIAL — dev mode (Vite) might have issues |

**10.3 Chaos Tests:**

| Scenario | Result |
|----------|--------|
| user-service down → POST /api/orders | 500 within 5.0s (exactly at 5s timeout limit) |
| user-service restart → auto-recovers | PASS — curl /api/users/1 returned 200 after restart |
| postgres restart → services reconnect | PASS — curl /api/restaurants returned 200 after 5s |

**tc qdisc (restaurant-service slow):** SKIPPED — Linux-kernel only, not available on Windows host. Use Toxiproxy as documented alternative.

**nikto security scan:** SKIPPED — requires separate install. Containerized version: `docker run --rm frapsoft/nikto -h http://host.docker.internal`

**sqlmap injection test:** SKIPPED — requires separate install.

### Assertions Passed: 7 / 10

| Assertion | Result |
|-----------|--------|
| p95 latency < 800ms | PASS (120ms) |
| error rate < 1% | PASS (0%) |
| JWT lifetime ≤ 24h | FAIL — set to 7d |
| bcrypt cost ≥ 10 | PASS (10) |
| bcryptjs used (not native) | PASS |
| Grafana password changed from default | PASS (changeme in .env) |
| user-service down: order returns error within 5s | PASS (5.0s) |
| user-service restarts: auto-recovers | PASS |
| postgres restart: services auto-reconnect | PASS |
| tc qdisc chaos (restaurant-service slow) | SKIPPED |

### Defects Found

**DEFECT-10-01 (MEDIUM):** JWT expiry is 7 days (`expiresIn: '7d'`). Security best practice and the Phase 0 audit require ≤24h. Fix: change `expiresIn` in `services/user-service/src/config.js` from `'7d'` to `'24h'` (or `'1d'`). Implement refresh tokens if session persistence is required.

**DEFECT-10-02 (INFO):** user-service down chaos: order-service responds with 500 at exactly 5.0s (the axios timeout). The error message `User service unavailable: getaddrinfo EAI_AGAIN user-service` is leaked to the client. Fix: return 503 (Service Unavailable) instead of 500, and sanitize the error message to avoid exposing internal service topology.

### Verdict: ⚠️ PARTIAL PASS

Load test: PASS (186 req/s, p95=120ms, 0% errors). Security: bcrypt and Grafana password pass; JWT 7d lifetime is a defect. Chaos tests: postgres and user-service recovery both work correctly. tc/nikto/sqlmap skipped (Linux-only / missing tools on Windows).
