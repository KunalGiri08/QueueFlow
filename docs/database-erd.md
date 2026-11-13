# QueueFlow — Database Architecture & Entity-Relationship Documentation

> Detailed schema specification of QueueFlow's PostgreSQL database models, foreign keys, cardinality, cascading rules, and composite indexes defined in `prisma/schema.prisma`.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    Organization ||--o{ OrganizationMembership : "has members (1:N)"
    Organization ||--o{ Service : "defines (1:N)"
    Organization ||--o{ Counter : "operates (1:N)"
    Organization ||--o{ OrganizationScheduleInterval : "operates on (1:N)"
    Organization ||--o{ OrganizationClosure : "closed during (1:N)"
    User |o--o{ Organization : "owns (0..1:N)"
    User ||--o{ OrganizationMembership : "holds (1:N)"
    User ||--o{ Ticket : "creates (1:N)"
    User ||--o{ Appointment : "books (1:N)"
    User ||--o{ StaffCounterAssignment : "assigned to (1:N)"
    User |o--o{ Ticket : "serves as staff (0..1:N)"
    Service ||--o{ Queue : "categorizes into (1:N)"
    Service ||--o{ Appointment : "offered for (1:N)"
    Queue ||--o{ Ticket : "contains (1:N)"
    Counter ||--o{ StaffCounterAssignment : "staffed by (1:N)"
    Counter |o--o{ Ticket : "serves at (0..1:N)"

    Organization {
        string id PK "cuid()"
        string name "Organization display name"
        string slug UK "Unique URL slug"
        string timezone "IANA timezone, default Asia/Kolkata"
        string ownerId FK "References User.id (Nullable)"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    User {
        string id PK "cuid()"
        string clerkId UK "External Clerk Auth ID (Nullable)"
        string name "User full name (Nullable)"
        string email UK "Unique verified email"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    OrganizationMembership {
        string id PK "cuid()"
        string userId FK "References User.id"
        string organizationId FK "References Organization.id"
        enum role "ADMIN | STAFF"
        datetime createdAt "Default now()"
    }

    Service {
        string id PK "cuid()"
        string organizationId FK "References Organization.id"
        string name "Service category name"
        string description "Service details (Nullable)"
        boolean isActive "Default true"
        int admissionCutoffMinutes "Minutes before close to stop walk-ins"
        int durationMinutes "Appointment duration, default 30"
        int bufferMinutes "Buffer after appointment, default 0"
        int minNoticeHours "Minimum advance booking notice, default 2"
        int maxAdvanceDays "Maximum advance booking window, default 30"
        int slotCapacity "Concurrent appointments per slot, default 1"
        int cancellationNoticeHours "Cancellation cutoff, default 2"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    Queue {
        string id PK "cuid()"
        string serviceId FK "References Service.id"
        string name "Queue line identifier"
        int nextTicketNumber "Next ticket sequence, default 1"
        string lastResetDate "Date of last sequence reset (YYYY-MM-DD)"
        int maxWaitingTickets "Max tickets allowed in WAITING state"
        int maxDailyTickets "Max tickets allowed per calendar day"
        boolean isActive "Default true"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    Ticket {
        string id PK "cuid()"
        string trackingToken UK "Public tracker secret (Nullable)"
        int number "Daily sequence number"
        enum status "WAITING | CALLED | SERVING | COMPLETED | SKIPPED | CANCELLED"
        string queueId FK "References Queue.id"
        string userId FK "References User.id"
        string servedById FK "References User.id (Nullable)"
        string counterId FK "References Counter.id (Nullable)"
        int initialEstimatedWaitMinutes "Wait time snapshot at creation"
        datetime calledAt "Timestamp when staff called ticket"
        datetime startedAt "Timestamp when staff started service"
        datetime completedAt "Timestamp when service completed"
        datetime skippedAt "Timestamp when ticket was skipped"
        datetime cancelledAt "Timestamp when ticket was cancelled"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    Appointment {
        string id PK "cuid()"
        string serviceId FK "References Service.id"
        string userId FK "References User.id"
        datetime scheduledAt "Booked appointment UTC timestamp"
        int durationMinutes "Allocated duration, default 30"
        enum status "BOOKED | COMPLETED | CANCELLED | NO_SHOW"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    Counter {
        string id PK "cuid()"
        string organizationId FK "References Organization.id"
        string name "Physical counter label (e.g. Counter 1)"
        boolean isActive "Default true"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    StaffCounterAssignment {
        string id PK "cuid()"
        string userId FK "References User.id"
        string counterId FK "References Counter.id"
        datetime createdAt "Default now()"
    }

    OrganizationScheduleInterval {
        string id PK "cuid()"
        string organizationId FK "References Organization.id"
        int dayOfWeek "0 = Sunday, 1 = Monday, ..., 6 = Saturday"
        string startTime "24-hour local time HH:mm"
        string endTime "24-hour local time HH:mm"
        boolean isActive "Default true"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }

    OrganizationClosure {
        string id PK "cuid()"
        string organizationId FK "References Organization.id"
        string startDate "Local start date YYYY-MM-DD"
        string endDate "Local end date YYYY-MM-DD"
        string reason "Reason for holiday or emergency closure"
        datetime createdAt "Default now()"
        datetime updatedAt "Auto-updated timestamp"
    }
```

---

## 2. Model Directory & Operational Responsibilities

### 1. `Organization`
The tenant root entity. Represents a physical business, medical facility, university department, or government office. All operational services, counters, schedules, queues, and memberships are scoped to an organization.
- **Timezone Anchor:** Stores an IANA timezone string (`timezone`, default `"Asia/Kolkata"`), enabling localized calendar midnights and DayLight Saving Time (DST) safety across multi-region deployments.

### 2. `User`
The centralized account entity. Represents customers, staff operators, and organization owners.
- **Identity Sync:** Stores optional `clerkId` to link with Clerk external identity management, alongside verified unique `email`.
- **Decoupled Lifecycle:** User accounts are independent of any single organization. If an organization is deleted, user identities remain intact.

### 3. `OrganizationMembership`
Join table establishing tenant access control. Associates a `User` with an `Organization` and assigns an `OrganizationRole` (`ADMIN` or `STAFF`).
- **Owner vs. Admin:** The organization creator is assigned as `Organization.ownerId` and given an `ADMIN` membership record.

### 4. `Service`
Represents a distinct offering or department (e.g., "General Consultation", "Blood Work", "Document Verification").
- **Configuration Hub:** Governs appointment duration (`durationMinutes`), post-service recovery buffer (`bufferMinutes`), advance booking rules (`minNoticeHours`, `maxAdvanceDays`), concurrent slot limits (`slotCapacity`), and walk-in cutoff (`admissionCutoffMinutes`).

### 5. `Queue`
A discrete waiting line belonging to a specific `Service`. Organizations can maintain multiple queues per service (e.g., "Priority Queue", "Standard Walk-In").
- **Sequence State:** Maintains `nextTicketNumber` and `lastResetDate` for atomic sequence allocation and midnight resets.
- **Capacity Gates:** Houses `maxWaitingTickets` (limits active waiting line) and `maxDailyTickets` (limits total throughput per day).

### 6. `Ticket`
Represents an individual walk-in customer's position in a queue.
- **State Machine:** Governed by `TicketStatus`: `WAITING` $\rightarrow$ `CALLED` $\rightarrow$ `SERVING` $\rightarrow$ `COMPLETED` (or terminal `SKIPPED` / `CANCELLED`).
- **Private Tracker:** Secure `trackingToken` enables anonymous or mobile access to live status streams without exposing internal IDs.
- **Audit Timestamps:** Tracks complete lifecycle events (`calledAt`, `startedAt`, `completedAt`, `skippedAt`, `cancelledAt`) used for operational analytics and SLA calculations.

### 7. `Appointment`
Represents a pre-scheduled customer booking for a specific `Service` at a discrete timestamp (`scheduledAt`).
- **Conflict Prevention:** Active statuses (`BOOKED`) occupy slot capacity; terminal statuses (`COMPLETED`, `CANCELLED`, `NO_SHOW`) release capacity.

### 8. `Counter`
Physical service station or desk (e.g., "Counter 1", "Room 102").
- **Operational Availability:** Can be toggled `isActive` by administrators without deleting historical ticket assignment logs.

### 9. `StaffCounterAssignment`
Join model mapping a `User` (staff operator) to a physical `Counter`. Contains fields `id`, `userId`, `counterId`, and `createdAt`. Enforces `@@unique([userId, counterId])` to prevent duplicate assignment records. (Note: The schema models static user-to-counter authorization; it does not contain scheduled shift ranges, dynamic status flags, or active/inactive assignment states).

### 10. `OrganizationScheduleInterval`
Configures weekly recurring business hours. Supports multiple non-overlapping time windows per day (e.g., 09:00–12:30 and 13:30–17:00) using integer day-of-week indexes (`0` = Sunday through `6` = Saturday) and 24-hour time strings (`"HH:mm"`).

### 11. `OrganizationClosure`
Declares exceptional multi-day or single-day closures (national holidays, facility maintenance, emergency shutdowns) using calendar dates (`"YYYY-MM-DD"`). Evaluated prior to standard weekly intervals during slot calculation and ticket admissions.

---

## 3. Relational Constraints & Deletion Cascades

QueueFlow enforces strict referential integrity at the database engine level via PostgreSQL constraints:

| Parent Model | Child Model | Relation Field | Action on Delete | Architectural Rationale |
|---|---|---|---|---|
| `Organization` | `OrganizationMembership` | `organizationId` | **CASCADE** | Deleting a tenant purges all staff/admin associations for that tenant. |
| `Organization` | `Service` | `organizationId` | **CASCADE** | Tenant deletion cleans up all departmental services. |
| `Organization` | `Counter` | `organizationId` | **CASCADE** | Tenant deletion cleans up all physical counters. |
| `Organization` | `OrganizationScheduleInterval` | `organizationId` | **CASCADE** | Tenant deletion removes operating schedule configuration. |
| `Organization` | `OrganizationClosure` | `organizationId` | **CASCADE** | Tenant deletion removes holiday closure calendars. |
| `Service` | `Queue` | `serviceId` | **CASCADE** | Deleting a service cascades to all underlying ticket lines. |
| `Service` | `Appointment` | `serviceId` | **CASCADE** | Deleting a service cascades and permanently deletes all associated appointment records from the database. |
| `Queue` | `Ticket` | `queueId` | **CASCADE** | Deleting a queue purges associated queue tickets. |
| `Counter` | `StaffCounterAssignment` | `counterId` | **CASCADE** | Deleting a counter unbinds staff mappings. |
| `Counter` | `Ticket` | `counterId` | **SET NULL** | Deleting a physical counter preserves ticket history and analytics (`counterId` becomes NULL). |
| `User` | `Ticket (Customer)` | `userId` | **CASCADE** | Deleting a user account deletes tickets created by that customer. |
| `User` | `Ticket (Staff)` | `servedById` | **SET NULL** | Deleting a staff user account preserves ticket service duration history (`servedById` becomes NULL). |
| `User` | `Appointment` | `userId` | **CASCADE** | Deleting a user account removes customer appointments. |
| `User` | `StaffCounterAssignment` | `userId` | **CASCADE** | Deleting a staff user clears counter authorization records. |
| `User` | `Organization` | `ownerId` | **RESTRICT** | **Safety Guard:** Prevents deleting a `User` who is currently registered as an `Organization` owner. The organization must be transferred or deleted first. |

---

## 4. Primary Keys, Unique Constraints & Composite Indexes

### Primary Keys
Every model in the schema utilizes an immutable, collision-resistant CUID string (`@default(cuid())`) as its primary key (`id`).

### Unique Constraints
| Model | Target Column(s) | Constraint Purpose |
|---|---|---|
| `Organization` | `[slug]` | Ensures distinct, URL-friendly public addresses (e.g., `/organizations/apex-clinic`). |
| `User` | `[email]` | Guarantees account uniqueness across verified email addresses. |
| `User` | `[clerkId]` | Prevents duplicate identity mappings to the same Clerk user. |
| `OrganizationMembership` | `[userId, organizationId]` | Prevents a user from having multiple role records in the same tenant. |
| `Service` | `[organizationId, name]` | Prevents duplicate service category names within an organization. |
| `Queue` | `[serviceId, name]` | Prevents duplicate queue names under the same service. |
| `Counter` | `[organizationId, name]` | Prevents duplicate counter identifiers within an organization. |
| `StaffCounterAssignment` | `[userId, counterId]` | Prevents duplicate assignment records between a user and a counter. |
| `Ticket` | `[trackingToken]` | Guarantees private lookup token uniqueness for mobile status tracking. |

### Composite Query Indexes
Performance-critical lookups are accelerated by composite B-Tree indexes defined across the Prisma schema and PostgreSQL migrations:

```sql
-- Ticket queue ordering and staff next-ticket allocation
CREATE INDEX "Ticket_queueId_number_idx" ON "Ticket"("queueId", "number");
CREATE INDEX "Ticket_queueId_status_number_idx" ON "Ticket"("queueId", "status", "number");
CREATE INDEX "Ticket_queueId_createdAt_idx" ON "Ticket"("queueId", "createdAt");

-- Staff operational activity lookups
CREATE INDEX "Ticket_servedById_status_idx" ON "Ticket"("servedById", "status");
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");

-- Standard appointment indexes (prisma/schema.prisma)
CREATE INDEX "Appointment_userId_scheduledAt_idx" ON "Appointment"("userId", "scheduledAt");
CREATE INDEX "Appointment_serviceId_scheduledAt_idx" ON "Appointment"("serviceId", "scheduledAt");
CREATE INDEX "Appointment_userId_scheduledAt_status_idx" ON "Appointment"("userId", "scheduledAt", "status");
CREATE INDEX "Appointment_serviceId_scheduledAt_status_idx" ON "Appointment"("serviceId", "scheduledAt", "status");

-- Partial active appointment indexes (Migration: 20261111210000_add_appointment_scheduling_engine)
-- Partial indexes filter out CANCELLED rows, optimizing conflict detection and slot availability queries:
CREATE INDEX "Appointment_serviceId_scheduledAt_active_idx" ON "Appointment"("serviceId", "scheduledAt") WHERE "status" <> 'CANCELLED';
CREATE INDEX "Appointment_userId_scheduledAt_active_idx" ON "Appointment"("userId", "scheduledAt") WHERE "status" <> 'CANCELLED';

-- Localized schedule evaluations and date-range closure lookups
CREATE INDEX "OrganizationScheduleInterval_organizationId_dayOfWeek_idx" ON "OrganizationScheduleInterval"("organizationId", "dayOfWeek");
CREATE INDEX "OrganizationClosure_organizationId_startDate_endDate_idx" ON "OrganizationClosure"("organizationId", "startDate", "endDate");
```

