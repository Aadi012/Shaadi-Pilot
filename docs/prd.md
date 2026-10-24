# Make My Marriage Product Requirements Document

> Converted from the [original Word document](source/prd.docx). Wording and provisional decisions are preserved; approved implementation decisions are tracked in [architecture-decisions.md](architecture-decisions.md).

Version 1 | Product scope and acceptance baseline

22 October 2026 • Status Draft for review • Audience Product Design Engineering and QA

## 1 Product Summary

Make My Marriage is a web application for couples and their families to plan and coordinate one Indian wedding. Multiple organizers collaborate in a wedding workspace to manage functions, tasks, guests, invitations, RSVPs, expenses and vendors. The same product publishes a simple themed wedding website and provides guests with private, passwordless access to RSVP and a shared photo gallery. A YouTube livestream can be embedded in the wedding website.

V1 is intended for public availability: different couples can create separate weddings. Within V1, each organizer account belongs to one wedding workspace, and guests do not have accounts. This PRD defines the required outcomes and behaviors; it does not prescribe implementation frameworks or database technology.

## 2 Problem and Goals

Indian weddings include several functions, multiple family organizers and large guest groups. Planning information is often spread across messages, spreadsheets, email threads and shared albums. The product should give organizers one reliable view of the wedding while keeping guest interaction simple.

### Goals

- Let a couple create a wedding and invite family organizers without sharing credentials.

- Keep functions, task ownership, actual expenses and vendor information together.

- Make invitations and per-function RSVPs easy for guests through unique email links.

- Publish a useful public schedule and provide a private gallery for uploads and viewing.

- Support a public launch without multi-wedding organizer complexity.

### Non Goals

- Multi-wedding management by a single organizer account.

- Complex roles, financial privacy between organizers, budgets or budget allocations.

- Guest registration, individual household member profiles or approval for accompanying guests.

- Vendor marketplace transactions, booking, commissions or vendor logins.

- Automated WhatsApp or SMS delivery, custom streaming infrastructure or a drag-and-drop website editor.

- Accommodation allocation, transport operations, seating plans and AI planning assistants in V1.

## 3 Users and Access

| Actor   | Authentication           | Access                                                                          |
| ------- | ------------------------ | ------------------------------------------------------------------------------- |
| Admin   | Individual email account | All wedding modules; can manage Manager membership.                             |
| Manager | Individual email account | Same operational planning access as Admin; cannot manage Manager membership.    |
| Guest   | No account               | Public website plus private RSVP and gallery through an authorized unique link. |

The bride and groom are expected to be Admins, but the final mechanism for adding, transferring or removing Admins remains an open decision. Admin and Manager see the same dashboard, except that Manager membership controls are hidden and denied server-side to Managers.

## 4 Product Model and Shared Rules

- Wedding is the primary ownership and data-isolation boundary. All organizer records, functions, tasks, guests, expenses, vendors, invitations and photos belong to a wedding.

- Each organizer uses an individual login and belongs to at most one wedding in V1. A wedding may have multiple organizers.

- A wedding contains multiple functions or events. Public function details do not grant a visitor an invitation or RSVP permission.

- A guest is a primary invitee, identified by name and email. Accompanying people are represented by a numeric count, not separate profiles.

- Invitations and RSVPs are function-specific. One primary invitee may RSVP differently for each function.

- Additional guests have no numeric product cap and require no organizer approval. The submitted count is visible to organizers.

- Private guest access is bearer-link based. Possession of a valid link grants its scoped rights; links should be unguessable and revocable.

## 5 Primary User Journeys

### Wedding Creation and Collaboration

- A couple creates organizer credentials and a wedding workspace.

- An Admin enters couple details, the wedding date and location.

- The Admin invites family Managers by email; Managers accept with their own accounts.

- All organizers can add functions, tasks, expenses, guest entries and vendor information.

### Invitation and RSVP

- An organizer creates a primary guest record and selects one or more functions to invite them to.

- The system generates a unique guest link and sends a personalized email invitation.

- The guest opens the link without signing in, sees their invited functions and enters an RSVP and total party size for each.

- The organizer dashboard updates attendance totals separately for each function.

- Organizers can send email reminders to eligible guests who have not responded.

### Guest Photo Sharing

- The guest opens their private link or personal QR code.

- The system validates gallery access without requesting an account.

- The guest views and uploads supported images; organizers can upload and remove images.

- Other authorized invitees can view approved or published images in the same private wedding gallery.

## 6 Functional Requirements

Requirement IDs remain stable across design and engineering revisions. All items in this section are in the proposed V1 feature scope unless marked as an open decision.

### Wedding Setup and Dashboard

- WED 01 An authorized organizer can create one wedding with couple names, wedding date, location and optional description.

- WED 02 Any authorized organizer can update wedding details, with changes reflected on the dashboard and published website.

- WED 03 The shared dashboard shows upcoming functions, assigned and overdue tasks, actual expense total, invited guests and RSVP counts.

- WED 04 Dashboard totals are derived from the wedding data; a viewer cannot access another wedding by changing identifiers or URLs.

Acceptance checks

- Creating a wedding opens its organizer dashboard.

- Two organizers see consistent counts after a permitted record update.

### Organizer Management

- ORG 01 Organizers authenticate using individual email identities and can access only their wedding.

- ORG 02 Admins can invite, list and remove Managers through the workspace interface.

- ORG 03 Admins and Managers can create, view, edit and delete ordinary wedding planning data.

- ORG 04 Managers cannot call membership management endpoints or grant themselves Admin privileges.

- ORG 05 Removed Managers lose access to the wedding workspace promptly.

Acceptance checks

- An invited Manager can join with a distinct account and sees the shared wedding.

- A Manager is denied a Manager-removal operation even through a direct API request.

### Function and Event Management

- EVT 01 Organizers can create, edit and delete multiple functions within a wedding.

- EVT 02 Each function stores a name, description, date, start time, end time and venue information.

- EVT 03 Functions appear in chronological order in the dashboard and public wedding schedule.

- EVT 04 Task and expense records may reference a function without requiring that association.

- EVT 05 Edits to a function cannot alter invitation eligibility for other functions.

Acceptance checks

- Creating Haldi and Reception produces two distinct published schedule entries.

- A guest invited only to Reception cannot submit an RSVP for Haldi.

### Task Management

- TSK 01 Organizers can create tasks with title, optional description, due date, assignee and function.

- TSK 02 Task status supports To Do, In Progress and Completed.

- TSK 03 Tasks can be listed and filtered by assignee, function, due date and status.

- TSK 04 Authorized organizers may reassign, update and remove tasks.

- TSK 05 The dashboard identifies incomplete tasks that are past their due date.

Acceptance checks

- A Manager can assign a task to an Admin and the Admin can complete it.

- Completing a task changes the dashboard progress summary.

### Expense Tracker

- EXP 01 Organizers can record a paid expense with amount, currency, date, description and optional function and category.

- EXP 02 Authorized organizers can edit, delete and list every expense in their wedding.

- EXP 03 The system calculates overall recorded expenditure and event-level totals from expense entries.

- EXP 04 Both Admins and Managers can view all expenses; no private family budgets or spending approvals exist.

- EXP 05 The expense tracker does not require a target budget or category allocation to function.

Acceptance checks

- Recording expenses for two functions increases the overall total by their sum.

- An organizer may record an expense without creating a budget.

### Vendor Management and Discovery

- VEN 01 Organizers can search nearby vendors by category and explicit wedding or event location.

- VEN 02 Search results may show vendor name, address, rating, phone, website and map action when supplied by the provider.

- VEN 03 Organizers can keep a simple saved-vendor list with vendor name, category, contact information and notes.

- VEN 04 External listing results are clearly distinguished from organizer-saved vendor information.

- VEN 05 V1 does not process vendor bookings, availability reservations or vendor payments.

Acceptance checks

- Searching for photographers around a chosen event location returns available provider listings.

- An organizer can save a vendor and find the record later without re-running discovery.

### Guest Records and Function RSVPs

- GST 01 Organizers can create, edit, remove and list primary invitees with name and email address.

- GST 02 An invitee can be assigned an invitation to one or more selected functions.

- GST 03 For each invited function, the guest can submit attendance status and additional guest count via a unique link.

- GST 04 The additional guest count is a non-negative integer without an application cap or approval flow.

- GST 05 For an attending RSVP, function headcount equals one primary invitee plus the submitted additional guest count.

- GST 06 For a declined RSVP, function headcount is zero; missing responses are counted separately from confirmed attendance.

- GST 07 A guest cannot submit an RSVP for a function they were not invited to.

- GST 08 Organizers see each function response and aggregated function headcount, not individual accompanying-person identities.

Acceptance checks

- A guest invited to Haldi and Wedding may respond with different counts for each.

- Submitting 15 accompanying guests succeeds without approval, and the organizer sees 16 total attendees for that event.

### Email Invitations and Reminders

- INV 01 Each primary invitee receives a unique, unguessable invitation URL granting access to the functions selected for that guest.

- INV 02 Organizers can send personalized invitation emails and see at least whether sending was requested or accepted by the mail provider.

- INV 03 Organizers can resend invitations and send email RSVP reminders in V1.

- INV 04 Guest RSVP access does not require an account or password.

- INV 05 Organizers can manually share the guest invitation link through a WhatsApp share action; no automatic WhatsApp or SMS delivery runs.

- INV 06 Revoked guest access links no longer authorize private guest operations.

Acceptance checks

- A delivered invitation URL opens the intended guest experience without authentication.

- A revoked token cannot retrieve private RSVP data or gallery media.

### Public Wedding Website

- WEB 01 Each wedding has a shareable public website URL with a basic homepage and function schedule.

- WEB 02 Organizers can select from two or three prebuilt themes and customize basic wedding text and images.

- WEB 03 Public pages show couple information, wedding date, function information and venue directions.

- WEB 04 Private RSVP and gallery data are never included in public website responses.

- WEB 05 The website is usable on phones and does not require guest authentication to read public information.

Acceptance checks

- Switching theme changes presentation without deleting events or guest records.

- An anonymous visitor can see the public schedule but not a guest-specific RSVP.

### Photo Gallery and QR Codes

- GAL 01 Authorized organizers can upload and remove wedding photos.

- GAL 02 A guest with a valid personal access link can upload images and view the wedding gallery without signing in.

- GAL 03 Each guest has a personal QR code that resolves to a scoped, private gallery experience.

- GAL 04 The gallery is not included in the public wedding pages or search indexing.

- GAL 05 The system enforces file type, size, storage access and upload abuse controls before publishing an upload.

- GAL 06 Only authorized guest links and organizer sessions may retrieve private gallery media.

- GAL 07 Gallery images can be viewed and downloaded by authorized guests.

Acceptance checks

- A valid guest QR code opens the gallery and supports photo upload.

- An anonymous request without a valid token or organizer session cannot retrieve a private image.

### Livestream

- LIV 01 Organizers can set, update or remove a YouTube livestream URL or embed identifier.

- LIV 02 A configured livestream is displayed through an embedded YouTube player on the wedding website.

- LIV 03 The application does not ingest, store or distribute livestream video itself.

- LIV 04 The player handles unavailable or invalid streams without breaking the wedding website.

Acceptance checks

- A supported YouTube live URL displays a playable embed.

- Removing the URL removes the player without affecting other website content.

## 7 Information Architecture

| Organizer area         | Primary purpose                                        |
| ---------------------- | ------------------------------------------------------ |
| Overview               | Upcoming functions, task summary, expenses and RSVPs.  |
| Events                 | Wedding schedule and function details.                 |
| Tasks                  | Assignments, status and deadlines.                     |
| Expenses               | Paid expense ledger and totals.                        |
| Vendors                | Saved vendor list and nearby search.                   |
| Guests and Invitations | Invitees, event-level RSVP and email delivery actions. |
| Wedding Website        | Public pages, theme and livestream configuration.      |
| Photo Gallery          | Media uploads and guest access links.                  |
| Team Management        | Manager invitations and removal, Admin only.           |

The guest experience has public Home and Events pages, plus a link-gated Invitation and RSVP page and a link-gated Photo Gallery. Guests have no organizer navigation or profile account.

## 8 Conceptual Data Entities

| Entity                    | Key relationships and behavior                               |
| ------------------------- | ------------------------------------------------------------ |
| Wedding                   | Root workspace; public content and wedding settings.         |
| Organizer Membership      | User identity, wedding reference and Admin or Manager role.  |
| Event                     | Function belonging to one wedding.                           |
| Task                      | Wedding, optional event and organizer assignee.              |
| Expense                   | Wedding, optional event, date and paid amount.               |
| Saved Vendor              | Wedding, provider reference or manual contact data.          |
| Primary Guest             | Wedding, name and email; no guest account.                   |
| Event Invitation and RSVP | Guest plus event eligibility, response and additional count. |
| Guest Access Token        | Private, revocable scope for RSVP and gallery operations.    |
| Photo                     | Wedding, uploader context, storage key and moderation state. |
| Website Settings          | Wedding theme, copy, images and YouTube embed reference.     |

This is a domain glossary, not an approved physical database schema. The exact tables, indexes and API contracts will follow during technical design.

## 9 Nonfunctional Requirements

### Security and Privacy

- Enforce wedding-level access checks on every organizer data operation and media reference. Authorization must not rely on hidden UI controls.

- Use cryptographically unguessable guest tokens, store token material safely, and support revocation. Rate-limit invitation, RSVP and upload operations.

- Treat guest links as bearer credentials. Do not include raw private tokens in public pages, analytics events or logs.

- Restrict gallery object access; public direct object URLs must not bypass link checks.

- Validate uploads for supported formats, size and content; provide deletion and abuse response procedures.

- Collect only information needed for invitations and RSVP. Define retention and account deletion policies before production launch.

### Reliability and Experience

- Responsive, mobile-first guest pages and usable desktop organizer views.

- Accessible form labeling, keyboard operation, focus states and readable contrast.

- Consistent updates when multiple organizers edit wedding records; prevent accidental cross-wedding data leakage.

- Email sending must expose failure states and allow safe retry without unintended duplicate sends.

- Uploaded media should retain a processing or failed state instead of appearing silently lost.

- Display local event times correctly with the wedding timezone rather than the viewer device timezone alone.

### Scalability and Observability

- Support many separate wedding workspaces while preserving one-wedding-per-organizer-account behavior.

- Record critical changes and delivery events for diagnosis and accountability without exposing guest access tokens.

- Set initial image size, storage quotas, invitation volume and expected guest-count targets after pilot measurements.

- Measure media-upload errors, RSVP completion failures and email provider errors before public rollout.

## 10 Launch Acceptance Scenarios

- A newly registered couple creates a wedding, adds an Admin or Manager and sees the same shared data from separate email accounts.

- An organizer creates several functions, assigns tasks, records expenses and sees accurate dashboard totals.

- A guest is invited to two functions by email, responds differently for each and enters an uncapped accompanying count.

- An organizer sees per-function confirmed headcount, unanswered invitations and can send an RSVP reminder.

- The public wedding page displays the chosen theme and schedule without leaking private guest or gallery data.

- A guest uses their personal QR code to view and upload photos; a revoked link no longer works.

- A Manager can maintain planning data but cannot add or remove Manager accounts.

- A YouTube livestream embeds cleanly, and invalid or removed video settings leave the website usable.

## 11 Success Measures

These metrics should be instrumented in V1. Numerical targets will be set after an initial pilot rather than invented before usage is known.

| Metric              | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| Wedding activation  | New wedding has at least one function and one additional organizer. |
| Planning engagement | Wedding has tasks, expenses and guest records updated over time.    |
| Invitation delivery | Ratio of send attempts accepted by the email provider.              |
| RSVP completion     | Share of invited functions with a guest response.                   |
| Media participation | Share of weddings with successful guest photo uploads.              |
| Operational safety  | Cross-wedding access failures and revoked-link access tests pass.   |

## 12 Risks and Dependencies

- Email delivery: invitation reliability depends on email provider configuration, sender reputation, suppression handling and link validity.

- Guest link forwarding: passwordless access is frictionless but cannot confirm that the viewer is the intended recipient.

- Unbounded additional guests: no approval or count limit may yield unexpectedly high RSVP totals; organizers need visibility and correction tools.

- Vendor discovery: listing quality, available fields, quotas and cost depend on the selected places provider.

- Photo storage: large media uploads create storage, security, moderation and lifecycle costs that require explicit controls.

- YouTube privacy: an embedded unlisted YouTube stream is not a strong access-control mechanism.

## 13 Open Decisions Before Engineering Signoff

| ID    | Decision required                                                 | Proposed default                                                |
| ----- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| OD 01 | Who can add, remove or transfer Admin access?                     | Multiple Admins; Admin-only changes with last-Admin protection. |
| OD 02 | Can guests edit RSVPs and until when?                             | Same unique link; edits allowed until function start.           |
| OD 03 | Are email reminders manual, scheduled or both?                    | Organizer-triggered reminders first.                            |
| OD 04 | Does a guest token cover RSVP and gallery or use separate scopes? | One personal entry link with distinct scoped operations.        |
| OD 05 | Do guest uploads appear immediately or after review?              | Organizers may remove; moderation policy to finalize.           |
| OD 06 | How long do guest links and photos remain available?              | Define lifecycle and revocation rules before launch.            |
| OD 07 | Which vendor fields and saved-list actions are essential?         | Search, contact, website, map, save and notes.                  |
| OD 08 | What is the initial guest and storage scale per wedding?          | Validate against real pilot wedding sizes.                      |
| OD 09 | Should expense entry support pending vendor payments?             | V1 tracks money already paid only.                              |

These proposed defaults are not approved product decisions. Product review should confirm them before detailed API contracts and implementation milestones are frozen.

## 14 Signoff and Next Step

The Product owner should review the functional requirements, non-goals, open decisions and launch acceptance scenarios. Once approved, the next deliverables are information architecture, wireframes, technical architecture, a domain data model, API contracts and a milestone-based implementation plan.

PRD status: Draft for review. Approval date and owner to be completed after scope signoff.
