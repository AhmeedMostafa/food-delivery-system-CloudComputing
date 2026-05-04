# Food Delivery Microservices System

## Project Overview
A complete, portable, Linux-ready microservices project built on Windows that will be copied to Ubuntu 22.04 + Minikube. Three Node.js/Express backend services, React/Vite frontend, PostgreSQL, Docker Compose (3 environments), and Kubernetes manifests.

## Key Constraints

### Cross-Platform Portability (CRITICAL)
- **LF line endings ONLY** — no CRLF anywhere. Add `.gitattributes` with `* text=auto eol=lf`.
- No Windows-only commands in any script. POSIX bash only.
- All file paths relative (no `C:\...` or backslashes).
- Dockerfiles use Linux base images only (`node:20-alpine`, `nginx:alpine`, `postgres:16-alpine`).
- Do NOT include `node_modules/`, `dist/`, `.env`, or build artifacts.

### Code Style
- ES modules everywhere (`"type": "module"` in every package.json).
- 2-space indentation.
- Comment every non-obvious block in plain English.
- Descriptive variable names (`hashedPassword` not `hp`).
- Section headers (`// ====== Section ======`) inside files.
- Human-sounding comments: `// TODO: handle edge case later`, `// Quick sanity check`. Avoid "Comprehensive", "Robust", "Seamlessly".

### Tech Stack (LOCKED — no substitutions)
- Backend: Node.js 20 + Express 4 (3 microservices)
- Frontend: React 18 + Vite 5 + plain CSS (NO Tailwind, NO UI libs)
- Database: PostgreSQL 16, one shared instance, 3 schemas (user_svc, restaurant_svc, order_svc)
- Auth: JWT (jsonwebtoken) + bcryptjs
- Inter-service: axios
- Containers: Docker + Docker Compose v2
- Orchestration: Kubernetes (Minikube) — ONLY Deployment, Service, ConfigMap

### Validation Requirements
- Parse every package.json for JSON syntax
- Parse every YAML file for syntax
- Validate Dockerfiles have FROM, WORKDIR, COPY, CMD
- Run `npm install` in each service/frontend to verify deps resolve
- Scan all text files for CRLF line endings — must be zero
- Print final checklist: every file created + line count

## Feature Update: Role-Based Accounts + Restaurant Dashboard + Customer Profile

### Roles
- `customer` — browses restaurants, adds to cart, places orders, views orders, edits profile
- `restaurant_owner` — manages their restaurant, menu items, views/updates incoming orders

### Database Changes
- `user_svc.users` gets a `role` column (`customer` or `restaurant_owner`, default `customer`)
- `user_svc.users` gets a `restaurant_id` column (nullable, only set for restaurant_owner — references restaurant_svc.restaurants)
- Existing seed data remains (4 restaurants + 9 menu items). Add 1 seed restaurant_owner user per restaurant so testing is easy.

### Registration Changes
- Register page has a role selector: "I'm a Customer" / "I'm a Restaurant Owner"
- If restaurant_owner: also collect restaurant_name and cuisine during registration. Auto-create the restaurant in restaurant_svc and link it to the user.
- The JWT token must include `role` and `restaurant_id` (if applicable).

### New: Restaurant Owner Dashboard (frontend page `/dashboard`)
- Only accessible to restaurant_owner role
- Shows: restaurant info header, menu items list with add/edit/delete, incoming orders list with status update buttons
- Menu management: add new item (name, description, price, image_url), edit existing, delete (soft or hard)
- Order management: see orders for their restaurant, update status (PLACED → ACCEPTED → PREPARING → OUT_FOR_DELIVERY → DELIVERED)

### New: Customer Profile Page (frontend page `/profile`)
- Only accessible to customer role (or any logged-in user)
- Edit: name, email, phone, address, password (with current password confirmation)
- Show current values pre-filled in form

### Address in Orders
- The order placement flow must capture/display delivery address
- `order_svc.orders` needs a `delivery_address` column
- When placing an order, use the customer's address from their profile (pre-fill), allow override
- Show delivery address in order details and in the restaurant owner's order view

### Backend Endpoint Changes
- `POST /api/users/register` — accept `role`, and if restaurant_owner also `restaurant_name` + `cuisine`
- `GET /api/users/me` — return role + restaurant_id
- `PUT /api/users/me` — new endpoint to update profile (name, email, phone, address, password)
- `GET /api/users/:id` — return role info too
- Restaurant service: `POST /api/restaurants` — now actually used during owner registration, should create and return restaurant
- Restaurant service: `PUT /api/restaurants/:id` — update restaurant info (owner only)
- Restaurant service: `POST /api/restaurants/:id/menu` — add menu item
- Restaurant service: `PUT /api/menu-items/:id` — edit menu item
- Restaurant service: `DELETE /api/menu-items/:id` — delete menu item
- Order service: `GET /api/orders/restaurant/:restaurantId` — list orders for a restaurant (for owner dashboard)
- Order service: `POST /api/orders` — now includes delivery_address
- Order service: `PATCH /api/orders/:id/status` — add auth check (only restaurant owner of that restaurant)

### Auth Middleware
- Create a shared auth middleware that verifies JWT and attaches user info (id, role, restaurant_id) to request
- Role-based guards: `requireRole('customer')`, `requireRole('restaurant_owner')`

### Frontend Route Guards
- `/dashboard` — only restaurant_owner, redirect customers to home
- `/profile` — any logged-in user
- `/cart`, `/orders` — only customers
- Navbar adapts based on role: customers see Home/My Orders/Cart, owners see Home/Dashboard

### Existing Code Style Rules Still Apply
- Human-written comments, ES modules, 2-space indent, section headers, LF line endings
- Keep the warm color palette and card-based design
- Dashboard should look clean and functional — table for orders, card grid for menu items

## Run / Test / Build
- This project is NOT run on Windows — only built/validated here
- On Linux: `cp .env.example .env && docker compose -f docker-compose.dev.yml up --build`
- K8s: `minikube start && eval $(minikube docker-env) && docker compose -f docker-compose.prod.yml build && kubectl apply -f k8s/`
