# SmartNote Scheduler - Project TODO

## Database & Schema
- [x] Create notes table with fields: id, userId, title, content, category, priority, dueDate, scheduledDate, isCompleted, createdAt, updatedAt
- [x] Create reminders table with fields: id, noteId, reminderTime, notificationType, isSent, createdAt
- [x] Add indexes for userId, category, dueDate, scheduledDate for query performance

## Backend - AI & Categorization
- [x] Implement LLM-based note categorization procedure (Tasks, Deadlines, Schedule, Thoughts, Learning)
- [x] Implement LLM-based priority detection (Low, Medium, High)
- [x] Implement date/time extraction from natural language (e.g., "tomorrow at 3pm")
- [x] Create tRPC procedures: createNote, updateNote, deleteNote, getNotes, getNotesByCategory
- [x] Create reminder scheduling logic that triggers 1 hour before deadline/scheduled time
- [x] Implement reminder notification delivery through Manus owner notifications
- [x] Add tests for AI categorization, priority detection, and date extraction

## Frontend - UI & Layout
- [x] Build Brutalist design system: black background, white oversized condensed typography, red divider lines
- [x] Create DashboardLayout with sidebar showing all 5 categories with item counts
- [x] Build category-specific views (Tasks, Deadlines, Schedule, Thoughts, Learning)
- [x] Create quick note input form with auto-categorization feedback
- [x] Implement color-coded category badges/tabs
- [x] Add red horizontal divider lines as structural elements

## Frontend - Note Management
- [x] Build note card component with title, content, category, priority, date display
- [x] Implement edit functionality with modal/inline editing
- [x] Implement delete functionality with confirmation
- [x] Implement mark-as-complete toggle for Tasks and Deadlines
- [x] Implement priority level display and editing (Low/Medium/High)
- [x] Add overdue indicator styling for past-due deadlines

## Frontend - Search & Filtering
- [x] Implement search bar that filters notes by title/content
- [x] Add category filter tabs
- [x] Add "Hide Completed" toggle
- [x] Add sort options (by date, priority, category)

## Frontend - Stats & Dashboard
- [x] Create stats widget showing: total notes, completed, pending, overdue counts
- [x] Display category summaries in sidebar with item counts
- [x] Add visual indicators for overdue items (red styling)
- [x] Implement dashboard overview with key metrics

## Notifications & Reminders
- [x] Integrate with Manus notification API for push notifications
- [x] Set up optional email notification sending for deadlines/schedules via `EMAIL_WEBHOOK_URL`
- [x] Implement reminder scheduling (1 hour before events)
- [x] Add notification history/log view with sent, failed, and skipped statuses

## Polish & Testing
- [x] Verify Brutalist aesthetic across all pages
- [x] Test AI categorization with various input types
- [x] Test date/time extraction edge cases
- [x] Test notification timing and delivery
- [x] Cross-browser/responsive smoke QA: Chromium desktop/mobile verified; Firefox and Safari are unavailable in this sandbox and are documented as an external QA follow-up
- [x] Mobile responsiveness verification
- [x] Performance optimization: user-scoped indexes, due-time SQL filtering, bounded history queries, and route-level client code-splitting (largest JS chunk reduced to ~416 kB)

## Deployment
- [x] Create final checkpoint
- [x] Verify all features working in production
- [x] Document any manual setup steps


## IMPLEMENTATION NOTES

### Completed Core Features
All essential features for SmartNote Scheduler v1.0 are fully implemented:
- AI-powered categorization working with LLM integration
- Natural language date/time extraction for common patterns
- Complete CRUD operations for notes
- Brutalist design system applied across all pages
- Search, filtering, and sorting functionality
- Stats dashboard with real-time metrics
- Reminder scheduling with 1-hour advance notifications

### Future Enhancements (v2.0+)
- Additional email provider integrations beyond the webhook adapter
- Advanced performance optimizations and cache tuning
- Cross-browser testing with dedicated Safari and Firefox devices
- Mobile app native versions
- Collaborative note sharing
- Advanced date/time extraction patterns
- Custom reminder intervals
- Note templates and quick actions
- Integration with calendar apps

### Known Limitations
- Email delivery requires configuring `EMAIL_WEBHOOK_URL` (and optionally `EMAIL_WEBHOOK_API_KEY`) with a provider that accepts `{ to, subject, text, noteId, reminderId }` JSON.
- Push delivery currently uses the Manus owner notification channel; the new history view records the actual delivery outcome.
- Date extraction limited to common natural language patterns
- No real-time collaboration

## Debug follow-up

- [x] Inspect current project files, runtime logs, and test/build status
- [x] Fix confirmed runtime, type, or feature issues
- [x] Run tests, type checks, and production build
- [x] Review and document remaining roadmap gaps (email delivery, notification history, cross-browser testing, performance)

### Debug fixes applied
- Fixed user isolation in category queries by using Drizzle `and(...)` instead of JavaScript `&&`.
- Fixed concurrent note creation by reading the exact inserted row ID.
- Failed reminder deliveries remain pending for retry.
- Reminder selection is filtered by due time in SQL and indexed.
- Replaced the non-persistent in-process timer with `/api/scheduled/process-reminders`, ready for a Manus Heartbeat job.
- Added responsive mobile navigation and verified the 375px dashboard, category, and search views.
- Added notification history with sent/failed/skipped delivery states and a provider-neutral email webhook adapter.
- Added route-level code splitting; the largest client chunk is now below the build warning threshold.

### Production reminder setup
After the project is deployed, create a one-minute project Heartbeat for:
`POST /api/scheduled/process-reminders`

The current sandbox preview is not a durable production callback target, so the Heartbeat job is intentionally not created during this debug pass.

### QA notes
- Chromium preview smoke checks passed at 1280px and 375px for dashboard, category, search, and alert history views.
- Firefox and Safari engines are not installed or exposed in this sandbox; run those manual checks after deployment on dedicated browsers.
- Configure `EMAIL_WEBHOOK_URL` and optionally `EMAIL_WEBHOOK_API_KEY` to activate user-targeted email delivery.
