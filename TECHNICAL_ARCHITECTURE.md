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
| `/k8s`                    | 22 Kubernetes manifests for deploying the system to a cluster (Deployments, Services, ConfigMaps, Secrets, StatefulSets, RBAC). |
| `/prometheus`             | Prometheus scrape configuration (`prometheus.yml`).                                                                                |
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
  dependencies.
- **Test (`docker-compose.test.yml`):** Uses a separate database
  (`food_delivery_test`) and different ports (4001-4004) so it can run alongside
  dev. Each service runs `npm test` as its command.
- **Production (`docker-compose.prod.yml`):** Uses **Multi-stage builds**. Only
  production dependencies are installed. The frontend is built into static files
  and served by nginx. Environment variables use `${VAR:?error}` syntax to
  enforce explicit configuration. Services have `restart: unless-stopped`
  policies.

### Docker Image Build Strategy

All backend services use a **2-stage Dockerfile**:

1. **deps stage:** Installs npm packages. Conditionally installs dev
   dependencies when `NODE_ENV=development` (for nodemon support in dev).
2. **runtime stage:** Copies only `node_modules`, `src/`, and `package.json`
   into a clean Alpine image. Runs as `USER node` (non-root) for security.

The frontend uses a **3-stage Dockerfile**:

1. **builder:** Installs all dependencies (used as the target for dev compose).
2. **build-stage:** Runs `vite build` to produce optimized static files.
3. **runtime:** Copies the built files into an `nginx:alpine` image with a
   custom `nginx.conf`.

### Kubernetes & High Availability

The project includes 22 K8s manifests in the `/k8s` directory:

- **Deployments:** Define the desired state. Backend services are configured
  with `replicas: 2` for high availability. Each has readiness and liveness
  probes hitting the `/health` endpoint.
- **Services:** `ClusterIP` for internal backend services. `NodePort` for the frontend (30080) and monitoring stack (30001-30003), allowing external access via a reverse proxy or Node IP.
- **ConfigMaps:** Centralize environment variables (DB host, service URLs) and
  embed the `init.sql` for Postgres initialization.
- **Secrets:** Store sensitive data (DB password, JWT secret, RabbitMQ
  credentials) base64-encoded.
- **StatefulSets:** Used for RabbitMQ and PostgreSQL (require stable storage via PersistentVolumeClaims).
- **RBAC:** Grants Prometheus permission to list pods via a `ServiceAccount`, `ClusterRole`, and `ClusterRoleBinding` (see `21-prometheus-rbac.yaml`).

### Monitoring & Observability

- **Prometheus:** Scrapes metrics every 15 seconds. Uses **Kubernetes Service Discovery** (via pod annotations like `prometheus.io/scrape`) to automatically find new service replicas.
- **Grafana:** Provides visual dashboards for system metrics (login:
  admin/admin).
- **cAdvisor:** Collects container-level resource usage (CPU, memory, network
  I/O).

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
  applications (like RabbitMQ and PostgreSQL) that require stable storage and
  network identity.
- **NodePort:** A Kubernetes Service type that exposes a service on a static
  port on every node's IP, making it accessible from outside the cluster.
- **ConfigMap / Secret:** Kubernetes objects for injecting configuration and
  sensitive data into pods without baking them into container images.
- **Readiness/Liveness Probes:** Kubernetes health checks. Readiness determines
  if a pod should receive traffic; liveness determines if a pod should be
  restarted.
- **CRUD:** Create, Read, Update, Delete. The standard operations performed on
  most entities (e.g., creating a user, reading a menu).
- **SPA (Single Page Application):** The frontend approach where the browser
  loads one HTML page and dynamically updates the content as the user interacts,
  providing a fluid experience.
- **Statelessness:** The architectural principle where the server does not store
  any client context between requests. This is what allows us to scale to 2 or
  200 replicas of the `user-service` seamlessly.
