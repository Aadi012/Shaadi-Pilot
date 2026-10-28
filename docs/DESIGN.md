# ShaadiPilot workspace design system

## 1. Visual theme and atmosphere

Use the user-approved Stitch wedding workspace references in
`designs/wedding-workspace/references.json`. Calm, warm, editorial and practical;
balanced density and restrained motion. Preserve the existing ShaadiPilot heart
mark and brand. User-approved references take precedence over generic skill
defaults; do not replace the established fonts or palette or add perpetual motion.

## 2. Palette and roles

- Lavender canvas `#FCF8FF`: page background.
- White `#FFFFFF`: workspace panels and form sections.
- Soft lavender `#F6F2FC`: empty states and quiet grouping.
- Plum `#4C2F3D`: primary actions and selected navigation.
- Dark plum `#341A27`: hover/pressed emphasis.
- Brass `#856B42`: restrained labels and small icon accents.
- Ink `#29232A`: primary text; muted `#716770`: supporting text.
- Border `#E9E1E7`: structural divisions; stronger input outlines where needed.

## 3. Typography

Locally served Newsreader for editorial headings and Manrope for controls, labels,
navigation and body. Headings use a controlled 32–44px scale; body 12–15px on
desktop, readable mobile inputs at 16px. Keep long names and locations wrapping.

## 4. Components

Plum primary buttons, minimum 44px touch targets, visible focus states, labels
above inputs and errors below. Forms group couple, ceremony/destination and
address/introduction into numbered sections. No credentials requested again.
Empty overview panels explain what is next; future controls are visibly disabled.
Never show a completed operation or fabricated planning activity as real data.

## 5. Layout

Guest contacts uses the inspected directory, contact detail, add/edit and mobile
references in designs/guests. Preserve the existing brand/shell, editorial title,
quiet filter panel, desktop rows and mobile cards. Use a native modal with clear
inline discard/removal confirmations. Require email; shared family addresses warn
without merging. Selected functions are labelled planning intent. Exclude generated
seating, transport, room allocation, accompanying-person profiles, dietary schemas,
priority tiers, verification claims, CSV export and fabricated RSVP/dispatch data.

Tasks uses the four inspected desktop/mobile references in designs/tasks. Keep
the editorial heading, summary strip, quiet filter panel and desktop registry;
collapse rows into readable mobile cards. Forms use native modal dialogs and
group title/notes, function/assignee, timezone-aware deadline and status. Preserve
drafts on failure, reset after discard/success, and explicitly load latest details
after conflicts. Exclude prototype tabs, priority/category fields, attachments,
PDF exports, offline sync, audit history and notification actions outside V1.
Use real counts, no sample task records, and the existing shared brand/shell.

Functions uses the five user-attached references in designs/functions. Retain
the warm canvas, editorial function titles, schedule cards and right-side form
drawer. Mobile stacks fields/actions. Exclude state-preview tabs, dummy planning
counts, muhurat recommendations and unimplemented invitation/publication controls.

Manager-invitation references are archived in `designs/organizer-invitations`:
Team Management, Invite & Revoke Dialogs, and Invitation Acceptance & States.
All three inspected references are desktop screens from project 7444919587454097178. No dedicated mobile Team screen was listed; adapt with the
existing responsive workspace shell. Preserve the warm/plum brand, editorial
headings, roster panels, native modal dialogs and centered join card. Exclude
generated copy-link, existing-member removal, custom role and state-inspector
controls from this invitation slice. Show real records and truthful mail states.

Password recovery references live under `designs/password-recovery` from project 14249455352497050706. Use the centered, restrained form panel, brand above it and
quiet footer. Reuse existing input, visibility and button styles. Keep confirmation,
invalid-link and success states inside the same panel; no dashboard shell, design
state toggles, passkey promotion, fake delivery badge or encryption claims.

Welcome: centered editorial introduction, broad creation panel and smaller
image/invitation aside. Details: contained form, progress indicator and privacy
notice. Overview: desktop sidebar, slim header, setup cards, indicators and a
two-column content area. Mobile uses a native modal navigation drawer, stacked
sections and two-column indicators. No page-level horizontal overflow at 320px.

## 6. Motion and interaction

Manager removal follow-up uses the existing Team reference's Manager-only Remove
control. Reuse the native confirmation dialog with the organizer's name, explicit
access consequences, Keep Manager and Remove Manager actions. Do not add Admin
removal or role pickers. On mobile, wrap role/actions below the organizer identity;
keep 44px controls, keyboard cancellation and focus restoration.

Wedding settings follows the approved `designs/wedding-details` references:
existing sidebar/header, four numbered form sections and a sticky save row.
Mobile stacks fields and wraps actions without horizontal page scrolling.
The address is read-only. Preserve drafts on failure/conflict, use an explicit
discard confirmation and show inline accessible validation. Design-only state
controls, platform metrics and location photos are not product requirements.

Restrained hover/press feedback. Pending forms prevent duplicate submission.
Focus the signup/validation result when appropriate. Honor reduced motion;
no looping decorative animation or new animation dependency.

## 7. Content and anti-patterns

Retain layouts while correcting generated source copy: no encryption guarantees,
billing, concierge, public join codes, offline cache, budgets or custom roles.
Do not expose design state inspectors in the product. No sample records in the
private workspace. Preserve per-function RSVP semantics and Admin-only membership
controls. Published public website assets and planning modules are later slices.
