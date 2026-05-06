## Phase 6 — Messaging & Async Tests

- Date: 2026-05-06
- Commit SHA: c9de0ea

### Commands Executed

```bash
# 6.1 Queue visibility
docker compose -f docker-compose.dev.yml exec -T rabbitmq \
  rabbitmqctl list_queues name durable messages consumers

# 6.2 Throughput: 20 orders placed via node tests/phase6-throughput.js 20

# DB counts after throughput
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery \
  -c "SELECT count(*) FROM order_svc.orders;"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d food_delivery \
  -c "SELECT count(*) FROM payment_svc.transactions;"

# 6.3 Consumer-down: stop payment-service, place 5 orders, check queue, restart
docker compose -f docker-compose.dev.yml stop payment-service
node tests/phase6-throughput.js 5
docker compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_queues ...
docker compose -f docker-compose.dev.yml start payment-service

# 6.4 Broker-down: stop rabbitmq, place order, document behavior
docker compose -f docker-compose.dev.yml stop rabbitmq
curl -X POST http://localhost:3003/api/orders ...
docker compose -f docker-compose.dev.yml start rabbitmq
```

### Stdout / Stderr Highlights

**6.1 Queue visibility:**
```
name              durable  messages  consumers
payment_queue_dead  true     0         0
payment_queue       true     0         1
```
payment_queue: durable=true, 1 consumer active.

**6.2 Throughput test (20 orders):**
```
Results: 20/20 success, 0 failures
Latency — avg: 14ms, p95: 34ms
Orders placed: 20, IDs sample: 2,3,4,5,6
```
DB after throughput: orders=21, transactions=21 (1:1 match including Phase 5 order).

**6.3 Consumer-down test:**
- 5 orders placed while payment-service stopped: 5/5 success, all returned 201 immediately
- Queue depth after: `payment_queue: messages=5, consumers=0`
- After restarting payment-service and waiting 10s: transactions count = 26 (increased by 5)
- All 5 queued messages drained successfully on restart.

**6.4 Broker-down test:**
- RabbitMQ stopped, order POST returned 201 with order ID=27 (order persisted in DB)
- Order-service logs: `RabbitMQ channel not available, skipping payment message`
- Order-service has reconnect loop: attempted 4 retries before giving up on that message
- After RabbitMQ restart: both order-service and payment-service reconnected automatically
- Order 27 has NO corresponding transaction — message was silently dropped (confirmed defect A.2.8)
- Final counts: orders=27, transactions=26 (1 orphan order)

### Assertions Passed: 7 / 8

| Assertion | Result |
|-----------|--------|
| payment_queue exists, durable=true | PASS |
| payment_queue has 1 consumer (dev stack) | PASS |
| 20 orders throughput: all 201 | PASS |
| orders count == transactions count (throughput) | PASS |
| Producer returns 201 while consumer down | PASS |
| Messages drain when consumer restarts | PASS |
| Order-service + payment-service reconnect after broker restart | PASS |
| Order placed with broker down is not silently lost (target behavior) | FAIL — message dropped, no DLQ fallback |

### Defects Found

**DEFECT-6-01 (HIGH):** Broker-down order message lost. When RabbitMQ is unavailable during `POST /api/orders`, the order is persisted (201 returned) but the payment message is silently dropped. The reconnect loop does not retry the failed publish. Root cause: `getChannel()` returns null and the code logs a warning and skips — no retry queue, no DLQ fallback. Fix: use a local in-memory retry buffer or transactional outbox pattern (see Conflict A.2.6).

### Verdict: ⚠️ PARTIAL PASS

6.1, 6.2, 6.3 fully passed. 6.4 confirmed the known defect (A.2.6 transactional outbox, A.2.8 ack regardless of outcome). The reconnect loop works correctly on both sides. The broker-down scenario results in data loss — filed as DEFECT-6-01.
