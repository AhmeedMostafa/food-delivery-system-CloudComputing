# FoodieGo — Food Delivery Microservices System

A full-stack food delivery application built with Node.js microservices, React, PostgreSQL, Docker, and Kubernetes. Designed to run on Ubuntu 22.04 + Minikube.

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

                        +------------------+
                        |    Monitoring    |
                        |   Prometheus &   |
                        |     Grafana      |
                        +------------------+
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
| Monitoring    | Prometheus + Grafana + cAdvisor         |
| Containers    | Docker + Docker Compose v2              |
| Orchestration | Kubernetes (Minikube)                   |

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
├── prometheus/             # Prometheus scrape configuration
├── tests/e2e/              # End-to-end API test suite (44 assertions)
├── docker-compose.dev.yml  # hot-reload, ports exposed
├── docker-compose.test.yml # separate DB, test ports
├── docker-compose.prod.yml # no source mounts, restart policies
└── k8s/                    # 21 Kubernetes manifests (Deployments, Services, ConfigMaps, StatefulSets)
```

---

## Prerequisites

Install on Ubuntu 22.04:

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

# minikube
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
# Grafana: http://localhost:3000 (admin/admin)

# --- Test (separate DB, port 4173) ---
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit

# --- Production (nginx, port 80) ---
# Edit .env and set real secrets first!
# You MUST add RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS to .env
# (prod compose enforces required variables with ${VAR:?error} syntax)
docker compose -f docker-compose.prod.yml up --build -d
# Frontend: http://localhost:80

# Stop any environment
docker compose -f docker-compose.dev.yml down
```

---

## Quick Start — Kubernetes (Minikube)

```bash
# 1. Start minikube
minikube start --driver=docker

# 2. Point your shell at minikube's Docker daemon
eval $(minikube docker-env)

# 3. Build images inside minikube's registry
docker build -t food-delivery/user-service:latest       ./services/user-service
docker build -t food-delivery/restaurant-service:latest ./services/restaurant-service
docker build -t food-delivery/order-service:latest      ./services/order-service
docker build -t food-delivery/payment-service:latest    ./services/payment-service
docker build -t food-delivery/frontend:latest           ./frontend
docker build -t food-delivery/postgres:latest           ./database

# 4. Deploy everything
kubectl apply -f k8s/

# 5. Wait for pods to be ready
kubectl get pods --watch

# 6. Open the app
minikube service frontend-service

# 7. Access RabbitMQ and Grafana (in separate terminals)
minikube service rabbitmq-service
minikube service grafana-service
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
| POST   | /api/orders                       | No   | Place order; triggers mock payment              |
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
| POST   | /api/payments                | No   | Record a new payment (called by order-service)  |
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

# Delete and re-apply everything (using -f on the directory picks up both Deployments and StatefulSets)
kubectl delete -f k8s/ && kubectl apply -f k8s/

# Access the frontend
minikube service frontend-service

# Get the cluster IP
minikube ip

# Open the Kubernetes dashboard
minikube dashboard
```

---


## Author / License

Built as a demo microservices project. MIT License — use it, modify it, learn from it.
