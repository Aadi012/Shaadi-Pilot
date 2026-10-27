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
