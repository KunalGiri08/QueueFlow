# QueueFlow

> High-concurrency virtual queuing, appointment scheduling, and multi-tenant service operations platform.

[![CI](https://github.com/KunalGiri08/QueueFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/KunalGiri08/QueueFlow/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-24_LTS-green.svg)](https://nodejs.org/)
[![Next.js Version](https://img.shields.io/badge/next.js-16.3.6-black.svg)](https://nextjs.org/)
[![Prisma Version](https://img.shields.io/badge/prisma-7.10.0-blue.svg)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 1. Overview

QueueFlow is a full-stack, multi-tenant SaaS platform built to eliminate physical wait lines and unify walk-in queues with scheduled appointments. Designed for healthcare clinics, government service centers, banks, and educational institutions, QueueFlow enables organizations to manage physical service points (counters), balance walk-in traffic with pre-booked appointments, enforce operational constraints (schedules, buffers, capacities), and stream real-time queue position updates directly to customer smartphones.

### Architecture & Technical Documentation
Detailed architectural and schema documentation is maintained in the `docs/` directory:
- 📘 [System Architecture & Engineering Design](docs/system-architecture.md) — Comprehensive guide covering client ingress, auth/RBAC flow, SSE realtime engine, transactional boundaries, and EC2/Docker deployment.
- 🗄️ [Database Architecture & Entity-Relationship Model](docs/database-erd.md) — Complete ER diagram covering all 11 Prisma models, relationship cardinality, foreign key cascade behaviors, and composite indexes.

---

## 2. Problem Statement & Solution

| The Challenge | QueueFlow's Engineered Solution |
|---|---|
| **Congestion & Friction:** Physical lines crowd facilities and waste customer time with unpredictable waits. | **Virtual Queuing:** Customers join queues on their own devices via public slugs or QR codes and track live queue progress remotely. |
| **Siloed Scheduling:** Disconnected appointment systems collide with walk-in arrivals, creating staff bottlenecks. | **Unified Resource Engine:** Coordinates service capacities, appointment slots, and walk-in flows within shared operating hours and counter assignments. |
| **Race Conditions:** High-traffic spikes cause duplicate ticket numbers, overbooking, and conflicting counter calls. | **Database-Level Atomicity:** Employs single-statement PostgreSQL row locks (`UPDATE ... RETURNING`) and transactional slot reservation to guarantee monotonic sequences and zero overbooking. |
| **Data Leakage in Realtime:** Public streams frequently expose customer PII, staff IDs, or internal record keys. | **Sanitized SSE Envelopes:** Event payloads are strictly filtered to customer-safe fields, with tracking tokens passed via request bodies rather than query strings to avoid log leakage. |

---

## 3. Key Features

### Multi-Organization Architecture
- Complete data isolation per organization identified by immutable database IDs and unique URL slugs (e.g., `/organizations/apex-health`).
- Organization-specific IANA timezones (e.g., `Asia/Kolkata`, `America/New_York`) ensuring schedule evaluations, ticket sequences, and analytics adhere to local calendar midnights rather than server UTC.

### Role-Based Access Control (RBAC) & Ownership
- Strict role boundaries enforced at both API route and UI component layers:
  - **Organization Owner:** Creator of the organization with top-level administrative authority.
  - **ADMIN:** Full operational management—services, queues, staff invitations, counter assignments, weekly operating hours, exceptional closures, and analytics.
  - **STAFF:** Operational console access—active counter binding, next-ticket calling, serving state transitions, and completed/skipped resolution.
  - **CUSTOMER:** Unauthenticated or authenticated users—public queue discovery, ticket creation, appointment booking, and private tokenized ticket tracking.

### Virtual Queue & Monotonic Ticket Sequences
- Deterministic ticket state machine: `WAITING` $\rightarrow$ `CALLED` $\rightarrow$ `SERVING` $\rightarrow$ `COMPLETED` (or terminal `SKIPPED` / `CANCELLED`).
- Atomic sequence generation: Monotonic ticket numbers reset daily per organization timezone via single atomic SQL operations without distributed lock contention.
- Queue constraints: Optional `maxWaitingTickets` and `maxDailyTickets` enforcement to prevent queue overflows and staffing exhaustion.

### Real-Time Streaming via Server-Sent Events (SSE)
- High-efficiency, low-overhead unidirectional event streaming using native HTTP Server-Sent Events.
- **Process-Local Singleton Broker:** Pub/sub channel abstraction (`ticket:${token}`, `customer:queue:${id}`, `org:${id}`, `queue:${id}`).
- **Transaction-Authoritative Post-Commit Hooks:** Events are staged during database operations and dispatched *only after* PostgreSQL commits, guaranteeing zero phantom events on transaction rollbacks.
- **Resilient Fallback Polling:** Clients maintain adaptive polling intervals (10s–30s) as a safety net if connections drop or intermediate proxies interrupt streams.
- **Audio Feedback:** Synthesized dual-tone chime alerts via Web Audio API notify staff and customers immediately when tickets are called.

### Appointment Scheduling & Dynamic Slot Engine
- Calculates candidate slots dynamically from active operating schedule intervals using:
  $$T_k = \text{interval.startTime} + k \times (\text{durationMinutes} + \text{bufferMinutes})$$
- Continuous block validation: Slots cannot cross midday breaks or extend beyond operational closing times.
- Advance booking guards: Configurable `minNoticeHours` prevents last-minute disruptions; `maxAdvanceDays` bounds forward bookings.
- Concurrency control: Enforces `slotCapacity` ($\ge 1$) to support both 1-on-1 consultations and group service slots.

### Operating Hours & Exceptional Closures
- Recurring weekly schedule supporting multiple disjoint intervals per day (e.g., morning and afternoon shifts).
- Holiday and emergency date-range closures (`OrganizationClosure`) evaluated with priority over standard weekly schedules.
- Service admission cutoff: Restricts walk-in admissions $N$ minutes prior to interval close to ensure waiting customers are served before staff departure.

### Executive Dashboard & Analytics
- Live operational metrics computed for the current local calendar day:
  - Throughput counts: Created, Completed, Skipped, and Cancelled tickets.
  - Current queue states: Waiting and Serving counts.
  - Wait time metrics: Mean actual wait time ($\text{calledAt} - \text{createdAt}$) and mean service duration ($\text{completedAt} - \text{startedAt}$).
  - Granular breakdown per service category and active queue.

---

## 4. Technology Stack

QueueFlow deliberately avoids unnecessary infrastructure dependencies, relying on a robust, battle-tested modern web stack:

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | **Next.js 16.3.6** (App Router) | Server Components, Route Handlers, Standalone Docker output, Turbopack/Webpack compilation |
| **Runtime & Language** | **Node.js 24 LTS**, **TypeScript 5.x** | Strict type safety, modern ECMAScript standards, asynchronous I/O |
| **Frontend & Styling** | **React 19.2.8**, **Tailwind CSS v4** | Component lifecycle, responsive utility styling, zero runtime CSS overhead |
| **Database & ORM** | **PostgreSQL**, **Prisma ORM 7.10.0** | Relational schema, Prisma driver adapter (`@prisma/adapter-pg`, `pg`), migrations |
| **Authentication** | **Clerk** (`@clerk/nextjs` 7.9.12) | Managed identity, session cookie validation, JWT bearer verification, user provisioning |
| **Validation** | **Zod 4.x** | Runtime request body validation, query parsing, environment schema validation |
| **Realtime** | **Server-Sent Events (SSE)** | Low-latency server-to-client streaming with heartbeats and channel-based pub/sub |
| **Testing** | **Vitest 4.1**, **Testing Library**, **Happy-DOM** | Lightning-fast unit, component, schema, and concurrency integration testing |
| **Container & CI/CD** | **Docker**, **Docker Compose**, **GitHub Actions** | Multi-stage production containerization, automated testing, GHCR registry publishing |

---

## 5. System Architecture

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        CUST["Customer Device (Browser / Mobile)"]
        STAFF_UI["Staff Station Console"]
        ADMIN_UI["Organization Admin Dashboard"]
    end

    subgraph Edge["Reverse Proxy & Ingress"]
        NGINX["Nginx (TLS Termination / Reverse Proxy)"]
    end

    subgraph AppServer["Application Layer (Docker on EC2)"]
        NEXT["Next.js 16 Standalone Server (:3000)"]
        
        subgraph InternalModules["Core Services & Handlers"]
            AUTH_MOD["Clerk Auth & User Provisioning"]
            TICKET_SVC["Ticket Service (Atomic Sequences & Capacity)"]
            APPT_SVC["Appointment Service (Slot Calculation)"]
            SCHED_SVC["Schedule & Timezone Engine"]
            BROKER["RealtimeBroker (In-Memory Pub/Sub)"]
            POST_COMMIT["Post-Commit Event Collector"]
        end
    end

    subgraph DataLayer["Persistence Layer"]
        NEON[("Neon PostgreSQL Serverless")]
    end

    subgraph ExternalAuth["Identity Provider"]
        CLERK["Clerk Auth Cloud"]
    end

    %% Client requests
    CUST -->|HTTPS / SSE| NGINX
    STAFF_UI -->|HTTPS / SSE| NGINX
    ADMIN_UI -->|HTTPS| NGINX

    %% Proxying
    NGINX -->|HTTP (127.0.0.1:3000)| NEXT

    %% App internal interactions
    NEXT --> AUTH_MOD
    AUTH_MOD <-->|Token Verification / Users API| CLERK
    
    NEXT --> TICKET_SVC
    NEXT --> APPT_SVC
    NEXT --> SCHED_SVC
    
    TICKET_SVC --> POST_COMMIT
    APPT_SVC --> POST_COMMIT
    POST_COMMIT -->|After Tx Commit| BROKER
    BROKER -->|Stream SSE Envelopes| NEXT

    %% Database operations
    TICKET_SVC <-->|Prisma 7 + Driver Adapter| NEON
    APPT_SVC <-->|Prisma 7 + Driver Adapter| NEON
    SCHED_SVC <-->|Prisma 7 + Driver Adapter| NEON
```

---

## 6. Core Application Workflows

### 6.1 Walk-In Virtual Queue Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer
    participant App as QueueFlow App Router
    participant DB as PostgreSQL
    participant Broker as RealtimeBroker
    actor Staff as Staff Member

    Customer->>App: POST /api/public/.../tickets (Queue ID)
    App->>DB: BEGIN Transaction
    App->>DB: Check operating hours & queue capacity
    App->>DB: UPDATE "Queue" SET nextTicketNumber = nextTicketNumber + 1 RETURNING number
    App->>DB: INSERT INTO "Ticket" (status: WAITING, trackingToken)
    App->>DB: COMMIT Transaction
    App->>Broker: Stage & Publish TICKET_CREATED
    App-->>Customer: 201 Created (Ticket # + Tracking Token)
    
    Customer->>App: POST /api/realtime/tickets/stream (Token in Body)
    App-->>Customer: SSE Connection Established (ticket:token)

    Staff->>App: POST /api/queues/[id]/next (Counter ID)
    App->>DB: BEGIN Transaction
    App->>DB: SELECT oldest WAITING Ticket FOR UPDATE
    App->>DB: UPDATE "Ticket" SET status = 'CALLED', counterId, calledAt = now()
    App->>DB: COMMIT Transaction
    App->>Broker: Publish TICKET_CALLED to ticket & queue channels
    Broker-->>Customer: SSE Event: TICKET_CALLED (Counter Name)
    App-->>Staff: 200 OK (Ticket Details)

    Staff->>App: POST /api/tickets/[id]/start
    App->>DB: UPDATE status = 'SERVING', startedAt = now()
    App->>Broker: Publish TICKET_SERVING
    Broker-->>Customer: SSE Event: TICKET_SERVING

    Staff->>App: POST /api/tickets/[id]/complete
    App->>DB: UPDATE status = 'COMPLETED', completedAt = now()
    App->>Broker: Publish TICKET_COMPLETED
    Broker-->>Customer: SSE Event: TICKET_COMPLETED
```

### 6.2 Appointment Booking Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer
    participant App as QueueFlow App Router
    participant DB as PostgreSQL

    Customer->>App: GET /api/public/.../slots?date=YYYY-MM-DD
    App->>DB: Fetch Service Settings, ScheduleIntervals, Closures & Active Appointments
    App->>App: Calculate non-overlapping slots respecting operating intervals & buffer
    App->>App: Filter slots violating minNoticeHours or maxAdvanceDays
    App->>App: Check bookedCount against service.slotCapacity
    App-->>Customer: 200 OK (Array of Available Slots)

    Customer->>App: POST /api/appointments (Slot Time, Service ID)
    App->>DB: BEGIN Transaction
    App->>DB: Re-verify slot capacity under lock
    App->>DB: INSERT INTO "Appointment" (status: BOOKED, scheduledAt)
    App->>DB: COMMIT Transaction
    App-->>Customer: 201 Created (Appointment Details)
```

---

## 7. Database Architecture

QueueFlow uses a relational schema managed through Prisma ORM 7 with PostgreSQL foreign-key cascade constraints:

```mermaid
erDiagram
    Organization ||--o{ OrganizationMembership : "has members"
    Organization ||--o{ Service : "offers"
    Organization ||--o{ Counter : "operates"
    Organization ||--o{ OrganizationScheduleInterval : "configures"
    Organization ||--o{ OrganizationClosure : "declares"
    User ||--o{ Organization : "owns"
    User ||--o{ OrganizationMembership : "belongs to"
    User ||--o{ Ticket : "creates"
    User ||--o{ Appointment : "books"
    User ||--o{ StaffCounterAssignment : "assigned to"
    User ||--o{ Ticket : "serves (staff)"
    Service ||--o{ Queue : "divides into"
    Service ||--o{ Appointment : "scheduled for"
    Queue ||--o{ Ticket : "queues"
    Counter ||--o{ StaffCounterAssignment : "assigned to"
    Counter ||--o{ Ticket : "calls to"

    Organization {
        string id PK
        string name
        string slug UK
        string timezone
        string ownerId FK
        datetime createdAt
        datetime updatedAt
    }

    User {
        string id PK
        string clerkId UK
        string name
        string email UK
        datetime createdAt
        datetime updatedAt
    }

    OrganizationMembership {
        string id PK
        string userId FK
        string organizationId FK
        enum role "ADMIN | STAFF"
        datetime createdAt
    }

    Service {
        string id PK
        string organizationId FK
        string name
        boolean isActive
        int durationMinutes
        int bufferMinutes
        int minNoticeHours
        int maxAdvanceDays
        int slotCapacity
        int cancellationNoticeHours
        int admissionCutoffMinutes
    }

    Queue {
        string id PK
        string serviceId FK
        string name
        int nextTicketNumber
        string lastResetDate
        int maxWaitingTickets
        int maxDailyTickets
        boolean isActive
    }

    Ticket {
        string id PK
        string trackingToken UK
        string queueId FK
        string userId FK
        string counterId FK
        string servedById FK
        int number
        enum status "WAITING | CALLED | SERVING | COMPLETED | SKIPPED | CANCELLED"
        int initialEstimatedWaitMinutes
        datetime calledAt
        datetime startedAt
        datetime completedAt
        datetime skippedAt
        datetime cancelledAt
        datetime createdAt
    }

    Appointment {
        string id PK
        string serviceId FK
        string userId FK
        datetime scheduledAt
        int durationMinutes
        enum status "BOOKED | COMPLETED | CANCELLED | NO_SHOW"
        datetime createdAt
    }

    Counter {
        string id PK
        string organizationId FK
        string name
        boolean isActive
    }

    OrganizationScheduleInterval {
        string id PK
        string organizationId FK
        int dayOfWeek "0=Sun, ..., 6=Sat"
        string startTime "HH:mm"
        string endTime "HH:mm"
        boolean isActive
    }

    OrganizationClosure {
        string id PK
        string organizationId FK
        string startDate "YYYY-MM-DD"
        string endDate "YYYY-MM-DD"
        string reason
    }
```

### Key Relational & Indexing Guarantees
- **Cascading Deletions:** Deleting an `Organization` cleans up its memberships, services, queues, tickets, counters, appointments, schedule intervals, and closures via verified database-level `ON DELETE CASCADE` triggers.
- **Identity Safety:** `User` records are preserved upon organization deletion (`onDelete: Restrict` on `ownerId`; user records cascade only from user deletion).
- **Composite Indexes:**
  - `Ticket(queueId, status, number)` for $O(1)$ lookups during staff `next` ticket calls.
  - `Appointment(serviceId, scheduledAt, status)` and `Appointment(userId, scheduledAt, status)` for conflict checks.
  - `OrganizationScheduleInterval(organizationId, dayOfWeek)` for localized schedule evaluation.

---

## 8. Local Development Setup

### Prerequisites
- **Node.js:** v24.x LTS (`node -v`)
- **npm:** v10.x+
- **Docker & Docker Compose:** For running the local PostgreSQL container.
- **Git**

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/KunalGiri08/QueueFlow.git
   cd QueueFlow/queueflow
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```
   *(This automatically triggers `prisma generate --config prisma7.config.ts` via the `postinstall` hook).*

3. **Configure local environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your local PostgreSQL credentials and Clerk development keys.

4. **Start the local Docker PostgreSQL database:**
   ```bash
   docker compose -f docker-compose.test.yml up -d
   ```
   *Spins up an isolated PostgreSQL 16 Alpine container listening on port `5433`.*

5. **Bootstrap test schema and run database migrations:**
   ```bash
   npm run setup:test-db
   ```

6. **Seed local test identities (Optional):**
   ```bash
   # Seed an initial organization administrator
   npm run setup:local-admin

   # Seed initial staff accounts
   npm run setup:local-staff
   ```

7. **Start the Next.js development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 9. Environment Variables

QueueFlow enforces strict environment validation using Zod (`lib/env.server.ts` and `lib/env.client.ts`). The application fails fast during startup if required variables are missing or malformed.

| Variable | Required | Scope | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | Server | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/dbname?sslmode=require`). |
| `PRISMA_DATABASE_URL` | *Optional* | Server | Dedicated unpooled PostgreSQL connection string used by Prisma CLI during migrations. Takes precedence over `DATABASE_URL` in `prisma7.config.ts`. |
| `CLERK_SECRET_KEY` | **Yes** | Server | Clerk backend API private key (starts with `sk_`). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Yes** | Client/Public | Clerk client-side publishable key (starts with `pk_`). Baked into client bundles at build time. |
| `NODE_ENV` | No | Server | Runtime environment: `development`, `test`, or `production`. Default: `development`. |
| `PORT` | No | Server | Port for the standalone server to listen on. Default: `3000`. |
| `HOSTNAME` | No | Server | Hostname interface binding. Default: `0.0.0.0`. |
| `HEALTH_DB_TIMEOUT_MS` | No | Server | Timeout in milliseconds for database readiness probes (`/api/health`). Default: `8000` (min: 1000, max: 15000). |
| `TEST_DATABASE_URL` | No | Server | Dedicated isolated PostgreSQL connection string used for concurrency integration test runs. |

> **Security Note:** Server variables are protected by Next.js's `server-only` compiler barrier. Attempting to import `env` from `lib/env.server.ts` in any Client Component triggers a compile-time build failure.

---

## 10. Testing & Quality Assurance

QueueFlow maintains a 100% passing test suite across **125 unit and component test suites (1,884 tests)**, plus 2 dedicated database concurrency integration test suites (127 test files total) covering schema rules, race conditions, edge cases, and UI states.

```bash
# Run complete unit and component test suite (Vitest + Happy-DOM)
npm test

# Run isolated concurrency integration test suite
npm run test:concurrency

# Run static type check across the entire project
npx tsc --noEmit

# Run ESLint validation
npm run lint

# Build production bundle with Webpack/Turbopack
npm run build
```

### Automated CI Workflow (`.github/workflows/ci.yml`)

Every pull request and push to `main` undergoes automated verification:
1. **Validate Job:**
   - Installs dependencies with clean freeze (`npm ci`).
   - Executes ESLint (`npm run lint`).
   - Runs TypeScript validation (`npx tsc --noEmit`).
   - Runs full Vitest suite (`npx vitest run`).
   - Compiles production Next.js application (`npm run build`).
   - Validates multi-stage Docker build with non-root security assertions.
2. **Publish Job (on `main` push):**
   - Verifies production Clerk publishable key validity.
   - Builds production container image.
   - Pushes signed, immutable image tags (`sha-<commit>` and `latest`) to GitHub Container Registry (`ghcr.io/kunalgiri08/queueflow`).

---

## 11. Production Deployment

### Production Architecture
- **Host:** AWS EC2 Virtual Machine running Ubuntu 24.04 LTS.
- **Container Runtime:** Docker Engine + Docker Compose pulling immutable images from GHCR.
- **Reverse Proxy:** Host-level Nginx terminating SSL/TLS via Let's Encrypt / Certbot and forwarding traffic to `127.0.0.1:3000`.
- **Database:** Neon Serverless PostgreSQL with connection pooling.
- **Network Isolation:** The container port is bound exclusively to localhost (`127.0.0.1:3000:3000`), blocking direct external access to Node.js.

### Production Nginx Reverse Proxy Configuration

Nginx requires specific buffering configurations to properly forward Server-Sent Events without delaying chunks:

```nginx
server {
    server_name queueflow.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Dedicated SSE location block to prevent proxy buffering
    location /api/realtime/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        chunked_transfer_encoding off;
    }
}
```

### Health & Liveness Probes
QueueFlow exposes `/api/health` with dual-probe support for orchestration and monitoring:
- **Liveness Probe:** `GET /api/health?probe=live` $\rightarrow$ Returns `200 OK` if the Node.js process is responsive. Used by Docker `HEALTHCHECK`.
- **Readiness Probe:** `GET /api/health?probe=ready` $\rightarrow$ Executes `SELECT 1` against PostgreSQL with an enforced watchdog timeout (`HEALTH_DB_TIMEOUT_MS`).

### Production Database Migrations
On the EC2 host, migrations are executed safely using Prisma 7 non-interactive deploy:

```bash
# 1. Source production environment
set -a
source /root/queueflow.env
set +a

# 2. Apply pending migrations
npx prisma migrate deploy --config prisma7.config.ts

# 3. Confirm migration status
npx prisma migrate status --config prisma7.config.ts
```

---

## 12. Security & Reliability Highlights

1. **Fail-Closed Target Guard:** Local setup and reset scripts utilize `scripts/db-safety.ts` to actively prevent execution against remote, production, or unrecognized databases.
2. **Zero URL Credential Leakage:** Customer tracking tokens are transmitted via request bodies (`POST /api/realtime/tickets/stream`) rather than URL query parameters, preventing leakage in browser history, proxy access logs, and HTTP referrers.
3. **Least Privilege Container Security:** The production Dockerfile builds on Alpine Linux, drops all root privileges, and executes as unprivileged user `nextjs:nodejs` (UID 1001).
4. **Timezone Safety & DST Handling:** Date boundary calculations use `Intl.DateTimeFormat` with IANA timezone strings, preventing 23-hour or 25-hour Daylight Saving Time shifts from breaking daily ticket counters or appointment slots.
5. **Safe Data Reset Utility:** Built-in `npm run reset:org-data` utility uses Prisma interactive transactions to purge organization-owned tenant records while strictly preserving Clerk identities and `User` account records.

---

## 13. Roadmap & Planned Enhancements

| Feature | Status | Notes |
|---|---|---|
| **Multi-Tenant Virtual Queue Engine** | **Implemented** | Core routing, atomic sequences, and daily resets. |
| **Server-Sent Events (SSE) Streaming** | **Implemented** | In-memory singleton broker with post-commit dispatch. |
| **Dynamic Appointment Scheduling** | **Implemented** | Interval-based slot calculation and capacity checks. |
| **Role-Based Admin & Staff Consoles** | **Implemented** | Call, serve, complete, and skip ticket workflows. |
| **Distributed Pub/Sub (Redis / Dragonfly)** | *Planned* | Enable multi-replica horizontal autoscaling across independent containers. |
| **SMS & WhatsApp Dispatch (Twilio)** | *Planned* | Optional SMS/WhatsApp notifications when ticket is next in line. |
| **Self-Service Kiosk Check-In Mode** | *Planned* | Dedicated tablet UI for on-premise physical badge or ticket printing. |
| **Exportable Analytics (CSV / PDF)** | *Planned* | Automated daily and monthly service compliance reporting. |

---

## 14. License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
