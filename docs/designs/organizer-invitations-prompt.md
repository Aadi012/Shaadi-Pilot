# Manager invitations — Stitch design brief

Prepared 27 October 2026. Status: designs supplied by the user; three relevant
desktop references inspected and implemented. See `organizer-invitations/references.json`.
The original brief below is preserved as design intent, not proof that every
requested mobile/email variant was generated.
The user authorized starting the next feature after committing the previous work.
This brief covers invitations only, not all team-management operations.

Paste the following into the ShaadiPilot Stitch project that contains the approved
wedding overview and wedding-settings screens:

```text
Design ShaadiPilot's first organizer-collaboration feature: inviting a Manager
to an existing wedding workspace and accepting that invitation.

Reuse our approved Wedding Overview, Settings → Wedding details, Login and Signup
designs. Keep the existing heart logo, Newsreader headings, Manrope body text,
lavender canvas, white panels, plum actions and restrained brass accents.
Do not redesign the brand or the existing sidebar/header.

Create desktop (1440px) and mobile (390px) variants for the screens below. They
must also work at 320px without horizontal scrolling. Use names beginning with
"ShaadiPilot — Organizer invitations".

PRODUCT RULES
- Every organizer uses their own email/password account and belongs to at most
  one wedding. Guests have no accounts and are not part of this feature.
- Admins and Managers share ordinary wedding-planning access. Only Admins manage
  organizer membership. Team administration navigation is hidden from Managers.
- This first slice invites Managers only. Do not show a role dropdown, invite an
  Admin, transfer ownership, demote anyone or remove existing members.
- Invitation acceptance requires normal login/signup with the invited email.
  Possessing the invitation alone does not sign someone in or bypass a password.
- Do not introduce mandatory email verification, OTP, social login or passkeys.

1. ADMIN TEAM PAGE — /account/team
Use the existing wedding workspace shell with Team selected in the sidebar.
Heading: "Your planning team"
Description: "Bring your people into one shared wedding plan."
Primary action: "Invite a Manager".

Show existing organizers with name and Admin/Manager role. Show the Admin's own
row with a "You" label. Avoid profile photos, phone numbers or extra personal data.
Explain: "Managers can help manage wedding planning. Only Admins manage the team."

Below the organizer list, show Pending invitations with email, fixed Manager role,
creation/expiry information and delivery status where known. Include an empty
state for no pending invitations. For an active invitation, provide "Revoke".
Revoking an invitation must not appear to remove an existing organizer.
Do not add resend, copy-private-link or existing-member removal controls yet.

Design truthful delivery labels: "Queued", "Accepted by email provider",
"Retry pending" and "Could not send". Provider acceptance does not mean inbox
delivery. Do not display "Delivered", "Read" or email-verification badges.

Include loading, unavailable/retry and narrow-screen stacked-list layouts.
Use clearly fictional examples only in the design; production uses real records.

2. INVITE A MANAGER
A focused accessible dialog or form inside Team, matching our settings forms.
One labelled email-address field. Role is fixed and explained as Manager.
Primary action: "Send invitation". Secondary: "Cancel".
Show validation, submitting, recoverable failure and accepted/queued states.
Confirmation copy: "Invitation queued. They can join after signing in with the
invited email and accepting the invitation."
Preserve the email on failure. Handle an existing pending invitation by pointing
to that row. Do not reveal whether an email is registered in another wedding.
An invitation lasts seven days; show this clearly without a decorative countdown.

3. REVOKE INVITATION CONFIRMATION
Heading: "Revoke this invitation?"
Show the pending recipient email and explain that this invitation will no longer
allow them to join. It does not remove anyone who already joined.
Actions: "Keep invitation" and "Revoke invitation".
Show pending, error and revoked outcomes. Handle an invitation accepted in the
meantime with a truthful refresh message, without offering member removal.

4. INVITATION ACCEPTANCE — /join
Use a focused authentication-style page with the ShaadiPilot brand, without an
organizer sidebar before the recipient has joined.

Signed out: explain that an organizer account is required, with "Log in" and
"Create an account" actions and guidance to use the email that was invited.
The flow should return to invitation review after normal authentication.
Do not ask for a password directly inside an invitation-acceptance confirmation.
Do not expose an invited person's full email or private wedding details before
the invitation has been validated.

Signed in with matching email and no wedding: show the invited wedding's couple
names, the Manager role and a clear explanation of planning permissions.
Primary action: "Accept invitation". Secondary action: "Not now".
Never accept automatically. Show accepting and retryable-error states.

Success: "You're part of the planning team."
Primary action: "Open wedding overview".
The joined workspace must show the Manager role and hide Team administration.

Include these distinct outcomes:
- Signed in with the wrong email: explain the mismatch and offer a clear way to
  switch accounts. Do not offer an email change or membership override.
- Already belongs to a different wedding: explain that V1 supports one wedding
  per organizer; do not offer automatic leave, merge or transfer.
- Already joined the invited wedding: show "You're already part of this wedding"
  with "Open wedding overview", without claiming a new membership was created.
- Invalid, expired or revoked invitation: a neutral message asking the recipient
  to contact the inviting Admin for a new invitation. Do not send a new invitation
  automatically or ask the recipient to search for a wedding publicly.
- Temporarily unavailable: allow safe retry and do not imply acceptance succeeded.

5. SIMPLE TRANSACTIONAL EMAIL REFERENCE
ShaadiPilot brand, a concise invitation to help plan a wedding, fixed Manager
role, one "Review invitation" button and seven-day expiry guidance. Explain that
the recipient must log in or create an account with the invited email, then accept.
Use a fictional destination and examples. No real token, marketing, tracking
widgets, public join codes or delivery guarantees.

ACCESSIBILITY AND CONTENT
Minimum 44px touch targets, 16px mobile inputs, visible labels/focus, readable
contrast, inline errors, accessible dialogs with Escape/focus return, and status
announcements. Disable repeat submission while pending and respect reduced motion.
Put design state variants outside product screens, not in a shipped inspector.
Never show raw token strings, backend IDs or implementation details to users.
No billing, subscription limits, realtime presence, guest invitations, RSVP,
existing-member removal, Admin invitation or unrelated planning features.
```
