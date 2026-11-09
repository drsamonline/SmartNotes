# Privacy

Version: 1.0 (draft for review)
Effective: 09 November 2026
Owner: Dr Sohil Momin — sohilmomin2000@gmail.com
Changes: Initial version.

SmartNote Scheduler is a hosted application: you write a note in plain English, it is classified, dated, prioritised and a reminder is scheduled. Unlike the offline tools in this fleet, it runs on a server and sends some of your content to third-party services to do that work. This document says exactly what and to whom.

## Who is responsible

**{{OPERATOR NAME}}** operates this instance and is the **Data Fiduciary** under the Digital Personal Data Protection Act, 2023. Contact: **{{EMAIL}}**, **{{ADDRESS}}**.

If you are running this software yourself, **you are the operator**, and the obligations below are yours. The author of the software is not.

## What is collected

| What | Why |
| --- | --- |
| Account identity — name, email, login method, and the identifier your sign-in provider returns | To give you an account and keep your notes yours |
| The notes you write | That is the product |
| Reminders — what, when, and whether it fired | To remind you |
| A notification log — which reminder was sent, when, and to what address | To diagnose a missed or duplicate reminder |
| Notes you submit to the classifier | To decide the priority, date and label |

Two features send more, and only when you use them:

- **Images** — a prompt you give to the image generator, and the image returned.
- **Maps** — an address or place you look up.
- **Voice** (where enabled) — the recording or its URL, sent for transcription.

## Who it goes to

- **This instance's database** — MySQL, on the operator's server. Your notes and account live here.
- **The Forge API** — a single upstream service that provides the language model, image generation, map lookups and speech-to-text. Content you submit to those features passes through it. It is a **processor**: it handles the content to return a result.
- **An email webhook** — reminders are delivered through an email service, which therefore sees the recipient address and the reminder text.
- **A scheduling service** — the app registers its scheduled jobs with the hosting provider, which sees the job's name, schedule and callback path. It does not see your note text.

No advertising network, no analytics SDK, no data broker, and nothing is sold.

## Sign-in

Sign-in is by OAuth through an identity provider, so **no password is stored here**. In offline mode the app accepts a local sign-in instead, for a machine that is not exposed to the internet. Your session is a signed cookie with a long life; signing out clears it.

## How long it is kept

- **Notes and reminders** — until you delete them, or your account is deleted.
- **Notification log** — kept for delivery diagnostics, then pruned.
- **Account** — until you ask for it to be removed.

Backups may hold a copy after deletion until they age out on the operator's schedule.

## Your rights

You may ask to see, correct or erase your data, to nominate someone to act for you, and to complain. Write to **{{EMAIL}}**. If you are not satisfied, you may complain to the **Data Protection Board of India**.

Erasure is limited by anything the operator is legally required to keep — for example a record needed for tax or a legal claim.

## Security

Traffic is expected over TLS in any real deployment. Access to the database is by the server, with credentials in the environment, not in the code. Access control is per account: one user cannot read another's notes through the application.

That is the design. Whether a given deployment does it — TLS terminated correctly, database not exposed, secrets rotated — is the operator's responsibility, and worth asking about before you trust an instance you did not set up.

## Children

The app is not intended for anyone under 18 and does not knowingly hold a child's data.

## Changes

This document is versioned in the repository. A change to what the software sends, or to whom, changes this file in the same commit.

Contact: **{{OPERATOR EMAIL}}**
