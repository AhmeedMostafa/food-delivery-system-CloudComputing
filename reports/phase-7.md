## Phase 7 — Observability Verification

- Date: 2026-05-06
- Commit SHA: c9de0ea

### Commands Executed

```bash
# 7.1 Prometheus targets
curl -s http://localhost:9090/api/v1/targets

# 7.2 Prometheus 'up' metric count
curl -s "http://localhost:9090/api/v1/query?query=up"

# 7.3 Container memory metrics
curl -s "http://localhost:9090/api/v1/query?query=container_memory_usage_bytes"

# 7.4 Grafana health
curl -s -u admin:admin http://localhost:3000/api/health

# 7.5 Grafana datasources
curl -s -u admin:admin http://localhost:3000/api/datasources

# 7.6 RabbitMQ management UI queues
curl -s -u guest:guest http://localhost:15672/api/queues
curl -s -u guest:guest http://localhost:15672/api/overview
```

### Stdout / Stderr Highlights

**7.1 Prometheus targets:**
```json
{"job":"cadvisor","health":"up"}
{"job":"prometheus","health":"up"}
```
Both targets up.

**7.2 Prometheus 'up' metric:**
```
up results: 2
```
2 active targets.

**7.3 Container memory metrics:**
```
container_memory_usage_bytes results: 18
```
18 container memory series — cAdvisor is collecting metrics.

**7.4 Grafana health:**
```json
{"database":"ok","version":"13.0.1","commit":"a100054f"}
```
Grafana is healthy on http://localhost:3000.

**7.5 Grafana datasources:**
```json
[]
```
No datasources configured — Grafana is running but the Prometheus datasource has not been provisioned. This is a gap; dashboards would not work.

**7.6 RabbitMQ management:**
```
payment_queue
payment_queue_dead
```
Both queues visible. RabbitMQ version 3.13.7.

### Assertions Passed: 4 / 5

| Assertion | Result |
|-----------|--------|
| Prometheus targets: cadvisor=up, prometheus=up | PASS |
| container_memory_usage_bytes results > 0 | PASS |
| Grafana accessible (HTTP 200) | PASS |
| payment_queue visible in RabbitMQ management API | PASS |
| Grafana has Prometheus datasource configured | FAIL — datasource list is empty |

### Defects Found

**DEFECT-7-01 (MEDIUM):** Grafana Prometheus datasource not provisioned. The Grafana container starts but has no datasource configured (returns empty array from `/api/datasources`). A provisioning config file at `grafana/provisioning/datasources/prometheus.yml` is missing or not mounted. This means dashboards cannot query Prometheus data. Fix: add a datasource provisioning YAML and mount it in the Grafana container.

### Verdict: ⚠️ PARTIAL PASS

Prometheus scraping is working (cadvisor + prometheus targets both up, 18 container memory series collected). Grafana is accessible. RabbitMQ management UI reports both queues. Grafana datasource is not provisioned — no dashboards will work without manual setup.
