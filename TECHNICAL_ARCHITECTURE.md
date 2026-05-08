# Project Technical Documentation: Food Delivery System

This document provides a deep-dive into the architectural decisions, component
structure, and operational logic of the Food Delivery System. It is designed to
onboard developers and explain the "why" behind the implementation.

---

## 1. Project Architecture & Philosophy

### Architectural Pattern: Microservices

The system is built using a **Microservices Architecture**. Instead of a single
monolithic application, the logic is split into four decoupled services:
`user-service`, `restaurant-service`, `order-service`, and `payment-service`.

**Why this pattern?**

- **Scalability:** Each service can be scaled independently. For example, the
  `restaurant-service` (high read volume) can have more replicas than the
  `payment-service`.
- **Fault Isolation:** A failure in the `payment-service` does not prevent users
  from browsing restaurants or managing their profiles.
- **Technology Agility:** While all current services use Node.js, individual
  services could be rewritten in different languages (e.g., Go for
  performance-critical logic) without affecting the rest of the system.

### Request Life Cycle: The 'Order' Flow

The most complex flow in the system is the order placement. Here is the
step-by-step lifecycle:

1. **Frontend Initialization:** The React app collects the `user_id`,
   `restaurant_id`, and an array of `items` (menu item IDs and quantities).
2. **Order Service Gateway:** The request hits `POST /api/orders`.
3. **Cross-Service Validation (User):** The Order Service calls `user-service`
   via REST to verify the user exists and is active.
4. **Price Integrity Check (Restaurant):** The Order Service calls
   `restaurant-service` to fetch the _current_ price and availability of each
   menu item. **Logic:** We never trust the price sent from the client to
   prevent fraud.
5. **Atomic Transaction:** Once validated, the Order Service opens a PostgreSQL
   transaction to:
   - Insert a record into `order_svc.orders`.
   - Insert multiple records into `order_svc.order_items`, capturing a snapshot
     of the name and price at the time of purchase.
6. **Asynchronous Payment Trigger (RabbitMQ):** After the DB commit, the Order
   Service publishes a message to the `payment_queue` on RabbitMQ containing
   `{order_id, user_id, amount, method}`. The Payment Service consumes this
   message asynchronously and records a `COMPLETED` transaction in
   `payment_svc.transactions`. If the message is malformed or processing fails,
   it is routed to a **Dead Letter Queue** (`payment_queue_dead`) for manual
   review.
7. **Final Confirmation:** The user receives a `201 Created` status with the
   full order details.

---

## 2. Detailed Component Directory

### Folder Structure

| Directory                 | Purpose                                                                                                                            |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------- |
| `/services`               | Contains the source code for the 4 microservices. Each is a standalone Node.js/Express app.                                        |
| `/frontend`               | A React single-page application (SPA) built with Vite and styled with modern CSS. Served by nginx in production.                   |
| `/database`               | Contains `Dockerfile` and `init.sql`, the source of truth for the database schema and seed data.                                   |
| `/k8s`                    | **26** Kubernetes manifests for deploying the system to any cluster (Deployments, Services, ConfigMaps, Secrets, StatefulSets, RBAC, Monitoring, Logging). |
| `/tests/e2e`              | End-to-end test suite (`run-e2e.js`) — 44 assertions against the live stack.                                                       |
| `docker-compose.dev.yml`  | Development environment — hot-reloading with nodemon, ports exposed.                                                               |
| `docker-compose.test.yml` | Test environment — isolated DB, runs `npm test` in each service.                                                                   |
| `docker-compose.prod.yml` | Production environment — nginx frontend, no source mounts, restart policies, strict env var requirements.                          |

### Core Logic Files

- **`services/order-service/src/routes/orders.js`**: The "brain" of the ordering
  process. It coordinates inter-service calls, manages the order state machine
  (`PLACED` -> `ACCEPTED` -> `PREPARING` -> `OUT_FOR_DELIVERY` -> `DELIVERED`),
  and publishes payment messages to RabbitMQ.
- **`services/order-service/src/rabbitmq.js`**: Connects to RabbitMQ with
  exponential backoff retry and auto-reconnect. Produces messages to
  `payment_queue`.
- **`services/payment-service/src/rabbitmq.js`**: Consumes messages from
  `payment_queue`. Sets up Dead Letter Exchange (DLX) infrastructure for failed
  message handling.
- **`services/user-service/src/middleware/auth.js`**: Implements JWT
  verification (`requireAuth`) and role-based access (`requireRole`). Ensures
  only authenticated users access protected resources.
- **`frontend/src/context/AuthContext.jsx`**: Manages the global authentication
  state in the browser, storing the JWT and user profile.
- **`frontend/nginx.conf`**: Production reverse proxy — routes `/api/*` requests
  to the correct backend service.

---

## 3. Data & Communication Layer

### Data Models (PostgreSQL Schemas)

We use a **Database-per-Service** pattern, but for simplicity in this project,
they share a single PostgreSQL instance separated by **4 Postgres Schemas**.

| Schema           | Table          | Description                                                                                           |
| :--------------- | :------------- | :---------------------------------------------------------------------------------------------------- |
| `user_svc`       | `users`        | Stores credentials, profile data, and roles (`customer`, `restaurant_owner`, `delivery_driver`).      |
| `restaurant_svc` | `restaurants`  | Stores restaurant metadata (name, cuisine, rating).                                                   |
| `restaurant_svc` | `menu_items`   | Links food items to restaurants with pricing and availability.                                        |
| `order_svc`      | `orders`       | The header record for an order, including status, total price, delivery address, and assigned driver. |
| `order_svc`      | `order_items`  | Snapshot of items purchased (includes price at time of order).                                        |
| `payment_svc`    | `transactions` | Ledger of all payment attempts, their status, method, and amount.                                     |

### Communication Strategy

1. **Synchronous (Service-to-Service):** REST calls via `axios`. Services
   discover each other using environment variables (Docker Compose) or K8s
   internal DNS (e.g., `http://user-service:3001`).
2. **Asynchronous (Order → Payment):** RabbitMQ message queue. The Order Service
   publishes to `payment_queue`; the Payment Service consumes and processes.
   Failed messages are routed to a Dead Letter Queue.
3. **External (Client-to-Service):** The Frontend communicates with services via
   REST. In production, nginx reverse-proxies all `/api/*` calls. Authentication
   is handled by passing a Bearer Token (JWT) in the `Authorization` header.

---

## 4. Infrastructure & Cloud Integration

### Docker Strategy

- **Development (`docker-compose.dev.yml`):** Uses `volumes` to mount local
  source code into the container. `nodemon` watches for changes, allowing for a
  "save-and-refresh" workflow without rebuilding images. Builds include dev
  dependencies. Focused purely on core business logic (App + DB + RabbitMQ).
- **Test (`docker-compose.test.yml`):** Uses a separate database
  (`food_delivery_test`) and different ports (4001-4004) so it can run alongside
  dev. Each service runs `npm test` as its command.
- **Production (`docker-compose.prod.yml`):** Uses **Multi-stage builds**. Only
  production dependencies are installed. The frontend is built into static files
  and served by nginx. Environment variables use `${VAR:?error}` syntax to
  enforce explicit configuration. Services have `restart: unless-stopped`
  policies. Observability tools are omitted here to keep the dev environment
  lightweight; monitoring is treated as a platform-level concern in Kubernetes.

### Docker Image Build Strategy

All backend services use a **2-stage Dockerfile**:

1. **deps stage:** Installs npm packages using `npm install --omit=dev` for production.
2. **runtime stage:** Copies only `node_modules`, `src/`, and `package.json`
   into a clean Alpine image. Runs as `USER node` (non-root) for security.

The frontend uses a **3-stage Dockerfile**:

1. **builder:** Installs all dependencies (used as the target for dev compose).
2. **build-stage:** Runs `vite build` to produce optimized static files.
3. **runtime:** Copies the built files into an `nginx:alpine` image with a
   custom `nginx.conf`.

### Kubernetes Architecture

The project includes **26 K8s manifests** in the `/k8s` directory, deployable to any standard Kubernetes cluster:

| Resource Type   | What It Does                                                       | Key Files |
| :-------------- | :----------------------------------------------------------------- | :-------- |
| **Secret**      | Stores sensitive data (DB password, JWT secret, RabbitMQ creds)   | `00-secret.yaml` |
| **ConfigMap**   | Non-sensitive config (DB host, service URLs, init.sql, Prometheus config, Grafana dashboard) | `01-configmap.yaml`, `16-prometheus-configmap.yaml`, `23-grafana-dashboard.yaml` |
| **Deployment**  | Defines pod templates + replica count for stateless services       | `04, 06, 08, 10, 12, 17, 22` |
| **StatefulSet** | Stable storage for PostgreSQL, RabbitMQ, Grafana, and Loki         | `02, 14, 19, 24` |
| **DaemonSet**   | Runs one pod per node — used by Promtail for log collection        | `25-promtail.yaml` |
| **Service**     | Network endpoints (ClusterIP for internal, NodePort for external)  | `03, 05, 07, 09, 11, 13, 15, 18, 20, 24` |
| **RBAC**        | Security permissions for Prometheus and Promtail to access the cluster API | `21-prometheus-rbac.yaml`, `25-promtail.yaml` |

#### Service Exposure

| Service              | Type                  | Port  |
| :------------------- | :-------------------- | :---- |
| `frontend-service`   | **NodePort**          | 30080 |
| `rabbitmq-service`   | **NodePort**          | 30003 |
| `prometheus-service` | **NodePort**          | 30002 |
| `grafana-service`    | **NodePort**          | 30001 |
| All backend services | ClusterIP (internal)  | —     |
| PostgreSQL           | ClusterIP (internal)  | 5432  |

### Kubernetes Observability & Monitoring

The observability stack is **fully automated** within the Kubernetes cluster, providing deep visibility into production workloads that is not required during local development.

#### Components

| Component | Manifest | Purpose |
|:----------|:---------|:--------|
| **Prometheus** | `16,17,18` | Collects metrics every 15s via Kubernetes Service Discovery |
| **Grafana** | `19,20,23` | Pre-provisioned dashboards with Prometheus + Loki data sources (StatefulSet with PVC for persistence) |
| **kube-state-metrics** | `22` | Exposes Kubernetes object metrics (deployment replicas, pod states) |
| **Loki** | `24` | Central log storage — StatefulSet with 5Gi PVC, persists all pod logs |
| **Promtail** | `25` | DaemonSet log shipper — runs on every node, tails `/var/log/pods/` and pushes to Loki |
| **RBAC** | `21, 25` | Grants Prometheus access to `nodes`, `pods`, `deployments`; grants Promtail access to pod metadata |

#### Centralized Log Collection (Loki + Promtail)

The logging stack works as follows:

1. **Promtail** runs as a `DaemonSet` (one pod per cluster node)
2. It mounts `/var/log/pods/` from the host and tails all container log files
3. It queries the Kubernetes API (via RBAC) to enrich logs with pod labels (`app`, `namespace`, `pod`, `container`)
4. Logs are shipped to **Loki** via HTTP (`http://loki:3100/loki/api/v1/push`)
5. Loki stores logs persistently on a **5Gi PVC** — surviving pod restarts
6. **Grafana** has Loki pre-configured as a datasource → use **Explore → Loki** to query logs

#### Sample LogQL Queries

```logql
# All logs from a specific service
{app="order-service"}

# Filter for errors across the entire cluster
{namespace="default"} |= "error"

# Combine metrics + logs (correlation)
{app="payment-service"} |= "payment_queue"
```

#### How prom-client Works

Every microservice is natively instrumented with `prom-client` (v15.1.0):
- Exposes a `/metrics` endpoint with Node.js runtime metrics (heap, event loop, GC)
- Pods are annotated with `prometheus.io/scrape: "true"` so Prometheus auto-discovers them

#### How Prometheus Service Discovery Works

Prometheus uses the Kubernetes API (authorized via RBAC) to:
1. List all pods in the cluster
2. Filter pods with annotation `prometheus.io/scrape: "true"`
3. Scrape each pod's `/metrics` endpoint on the declared port
4. Apply relabeling rules to normalize `node`, `namespace`, and `pod` labels

#### Grafana Auto-Provisioning

The Grafana StatefulSet mounts two ConfigMaps at startup:
- `grafana-provisioning-datasource` → `/etc/grafana/provisioning/datasources/` (auto-connects to Prometheus)
- `grafana-food-delivery-dashboard` → `/etc/grafana/dashboards/` (loads the Food Delivery dashboard)

This means **Grafana is fully configured on first boot** with no manual steps required.

---

## 5. User Roles & Access Control

| Role               | Access                                                                          | Frontend Pages                          |
| :----------------- | :------------------------------------------------------------------------------ | :-------------------------------------- |
| `customer`         | Browse restaurants, add to cart, place orders, view order history, edit profile | Home, Restaurant, Cart, Orders, Profile |
| `restaurant_owner` | Manage their restaurant menu, view/accept incoming orders, assign drivers       | Dashboard, Profile                      |
| `delivery_driver`  | View assigned deliveries, update order status                                   | Deliveries, Profile                     |

The JWT token includes `id`, `email`, `role`, and `restaurant_id` (for owners).
The frontend uses route guards to enforce access based on role.

---

## 6. Technical Glossary

- **Loki:** A log aggregation system by Grafana Labs. Stores logs indexed by labels
  (not full-text), making it lightweight and fast. Queries use LogQL.
- **Promtail:** A log shipping agent that tails pod log files on each node and pushes
  them to Loki. Runs as a DaemonSet to cover all nodes.
- **LogQL:** Loki's query language. Similar to PromQL but for logs. Uses label
  selectors `{app="name"}` and filter expressions `|= "keyword"`.
- **DaemonSet:** A Kubernetes workload that ensures exactly one pod runs on
  every node in the cluster. Used by Promtail to collect logs from all nodes.
- **JWT (JSON Web Token):** A stateless authentication mechanism. The server
  signs a token containing user data, and the client sends it back with every
  request. No session storage is needed on the server.
- **Middleware:** Functions that execute during the request-response cycle
  (e.g., logging, auth checks). In this project, `requireAuth` and `requireRole`
  are key middleware.
- **RabbitMQ:** An open-source message broker that enables asynchronous
  communication between services. The Order Service _produces_ messages; the
  Payment Service _consumes_ them.
- **Dead Letter Queue (DLQ):** A special queue where messages that fail
  processing are routed (via a Dead Letter Exchange). This prevents data loss
  and allows manual review of failures.
- **Multi-stage Docker Build:** A Dockerfile technique using multiple `FROM`
  statements to separate build-time concerns from runtime, resulting in smaller
  and more secure final images.
- **StatefulSet:** A Kubernetes workload API object for managing stateful
  applications (like RabbitMQ, PostgreSQL, and Grafana) that require stable storage and
  network identity.
- **NodePort:** A Kubernetes Service type that exposes a service on a static
  port on every node's IP, making it accessible from outside the cluster.
- **ConfigMap / Secret:** Kubernetes objects for injecting configuration and
  sensitive data into pods without baking them into container images.
- **Readiness/Liveness Probes:** Kubernetes health checks. Readiness determines
  if a pod should receive traffic; liveness determines if a pod should be
  restarted.
- **prom-client:** The official Node.js Prometheus client library. Exposes
  runtime metrics (heap usage, event loop lag, GC stats) at a `/metrics` endpoint.
- **kube-state-metrics:** A service that listens to the Kubernetes API and
  generates metrics about object states (e.g., `kube_deployment_status_replicas_available`).
- **cAdvisor:** A container advisor built into Kubernetes nodes that collects
  real-time CPU, memory, and network usage per container.
- **Relabeling (Prometheus):** A configuration technique that transforms or
  normalizes metric labels at scrape time. Used here to ensure labels like
  `node`, `namespace`, and `pod` are standardized across all scraped targets.
- **CRUD:** Create, Read, Update, Delete. The standard operations performed on
  most entities (e.g., creating a user, reading a menu).
- **SPA (Single Page Application):** The frontend approach where the browser
  loads one HTML page and dynamically updates the content as the user interacts,
  providing a fluid experience.
- **Statelessness:** The architectural principle where the server does not store
  any client context between requests. This is what allows us to scale to 2 or
  200 replicas of the `user-service` seamlessly.
