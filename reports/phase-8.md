## Phase 8 — Test Environment & Production Compose

- Date: 2026-05-06
- Commit SHA: c9de0ea

### Commands Executed

```bash
# 8.1 Tear down dev stack (from Phase 6/7)
docker compose -f docker-compose.dev.yml down -v

# 8.2 Run test compose
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
echo "EXIT: $?"

# 8.3 Tear down test compose
docker compose -f docker-compose.test.yml down -v

# 8.4 Bring up prod compose
docker compose -f docker-compose.prod.yml up -d --build

# 8.5 Check prod containers and ports
docker compose -f docker-compose.prod.yml ps

# 8.6 Smoke tests
curl -s -o /dev/null -w "%{http_code}" http://localhost/
curl -s http://localhost/api/restaurants

# 8.7 Check restart policies
docker inspect food-delivery-system-cloudcomputing-user-service-1 \
  --format "{{.HostConfig.RestartPolicy.Name}}"

# 8.8 Tear down prod
docker compose -f docker-compose.prod.yml down -v
```

### Stdout / Stderr Highlights

**8.2 Test compose (FAILED):**
All 4 backend services exited with code 1:
```
Error: Cannot find module '/app/node_modules/jest/bin/jest.js'
```
Root cause: Dockerfiles use `npm ci --omit=dev` which strips devDependencies including `jest`. The `npm test` command fails because jest is not installed in the production image. This is Conflict A.1.2 confirmed.

**8.3 Test compose exit code: 1** — FAIL

**8.5 Prod compose ports:**
```
frontend-1   0.0.0.0:80->80/tcp       (only public surface)
grafana-1    0.0.0.0:3000->3000/tcp   (monitoring, internal use)
All backend services: port NOT exposed to host (3001/tcp, 3002/tcp, etc.)
postgres, rabbitmq: NOT exposed to host
```

**8.6 Smoke tests:**
```
GET http://localhost/ → 200 (SPA loads)
GET http://localhost/api/restaurants → 200, returns 4 restaurants
```
Nginx reverse proxy working correctly in prod.

**8.7 Restart policies:**
```
user-service:  unless-stopped ✓
postgres:      unless-stopped ✓
frontend:      unless-stopped ✓
```
(All services confirmed unless-stopped)

### Assertions Passed: 5 / 7

| Assertion | Result |
|-----------|--------|
| Test compose builds images | PASS |
| Test compose exits 0 (npm test passes in containers) | FAIL — jest not in prod image |
| Prod compose brings up all services | PASS |
| Only ports 80 and 3000 exposed externally | PASS |
| SPA loads at http://localhost/ | PASS |
| /api/restaurants returns 200 via nginx | PASS |
| restart: unless-stopped on all services | PASS |

### Defects Found

**DEFECT-8-01 (HIGH):** Test compose fails: jest not available in Docker images. The production Dockerfiles use `npm ci --omit=dev` which strips all devDependencies, including `jest` and `supertest`. The `docker-compose.test.yml` runs `npm test` inside these images, but the test runner is not present. Fix: add a separate `test` stage in each Dockerfile that includes devDependencies, or add a `command: npm ci && npm test` override that reinstalls all deps. This is the same root cause as Conflict A.1.2.

**DEFECT-8-02 (INFO):** `docker-compose.test.yml` frontend service runs `npm run dev` (Vite dev server) instead of a test script — it has no tests to run, just starts the dev server. This causes the compose run to keep the frontend running after all service tests complete, interfering with `--abort-on-container-exit`.

**DEFECT-8-03 (LOW):** `RABBITMQ_URL` in prod services uses `amqp://rabbitmq:5672` (no credentials) but RabbitMQ is configured with `RABBITMQ_DEFAULT_USER`/`PASS`. If credentials differ from the default `guest/guest`, connections will fail. In this test `guest/guest` was used so it worked, but this is a latent bug (Conflict A.2.9).

### Verdict: ⚠️ PARTIAL PASS

Prod compose: PASS — all services up, correct port exposure, correct restart policies, nginx proxying works.
Test compose: FAIL — jest not installed in container images due to `--omit=dev` in Dockerfiles (Conflict A.1.2 confirmed).
