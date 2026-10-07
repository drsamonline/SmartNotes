# SmartNote Scheduler — API Reference

Base URL: `/api/trpc` (tRPC v11, superjson serialization) plus two REST
callbacks under `/api/`.

- All `notes.*` procedures are **protected**: they require a valid session
  cookie (`app_session_id`) obtained via Manus OAuth. Unauthenticated calls
  return the error `Please login (10001)`.
- Every procedure is scoped to the authenticated user; notes from other users
  are never returned or mutable.
- Inputs are validated with Zod; invalid input yields a `BAD_REQUEST` tRPC
  error.

## Authentication

### `auth.me` (query, public)
Returns the current session user or `null`.

```ts
trpc.auth.me.useQuery();
// -> { id, openId, name, email, loginMethod, role, createdAt, ... } | null
```

### `auth.logout` (mutation, public)
Clears the session cookie. Returns `{ success: true }`.

## Notes Router (`notes.*`)

### `notes.create` (mutation, protected)
Creates a note. The raw content is analyzed by the LLM
(`server/ai.ts::analyzeNoteContent`) which determines category, priority, and
title, and extracts any natural-language date/time. A `reminders` row is
scheduled 1 hour before the extracted due/scheduled time when present.

**Input**
```ts
{ content: string }            // min length 1
```

**Behavior notes**
- AI failures degrade gracefully to defaults: category `Thoughts`,
  priority `Medium`, title `Untitled Note`.
- If analysis returns a date, it populates `dueDate` (Deadlines/Tasks) or
  `scheduledDate` (Schedule).

### `notes.list` (query, protected)
All notes for the current user, newest first. No input.

### `notes.listByCategory` (query, protected)
**Input:** `{ category: "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning" }`

### `notes.get` (query, protected)
**Input:** `{ id: number }` → single note or NOT_FOUND error.

### `notes.update` / `notes.updateNote` (mutations, protected)
Partial update of a note owned by the caller.

**Input (`update`)**
```ts
{
  id: number;
  title?: string;
  content?: string;
  priority?: "Low" | "Medium" | "High";
  isCompleted?: number;          // 0 | 1
  dueDate?: Date | null;         // superjson-encoded dates
  scheduledDate?: Date | null;
}
```
`updateNote` is the stricter variant used by the edit modal:
`title` and `content` are required (min length 1) along with `priority` and
`id`. Updating dates re-schedules the associated reminder.

### `notes.toggleComplete` (mutation, protected)
**Input:** `{ id: number, isCompleted: number }` (0 or 1).

### `notes.delete` (mutation, protected)
**Input:** `{ id: number }`. Cascades to reminders; notification logs keep the
row with `noteId` set to NULL.

### `notes.search` (query, protected)
Case-insensitive substring match on title and content within the user's notes.

**Input:** `{ query: string }`

### `notes.stats` (query, protected)
Dashboard metrics for the current user: totals, completed, pending, overdue,
and per-category counts. No input.

### `notes.notificationHistory` (query, protected)
Recent delivery log entries (`sent` / `failed` / `skipped` per channel),
bounded in size. No input.

### `notes.importBackup` (mutation, protected)
Bulk restore from an exported JSON backup.

**Input**
```ts
{
  notes: Array<{
    title: string;               // 1..255 chars
    content: string;
    category: "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning";
    priority: "Low" | "Medium" | "High";
    isCompleted?: number;
    dueDate?: string | null;      // ISO 8601 datetime
    scheduledDate?: string | null;// ISO 8601 datetime
  }>;
}
```

## REST Endpoints

### `POST /api/oauth/callback`
Manus OAuth code exchange. Validates the authorization code with
`OAUTH_SERVER_URL`, upserts the `users` row by `openId`, and sets the signed
session cookie (`JWT_SECRET`, cookie name `app_session_id`).

### `POST /api/scheduled/process-reminders`
Durable scheduler callback (intended to be invoked every minute by a platform
Heartbeat job). It:

1. Loads all due, unsent reminders (`reminderTime <= now`).
2. For each, delivers push (Manus notification API) and/or email
   (`EMAIL_WEBHOOK_URL`, optional bearer `EMAIL_WEBHOOK_API_KEY`).
3. Writes one `notificationLogs` row per channel with status
   `sent` / `failed` / `skipped` (skipped = channel not configured).
4. Marks the reminder sent only if at least one channel succeeded; otherwise it
   stays pending for retry after configuration is fixed.

Responses: `{ processed: number }` on success; 500 with error detail on
failure.

### `GET /api/health` (system router)
tRPC `system` router exposes health/system info used by the platform runtime.

## Error Model

Shared helpers in `shared/_core/errors.ts` map thrown codes to tRPC errors:

| Code        | Meaning                                   |
|-------------|-------------------------------------------|
| `UNAUTHORIZED` | Missing/invalid session ("Please login (10001)") |
| `FORBIDDEN`    | Insufficient role ("…permission (10002)")  |
| `NOT_FOUND`    | Resource does not exist                    |
| `BAD_REQUEST`  | Validation failure                         |

## Client Usage Example

```tsx
import { trpc } from "@/providers/trpc";

const { data: notes } = trpc.notes.list.useQuery();
const create = trpc.notes.create.useMutation({
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
});
create.mutate({ content: "Submit report tomorrow at 3pm" });
```
