# Project Technical Documentation: Food Delivery System

This document provides a deep-dive into the architectural decisions, component structure, and operational logic of the Food Delivery System. It is designed to onboard developers and explain the "why" behind the implementation.

---

## 1. Project Architecture & Philosophy

### Architectural Pattern: Microservices
The system is built using a **Microservices Architecture**. Instead of a single monolithic application, the logic is split into four decoupled services: `user-service`, `restaurant-service`, `order-service`, and `payment-service`.

**Why this pattern?**
*   **Scalability:** Each service can be scaled independently. For example, the `restaurant-service` (high read volume) can have more replicas than the `payment-service`.
*   **Fault Isolation:** A failure in the `payment-service` does not prevent users from browsing restaurants or managing their profiles.
*   **Technology Agility:** While all current services use Node.js, individual services could be rewritten in different languages (e.g., Go for performance-critical logic) without affecting the rest of the system.

### Request Life Cycle: The 'Order' Flow
The most complex flow in the system is the order placement. Here is the step-by-step lifecycle:

1.  **Frontend Initialization:** The React app collects the `user_id`, `restaurant_id`, and an array of `items` (menu item IDs and quantities).
2.  **Order Service Gateway:** The request hits `POST /api/orders`.
3.  **Cross-Service Validation (User):** The Order Service calls `user-service` via REST to verify the user exists and is active.
4.  **Price Integrity Check (Restaurant):** The Order Service calls `restaurant-service` to fetch the *current* price and availability of each menu item. **Logic:** We never trust the price sent from the client to prevent fraud.
5.  **Atomic Transaction:** Once validated, the Order Service opens a PostgreSQL transaction to:
    *   Insert a record into `order_svc.orders`.
    *   Insert multiple records into `order_svc.order_items`, capturing a snapshot of the name and price at the time of purchase.
6.  **Asynchronous Payment Trigger:** After the DB commit, the Order Service fires a request to `payment-service`.
    *   *Implementation Note:* This is currently a "fire-and-forget" call. In a production-grade system, this would typically use a **Saga Pattern** or a Message Broker (RabbitMQ/Kafka) to ensure eventual consistency if the payment service is down.
7.  **Final Confirmation:** The user receives a `201 Created` status with the full order details.

---

## 2. Detailed Component Directory

### Folder Structure
| Directory | Purpose |
| :--- | :--- |
| `/services` | Contains the source code for the 4 microservices. Each is a standalone Node.js/Express app. |
| `/frontend` | A React single-page application (SPA) built with Vite and styled with modern CSS. |
| `/database` | Contains `init.sql`, the source of truth for the database schema and seed data. |
| `/k8s` | Kubernetes manifests for deploying the system to a production-like cluster. |
| `docker-compose.dev.yml` | Orchestration for local development with hot-reloading (nodemon). |

### Core Logic Files
*   **`services/order-service/src/routes/orders.js`**: The "brain" of the ordering process. It coordinates inter-service calls and manages the order state machine (`PLACED` -> `ACCEPTED` -> `PREPARING` -> `DELIVERED`).
*   **`services/user-service/src/middleware/auth.js`**: Implements JWT verification. It ensures that only authenticated users can access protected resources like `/api/users/me`.
*   **`frontend/src/context/AuthContext.jsx`**: Manages the global authentication state in the browser, storing the JWT and user profile.

---

## 3. Data & Communication Layer

### Data Models (PostgreSQL Schemas)
We use a **Database-per-Service** pattern, but for simplicity in this project, they share a single PostgreSQL instance separated by **Postgres Schemas**.

| Schema | Table | Description |
| :--- | :--- | :--- |
| `user_svc` | `users` | Stores credentials, profile data, and roles (`customer`, `owner`, `driver`). |
| `restaurant_svc` | `restaurants` | Stores restaurant metadata (name, cuisine, rating). |
| `restaurant_svc` | `menu_items` | Links food items to restaurants with pricing and availability. |
| `order_svc` | `orders` | The header record for an order, including status and total price. |
| `order_svc` | `order_items` | Snapshot of items purchased (includes price at time of order). |
| `payment_svc` | `transactions` | Ledger of all payment attempts and their status. |

### Communication Strategy
1.  **Internal (Service-to-Service):** Synchronous REST calls via `axios`. Services discover each other using environment variables or K8s internal DNS (e.g., `http://user-service:3001`).
2.  **External (Client-to-Service):** The Frontend communicates with services via REST. Authentication is handled by passing a Bearer Token (JWT) in the `Authorization` header.

---

## 4. Infrastructure & Cloud Integration

### Docker Strategy
*   **Development:** Uses `volumes` to mount local source code into the container. `nodemon` watches for changes, allowing for a "save-and-refresh" workflow without rebuilding images.
*   **Production:** Uses **Multi-stage builds**. The `builder` stage installs dependencies, and the final image only contains the necessary runtime files, keeping the image size small and secure.

### Kubernetes & High Availability
The project includes K8s manifests in the `/k8s` directory:
*   **Deployments:** Define the desired state. Services like `user-service` are configured with `replicas: 2` to ensure high availability.
*   **Services:** Act as load balancers, distributing traffic across the available pods of a microservice.
*   **ConfigMaps:** Centralize environment variables (DB URLs, Port numbers) so they can be managed outside the container images.

---

## 5. Technical Glossary

*   **JWT (JSON Web Token):** A stateless authentication mechanism. The server signs a token containing user data, and the client sends it back with every request. No session storage is needed on the server.
*   **Middleware:** Functions that execute during the request-response cycle (e.g., logging, auth checks). In this project, `requireAuth` is a key middleware.
*   **Dependency Injection:** While not using a formal DI container, the services use "Config Injection" where database pools and URLs are passed into routes via imports and environment variables.
*   **CRUD:** Create, Read, Update, Delete. The standard operations performed on most entities (e.g., creating a user, reading a menu).
*   **SPA (Single Page Application):** The frontend approach where the browser loads one HTML page and dynamically updates the content as the user interacts, providing a fluid experience.
*   **Statelessness:** The architectural principle where the server does not store any client context between requests. This is what allows us to scale to 2 or 200 replicas of the `user-service` seamlessly.
