# FoodieGo — Food Delivery Microservices System

A full-stack food delivery application built with Node.js microservices, React, PostgreSQL, Docker, and Kubernetes.

---

## Architecture

```
                        +------------------+
                        |   Browser / App  |
                        +--------+---------+
                                 |
                        +--------v---------+
                        |   Frontend (80)  |  React 18 + Vite 5, served by nginx
                        |  nginx reverse   |  Proxies /api/* to backend services
                        +--+---+---+---+---+
                           |   |   |   |
                +----------+   |   |   +-----------+
                |              |   |               |
     +----------v---+  +-------v-+ | +-------v------+  +--------------+
     | user-service |  | restaur-| | | order-       |  | payment-     |
     |   (3001)     |  | ant-svc | | | service      |  | service      |
     |              |  | (3002)  | | | (3003)       |  | (3004)       |
     +----+----+----+  +------+--+ | +-------+------+  +-------+------+
          |    |               |   |         |                 |
          |    |               |   |         |    (async msg)  v
          |    |               |   |         |          +-------------+
          |    |               |   |         +--------> |  RabbitMQ   |
          |    |               |   |                    | (5672/15672)|
          |    |               |   |                    +-------------+
          +----+---------------+---+---------+-----------------+
                               |
                     +---------v---------+
                     |   PostgreSQL 16   |
                     |  4 schemas:       |
                     |  user_svc         |
                     |  restaurant_svc   |
                     |  order_svc        |
                     |  payment_svc      |
                     +-------------------+

         +-----------------------------------------------+
         |       Kubernetes-Only Observability Stack      |
         |  Prometheus + Grafana + Loki + Promtail       |
         |  cAdvisor + kube-state-metrics                |
         |  prom-client (native /metrics per service)     |
         +-----------------------------------------------+
```

---

## Tech Stack

| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Backend       | Node.js 20 + Express 4 (ES modules)     |
| Frontend      | React 18 + Vite 5 + plain CSS           |
| Database      | PostgreSQL 16 (one instance, 4 schemas) |
| Auth          | JWT (jsonwebtoken) + bcryptjs           |
| Inter-service | axios (REST) & RabbitMQ (Async)         |
| Monitoring    | Prometheus + Grafana + cAdvisor + prom-client + kube-state-metrics (K8s only) |
| Logging       | Loki + Promtail (centralized log collection & storage)  |
| Containers    | Docker + Docker Compose v2              |
| Orchestration | Kubernetes (K3s / Minikube / any cluster) |

---

## Folder Structure

```
food-delivery-system/
├── .gitignore
├── .gitattributes          # enforces LF line endings
├── .env.example            # copy to .env and fill in secrets
├── README.md
├── TECHNICAL_ARCHITECTURE.md # Deep-dive into design decisions
├── TEAM_PROJECT_GUIDE.md   # Full team onboarding guide
├── setup_env.sh            # One-click Ubuntu dependency installer
├── database/
│   ├── Dockerfile          # Custom postgres image with init.sql baked in
│   └── init.sql            # schema + seed data (4 restaurants, 9 menu items, drivers)
├── services/
│   ├── user-service/       # port 3001 -- registration, login, JWT, driver lookups
│   ├── restaurant-service/ # port 3002 -- restaurants + menus
│   ├── order-service/      # port 3003 -- orders (calls other services)
│   └── payment-service/    # port 3004 -- payment processing via RabbitMQ consumer
├── frontend/               # React SPA served by nginx in production
├── tests/e2e/              # End-to-end API test suite (44 assertions)
├── docker-compose.dev.yml  # hot-reload, ports exposed
├── docker-compose.test.yml # separate DB, test ports
├── docker-compose.prod.yml # no source mounts, restart policies
└── k8s/                    # 26 Kubernetes manifests (Deployments, Services, ConfigMaps, StatefulSets, RBAC, Monitoring, Logging)
```

---

## Prerequisites

Install on Ubuntu / Debian:

```bash
# Docker Engine + Compose v2
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Node.js 20 (for local dev/test, not needed if using Docker only)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Minikube (optional — use any K8s cluster)
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
```

---

## Quick Start — Docker Compose

```bash
# 1. Copy environment file
cp .env.example .env

# --- Development (hot-reload, port 5173) ---
docker compose -f docker-compose.dev.yml up --build
# Frontend: http://localhost:5173
# RabbitMQ: http://localhost:15672 (guest/guest)

# --- Test (separate DB, port 4173) ---
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit

# --- Production (nginx, port 80) ---
# Edit .env and set real secrets first!
# You MUST add RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS to .env
docker compose -f docker-compose.prod.yml up --build -d
# Frontend: http://localhost:80

# Stop any environment
docker compose -f docker-compose.dev.yml down
```

---

## Automated Testing

The project includes two levels of automated testing to ensure system reliability.

### 1. Unit Tests (Isolated)
Tests individual functions and logic within each service.
```bash
# Run all unit tests via Docker
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

### 2. End-to-End (E2E) Tests (Integration)
Tests the full system flow (Order -> Payment -> Status) against a live environment.
```bash
# 1. Ensure the development environment is running
docker compose -f docker-compose.dev.yml up -d

# 2. Run the 44 assertions against the live APIs
node tests/e2e/run-e2e.js
```

---

## Quick Start — Kubernetes

The `k8s/` directory contains **26 manifests** that deploy the complete system to any Kubernetes cluster (Minikube, K3s, GKE, etc.).

```bash
# --- Option A: Minikube ---
minikube start --driver=docker

# Point shell at minikube's Docker daemon
eval $(minikube docker-env)

# Build all images inside minikube's registry
docker build -t food-delivery/user-service:latest       ./services/user-service
docker build -t food-delivery/restaurant-service:latest ./services/restaurant-service
docker build -t food-delivery/order-service:latest      ./services/order-service
docker build -t food-delivery/payment-service:latest    ./services/payment-service
docker build -t food-delivery/frontend:latest           ./frontend
docker build -t food-delivery/postgres:latest           ./database

# Deploy everything
kubectl apply -f k8s/

# Wait for pods to be ready
kubectl get pods --watch

# Open the app
minikube service frontend-service

# --- Option B: Any cluster (K3s, cloud, etc.) ---
# Build and push images to a registry (Docker Hub, GHCR, etc.)
docker build -t <your-registry>/user-service:latest ./services/user-service
docker push <your-registry>/user-service:latest
# ... repeat for all services ...

# Update image references in k8s/*.yaml to point to your registry
# Then deploy:
kubectl apply -f k8s/
kubectl get pods --watch
```

---

## Dashboards Reference (Kubernetes)

| Dashboard      | NodePort | Default Credentials |
|:---------------|:---------|:--------------------|
| **Frontend**   | `30080`  | N/A                 |
| **Grafana**    | `30001`  | `admin` / `admin`   |
| **RabbitMQ**   | `30003`  | `guest` / `guest`   |
| **Prometheus** | `30002`  | N/A                 |

> **Grafana** comes pre-provisioned with a custom **"Food Delivery System - K3s Cluster"** dashboard. No manual setup needed — the Prometheus data source and dashboard are automatically loaded on startup.

---

## Kubernetes Manifests Reference

| File | Resource | Purpose |
|:-----|:---------|:--------|
| `00-secret.yaml` | Secret | DB password, JWT secret, RabbitMQ creds |
| `01-configmap.yaml` | ConfigMap | DB host, service URLs, init.sql |
| `02-postgres-statefulset.yaml` | StatefulSet | PostgreSQL 16 with persistent storage |
| `03-postgres-service.yaml` | Service | ClusterIP for internal DB access |
| `04-user-deployment.yaml` | Deployment | user-service (2 replicas) |
| `05-user-service.yaml` | Service | ClusterIP |
| `06-restaurant-deployment.yaml` | Deployment | restaurant-service (2 replicas) |
| `07-restaurant-service.yaml` | Service | ClusterIP |
| `08-order-deployment.yaml` | Deployment | order-service (2 replicas) |
| `09-order-service.yaml` | Service | ClusterIP |
| `10-frontend-deployment.yaml` | Deployment | React + nginx frontend |
| `11-frontend-service.yaml` | Service | NodePort 30080 |
| `12-payment-deployment.yaml` | Deployment | payment-service (2 replicas) |
| `13-payment-service.yaml` | Service | ClusterIP |
| `14-rabbitmq-statefulset.yaml` | StatefulSet | RabbitMQ with persistent storage |
| `15-rabbitmq-service.yaml` | Service | NodePort 30003 |
| `16-prometheus-configmap.yaml` | ConfigMap | Prometheus scrape config + relabeling rules |
| `17-prometheus-deployment.yaml` | Deployment | Prometheus |
| `18-prometheus-service.yaml` | Service | NodePort 30002 |
| `19-grafana-deployment.yaml` | StatefulSet | Grafana with persistent storage + provisioned dashboard |
| `20-grafana-service.yaml` | Service | NodePort 30001 |
| `21-prometheus-rbac.yaml` | RBAC | ServiceAccount + ClusterRole for Prometheus pod discovery |
| `22-kube-state-metrics.yaml` | Deployment | Exposes K8s object metrics (replicas, deployments, etc.) |
| `23-grafana-dashboard.yaml` | ConfigMap | Auto-provisioned Prometheus + Loki data sources + Food Delivery dashboard |
| `24-loki.yaml` | StatefulSet + Service | Loki log aggregation server with 5Gi persistent storage |
| `25-promtail.yaml` | DaemonSet + RBAC | Promtail log collector — runs on every node, ships all pod logs to Loki |

---

## Kubernetes Observability & Monitoring

The Kubernetes deployment includes a **fully automated** observability stack (Metrics + Logs) that is decoupled from the local development environment.

### What's Included

| Component | Purpose |
|:----------|:--------|
| **Prometheus** | Scrapes metrics every 15s via Kubernetes service discovery |
| **Grafana** | Pre-provisioned dashboard showing CPU, Memory, Pods, Deployments, Network + log explorer |
| **cAdvisor** | Container-level CPU, memory, and network metrics (built into K8s nodes) |
| **kube-state-metrics** | Kubernetes object metrics (replica counts, deployment status) |
| **prom-client** | Native Node.js metrics from each microservice (`/metrics` endpoint) |
| **Loki** | Central log storage — persists all pod logs to a 5Gi PVC |
| **Promtail** | DaemonSet log collector — automatically ships every pod's stdout/stderr to Loki |

### How Service Discovery Works

- Each microservice pod has annotations `prometheus.io/scrape: "true"` and `prometheus.io/port: "<port>"`
- Prometheus uses the Kubernetes API (via RBAC in `21-prometheus-rbac.yaml`) to find and scrape all annotated pods automatically
- Relabeling rules in `16-prometheus-configmap.yaml` normalize labels (`node`, `namespace`, `pod`) for compatibility with standard dashboards

### Grafana Dashboard

The **"Food Delivery System - K3s Cluster"** dashboard is automatically provisioned and shows:
- Pods Running / Deployments Up-to-Date / Node Count / Services UP
- CPU Usage per Service (live graph per pod)
- Memory Usage per Service (live graph per pod)
- Total Cluster CPU & Memory (gauges)
- Node.js Heap Memory from `prom-client` (all 4 services)
- Deployment Replicas bar chart
- Network Receive bytes/s

### Querying Logs in Grafana

Once Loki and Promtail are running, open **Grafana → Explore → Select "Loki"** and use LogQL:

```logql
# All logs from the order service
{app="order-service"}

# Filter for errors across all services
{namespace="default"} |= "error"

# Logs from a specific pod
{pod="user-service-abc123"}
```

---

## Managing the K8s Lifecycle

```bash
# Apply / update everything
kubectl apply -f k8s/

# Remove everything
kubectl delete -f k8s/

# Restart a specific service after code change
kubectl rollout restart deployment <service-name>

# Watch pods
kubectl get pods --watch

# Restart Grafana
kubectl rollout restart statefulset grafana

# Restart Prometheus
kubectl rollout restart deployment prometheus
```

---

## API Endpoints

### User Service (port 3001)

| Method | Path                | Auth | Description                                                  |
|--------|---------------------|------|--------------------------------------------------------------|
| POST   | /api/users/register | No   | Register (customer, restaurant_owner, or delivery_driver)    |
| POST   | /api/users/login    | No   | Login; returns user + JWT (includes role + restaurant_id)    |
| GET    | /api/users/me       | Yes  | Get current user profile                                     |
| PUT    | /api/users/me       | Yes  | Update profile (name, email, phone, address, password)       |
| GET    | /api/users/drivers  | No   | Internal: List all delivery drivers                          |
| GET    | /api/users/:id      | No   | Internal: Lookup user by ID (used by order-service)          |
| GET    | /health             | No   | Health check                                                 |

### Restaurant Service (port 3002)

| Method | Path                        | Auth | Description                            |
|--------|-----------------------------|------|----------------------------------------|
| GET    | /api/restaurants             | No   | List all restaurants                   |
| GET    | /api/restaurants/:id         | No   | Single restaurant + menu               |
| GET    | /api/restaurants/:id/menu    | No   | All menu items (incl. unavailable)     |
| POST   | /api/restaurants             | No   | Create restaurant (used during signup) |
| PUT    | /api/restaurants/:id         | No   | Update restaurant info                 |
| POST   | /api/restaurants/:id/menu    | No   | Add menu item                          |
| GET    | /api/menu-items/:id          | No   | Single menu item (price + availability)|
| PUT    | /api/menu-items/:id          | No   | Edit menu item                         |
| DELETE | /api/menu-items/:id          | No   | Delete menu item                       |
| GET    | /health                      | No   | Health check                           |

### Order Service (port 3003)

| Method | Path                              | Auth | Description                                     |
|--------|-----------------------------------|------|-------------------------------------------------|
| POST   | /api/orders                       | No   | Place order; publishes to RabbitMQ payment_queue|
| GET    | /api/orders/:id                   | No   | Get single order + items                        |
| GET    | /api/orders/user/:userId          | No   | List customer's order history                   |
| GET    | /api/orders/restaurant/:restId    | No   | List orders for a restaurant dashboard          |
| GET    | /api/orders/driver/:driverId      | No   | List orders assigned to a driver                |
| PATCH  | /api/orders/:id/status            | No   | Update status (PLACED -> DELIVERED)             |
| PATCH  | /api/orders/:id/assign            | No   | Assign a delivery driver to the order           |
| GET    | /health                           | No   | Health check                                    |

### Payment Service (port 3004)

| Method | Path                         | Auth | Description                                     |
|--------|------------------------------|------|-------------------------------------------------|
| POST   | /api/payments                | No   | Record a manual payment (also listens on RabbitMQ)|
| GET    | /api/payments/order/:orderId | No   | Get payment status for a specific order         |
| GET    | /api/payments/user/:userId   | No   | List payment history for a user                 |
| GET    | /health                      | No   | Health check                                    |

---

## User Roles

| Role               | Access                                                              |
|--------------------|---------------------------------------------------------------------|
| `customer`         | Browse restaurants, place orders, view order history, profile      |
| `restaurant_owner` | Manage menu, view/accept orders, assign drivers, profile           |
| `delivery_driver`  | View assigned orders, update order status (Out for Delivery, etc.)  |

The JWT token includes `role` and `restaurant_id` fields. The frontend uses these to show/hide nav links and enforce route guards.

---

## Test Accounts

The database seed includes pre-built accounts for easy testing:

### Restaurant Owners (Password: `owner123`)
*   `burger@owner.com` (Burger Palace)
*   `sushi@owner.com` (Sushi Haven)
*   `pizza@owner.com` (Pizza Roma)
*   `spice@owner.com` (Spice Garden)

### Delivery Drivers (Password: `driver123`)
*   `driver1@test.com`
*   `driver2@test.com`

---

## Environment Variables

| Variable               | Default                        | Description                        |
|------------------------|--------------------------------|------------------------------------|
| POSTGRES_USER          | postgres                       | PostgreSQL superuser               |
| POSTGRES_PASSWORD      | postgres                       | PostgreSQL password                |
| POSTGRES_DB            | food_delivery                  | Database name                      |
| DB_HOST                | postgres                       | DB hostname (Docker service name)  |
| DB_PORT                | 5432                           | DB port                            |
| DB_USER                | postgres                       | DB user for services               |
| DB_PASSWORD            | postgres                       | DB password for services           |
| DB_NAME                | food_delivery                  | DB name for services               |
| JWT_SECRET             | dev-jwt-secret-change-in-prod  | JWT signing secret                 |
| USER_SERVICE_URL       | http://user-service:3001       | Internal URL for user-service      |
| RESTAURANT_SERVICE_URL | http://restaurant-service:3002 | Internal URL for restaurant-service|
| PAYMENT_SERVICE_URL    | http://payment-service:3004    | Internal URL for payment-service   |
| NODE_ENV               | development                    | Node environment                   |
| RABBITMQ_DEFAULT_USER  | guest                          | RabbitMQ admin username             |
| RABBITMQ_DEFAULT_PASS  | guest                          | RabbitMQ admin password             |
| RABBITMQ_URL           | amqp://rabbitmq:5672           | AMQP connection string             |

---

## kubectl Cheat Sheet

```bash
# View all resources
kubectl get all

# Watch pods start up
kubectl get pods --watch

# View logs for a service
kubectl logs -l app=user-service --tail=50 -f

# Scale a deployment
kubectl scale deployment user-service --replicas=3

# Describe a pod (useful for debugging crashes)
kubectl describe pod <pod-name>

# Execute a command inside a pod
kubectl exec -it <pod-name> -- sh

# Delete and re-apply everything
kubectl delete -f k8s/ && kubectl apply -f k8s/
```

---

## Author / License

Built as a cloud computing microservices project. MIT License — use it, modify it, learn from it.
