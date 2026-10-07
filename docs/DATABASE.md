# SmartNote Scheduler — Database Guide

Authoritative schema: [`drizzle/schema.ts`](../drizzle/schema.ts) (Drizzle ORM,
MySQL dialect). Migrations live in [`drizzle/`](../drizzle) and are applied
with `pnpm db:push` (`drizzle-kit generate && drizzle-kit migrate`). Config:
[`drizzle.config.ts`](../drizzle.config.ts), connection string from
`DATABASE_URL`.

## Entity-Relationship Overview

```
users 1 ──── * notes 1 ──── * reminders
  │               │                │
  │               └───────┐        │
  └────── * notificationLogs *─────┘
          (noteId / reminderId nullable, SET NULL on delete)
```

## Tables

### `users`
Core auth table backing the Manus OAuth flow.

| Column        | Type                    | Notes                              |
|---------------|-------------------------|------------------------------------|
| id            | INT AUTO_INCREMENT PK   |                                    |
| openId        | VARCHAR(64) UNIQUE      | Manus OAuth identifier             |
| name          | TEXT                    | nullable                           |
| email         | VARCHAR(320)            | nullable                           |
| loginMethod   | VARCHAR(64)             | nullable                           |
| role          | ENUM('user','admin')    | default `user`                     |
| createdAt     | TIMESTAMP               | default now                        |
| updatedAt     | TIMESTAMP               | auto on update                     |
| lastSignedIn  | TIMESTAMP               | default now                        |

### `notes`
User notes with AI-derived metadata.

| Column        | Type                                                        | Notes                          |
|---------------|-------------------------------------------------------------|--------------------------------|
| id            | INT AUTO_INCREMENT PK                                       |                                |
| userId        | INT NOT NULL → users.id                                     | owner scope                    |
| title         | VARCHAR(255) NOT NULL                                       | AI-generated or user-edited    |
| content       | TEXT NOT NULL                                               | raw note text                  |
| category      | ENUM('Tasks','Deadlines','Schedule','Thoughts','Learning')  | AI-assigned, editable          |
| priority      | ENUM('Low','Medium','High') default 'Medium'                | AI-detected, editable          |
| dueDate       | TIMESTAMP NULL                                              | deadline for Deadlines/Tasks   |
| scheduledDate | TIMESTAMP NULL                                              | event time for Schedule        |
| isCompleted   | INT default 0                                               | boolean flag (0/1)             |
| createdAt     | TIMESTAMP default now                                       |                                |
| updatedAt     | TIMESTAMP auto                                              |                                |

**Indexes**
- `notes_user_category_idx` (userId, category) — sidebar counts & category views
- `notes_user_due_date_idx` (userId, dueDate) — overdue filtering in SQL
- `notes_user_scheduled_date_idx` (userId, scheduledDate)

### `reminders`
One row per pending delivery for a note.

| Column           | Type                            | Notes                             |
|------------------|---------------------------------|-----------------------------------|
| id               | INT AUTO_INCREMENT PK           |                                   |
| noteId           | INT NOT NULL → notes.id CASCADE | deleting a note deletes reminders |
| reminderTime     | TIMESTAMP NOT NULL              | due/scheduled time − 1 hour       |
| notificationType | ENUM('push','email','both') default 'both' |                     |
| isSent           | INT default 0                   | set only when ≥1 channel delivered|
| createdAt        | TIMESTAMP default now           |                                   |

**Indexes**
- `reminders_sent_time_idx` (isSent, reminderTime) — heartbeat scan of due reminders
- `reminders_note_id_idx` (noteId)

### `notificationLogs`
Immutable delivery history powering `/notifications`.

| Column     | Type                       | Notes                                   |
|------------|----------------------------|------------------------------------------|
| id         | INT AUTO_INCREMENT PK      |                                          |
| userId     | INT NOT NULL → users.id    | denormalized for fast per-user queries   |
| noteId     | INT NULL → notes.id SET NULL | note may be deleted after delivery     |
| reminderId | INT NULL → reminders.id SET NULL |                                      |
| channel    | ENUM('push','email')       | one log row per attempted channel        |
| status     | ENUM('sent','failed','skipped') | skipped = channel not configured    |
| title      | VARCHAR(255) NOT NULL      | snapshot of delivered message title      |
| content    | TEXT NOT NULL              | snapshot of delivered body               |
| error      | TEXT NULL                  | failure reason when status = failed      |
| createdAt  | TIMESTAMP default now      |                                          |

**Indexes**
- `notification_logs_user_created_idx` (userId, createdAt) — bounded history queries
- `notification_logs_note_id_idx` (noteId)

## Migration History

| Migration | File                          | Summary                                        |
|-----------|-------------------------------|------------------------------------------------|
| 0000      | `0000_needy_may_parker.sql`   | Initial `users` table                          |
| 0001      | `0001_good_hitman.sql`        | `notes` + `reminders` tables (+ FK constraints)|
| 0002      | `0002_sticky_blue_blade.sql`  | Additional indexes                             |
| 0003      | `0003_normal_marvex.sql`      | `notificationLogs` table, delivery/perf indexes|

Snapshots for drift detection are in `drizzle/meta/`; table relations are
declared in `drizzle/relations.ts`.

## Working With the Schema

1. Edit `drizzle/schema.ts` (camelCase columns to keep TS types aligned).
2. Generate + apply: `pnpm db:push`.
3. Commit both the new `.sql` file and updated `meta/` snapshots.
4. Add/update DAO helpers in `server/db.ts` — application code should never
   hand-write SQL.

### Conventions
- Booleans stored as `INT` 0/1 (`isCompleted`, `isSent`) for MySQL/TiDB
  portability.
- All timestamps are DATETIME; serialization to the client uses superjson so
  they arrive as JS `Date` objects.
- Every user-facing query filters by `userId` first (tenant isolation + index
  prefix).
- Enums are mirrored as TS unions in `server/ai.ts` / `shared/types.ts`; change
  them in both places together.
