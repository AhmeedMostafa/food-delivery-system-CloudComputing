# FoodieGo — Food Delivery Microservices System

A full-stack food delivery application built with Node.js microservices, React, PostgreSQL, Docker, and Kubernetes. Built on Windows, designed to run on Ubuntu 22.04 + Minikube.

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
                        +--+---+---+-------+
                           |   |   |
               +-----------+   |   +-----------+
               |               |               |
    +----------v---+  +--------v-----+  +------v------+
    | user-service |  | restaurant-  |  | order-      |
    |   (3001)     |  | service      |  | service     |
    |              |  | (3002)       |  | (3003)      |
    +----+----+----+  +------+-------+  +------+------+
         |    |               |                |
         +----+---------------+----------------+
                              |
                    +---------v---------+
                    |   PostgreSQL 16   |
                    |  3 schemas:       |
                    |  user_svc         |
                    |  restaurant_svc   |
                    |  order_svc        |
                    +-------------------+
```

---

## Tech Stack

| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Backend       | Node.js 20 + Express 4 (ES modules)     |
| Frontend      | React 18 + Vite 5 + plain CSS           |
| Database      | PostgreSQL 16 (one instance, 3 schemas) |
| Auth          | JWT (jsonwebtoken) + bcryptjs           |
| Inter-service | axios                                   |
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
├── database/
│   └── init.sql            # schema + seed data (4 restaurants, 9 menu items)
├── services/
│   ├── user-service/       # port 3001 -- registration, login, JWT
│   ├── restaurant-service/ # port 3002 -- restaurants + menus
│   └── order-service/      # port 3003 -- orders (calls other services)
├── frontend/               # React SPA served by nginx in production
├── docker-compose.dev.yml  # hot-reload, ports exposed
├── docker-compose.test.yml # separate DB, test ports
├── docker-compose.prod.yml # no source mounts, restart policies
└── k8s/                    # 11 Kubernetes manifests
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

# --- Test (separate DB, port 4173) ---
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit

# --- Production (nginx, port 8080) ---
# Edit .env and set real secrets first!
docker compose -f docker-compose.prod.yml up --build -d
# Frontend: http://localhost:8080

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
docker build -t food-delivery/frontend:latest           ./frontend

# 4. Deploy everything
kubectl apply -f k8s/

# 5. Wait for pods to be ready
kubectl get pods --watch

# 6. Open the app
minikube service frontend-service
```

---

## API Endpoints

### User Service (port 3001)

| Method | Path                | Auth | Description                                                  |
|--------|---------------------|------|--------------------------------------------------------------|
| POST   | /api/users/register | No   | Register (role: customer or restaurant_owner); returns user + JWT |
| POST   | /api/users/login    | No   | Login; returns user + JWT (includes role + restaurant_id)    |
| GET    | /api/users/me       | Yes  | Get current user profile (includes role, restaurant_id)      |
| PUT    | /api/users/me       | Yes  | Update profile (name, email, phone, address, password)       |
| GET    | /api/users/:id      | No   | Internal lookup (used by order-service)                      |
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

| Method | Path                              | Auth | Description                              |
|--------|-----------------------------------|------|------------------------------------------|
| POST   | /api/orders                       | No   | Place order (includes delivery_address)  |
| GET    | /api/orders/:id                   | No   | Get single order                         |
| GET    | /api/orders/user/:userId          | No   | List customer's orders                   |
| GET    | /api/orders/restaurant/:restId    | No   | List orders for a restaurant (dashboard) |
| PATCH  | /api/orders/:id/status            | No   | Update order status                      |
| GET    | /health                           | No   | Health check                             |

---

## Test Accounts

The database seed includes pre-built restaurant owner accounts for easy testing:

| Email              | Password  | Role              | Restaurant     |
|--------------------|-----------|-------------------|----------------|
| burger@owner.com   | owner123  | restaurant_owner  | Burger Palace  |
| sushi@owner.com    | owner123  | restaurant_owner  | Sushi Haven    |
| pizza@owner.com    | owner123  | restaurant_owner  | Pizza Roma     |
| spice@owner.com    | owner123  | restaurant_owner  | Spice Garden   |

Register a new account to try the customer flow, or register with "I'm a Restaurant Owner" to create a new restaurant.

---

## User Roles

| Role               | Access                                                              |
|--------------------|---------------------------------------------------------------------|
| `customer`         | Home, Restaurant Detail, Cart, My Orders, Profile                  |
| `restaurant_owner` | Home, Restaurant Detail, Dashboard (menu + orders), Profile        |

The JWT token includes `role` and `restaurant_id` fields. The frontend uses these to show/hide nav links and enforce route guards.

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
| NODE_ENV               | development                    | Node environment                   |

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

# Access the frontend
minikube service frontend-service

# Get the cluster IP
minikube ip

# Open the Kubernetes dashboard
minikube dashboard
```

---

## Troubleshooting

**1. Postgres won't start / "data directory has wrong ownership"**
> The emptyDir volume gets reused between pod restarts. Delete the postgres pod to force a fresh emptyDir:
> `kubectl delete pod -l app=postgres`

**2. Services can't connect to postgres ("ECONNREFUSED")**
> Postgres takes a few seconds to accept connections after starting. The services retry on startup but if they crash-loop, check:
> `kubectl logs -l app=postgres`
> Make sure the ConfigMap has the right DB_HOST value (`postgres-service`).

**3. docker compose: "network food_net_dev declared as external"**
> You probably have leftover networks from a previous run. Run:
> `docker compose -f docker-compose.dev.yml down --volumes --remove-orphans`

**4. `npm run dev` inside container shows "address already in use"**
> Another process is on port 5173 (or 3001/3002/3003). Check with `lsof -i :5173` and kill it.

**5. Frontend shows blank page or "Cannot GET /"**
> In production (nginx), the SPA needs the `try_files $uri /index.html` fallback. Check that `nginx.conf` is correctly copied into the image:
> `docker compose -f docker-compose.prod.yml exec frontend cat /etc/nginx/conf.d/default.conf`

---

## Author / License

Built as a demo microservices project. MIT License — use it, modify it, learn from it.
