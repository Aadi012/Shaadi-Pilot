'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import { WorkspaceShell } from './workspace-shell';
import {
  inviteSchema,
  type MemberDto,
  type InviteDto,
} from '@/modules/memberships/contracts';
import type { WeddingDto } from '@/modules/weddings/contracts';
import styles from './team.module.css';
import workspace from './workspace.module.css';
const subscribe = () => () => {};
type Page<T> = { nextCursor: string | null } & T;
const mailLabels: Record<InviteDto['delivery'], string> = {
  pending: 'Queued',
  leased: 'Submission in progress',
  retry: 'Retry pending',
  submitted: 'Accepted by email provider',
  failed: 'Could not send',
  cancelled: 'Cancelled',
  quarantined: 'Needs review',
  unavailable: 'Status unavailable',
};
export function Team({
  wedding,
  name,
  userId,
  initialMembers,
  initialInvitations,
}: {
  wedding: WeddingDto;
  name: string;
  userId: string;
  initialMembers: Page<{ members: MemberDto[] }>;
  initialInvitations: Page<{ invitations: InviteDto[] }>;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [memberPage, setMemberPage] = useState(initialMembers);
  const [invitePage, setInvitePage] = useState(initialInvitations);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [revoke, setRevoke] = useState<InviteDto | null>(null);
  const [removing, setRemoving] = useState<MemberDto | null>(null);
  const [activeDialog, setActiveDialog] = useState<
    'invite' | 'revoke' | 'remove' | null
  >(null);
  const busy = useRef(false);
  const request = useRef<{ email: string; key: string } | null>(null);
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const revokeDialog = useRef<HTMLDialogElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  async function session() {
    const response = await fetch('/api/v1/auth/session', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const { data } = await response.json();
    if (
      data.user?.id !== userId ||
      data.user?.weddingId !== wedding.id ||
      data.user?.role !== 'admin'
    )
      throw new Error('context');
    return data;
  }
  async function load(kind: 'members' | 'invitations', append = false) {
    const current = kind === 'members' ? memberPage : invitePage;
    const response = await fetch(
      '/api/v1/' +
        (kind === 'members' ? 'members' : 'member-invites') +
        (append && current.nextCursor ? '?cursor=' + current.nextCursor : ''),
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error();
    const { data } = await response.json();
    if (data.weddingId !== wedding.id) throw new Error('context');
    if (kind === 'members')
      setMemberPage((previous) => ({
        members: append ? [...previous.members, ...data.members] : data.members,
        nextCursor: data.nextCursor,
      }));
    else
      setInvitePage((previous) => ({
        invitations: append
          ? [...previous.invitations, ...data.invitations]
          : data.invitations,
        nextCursor: data.nextCursor,
      }));
  }
  async function refresh(kind: 'members' | 'invitations', append = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    try {
      await session();
      await load(kind, append);
    } catch {
      setFailure(
        'Could not refresh this team. Your account or wedding may have changed. Reload the workspace before continuing.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function invite(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setFieldError('');
    setFailure('');
    setNotice('');
    const parsed = inviteSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError('Enter a valid email address.');
      return;
    }
    if (request.current?.email !== parsed.data.email)
      request.current = { email: parsed.data.email, key: crypto.randomUUID() };
    busy.current = true;
    setPending(true);
    try {
      const current = await session();
      const response = await fetch('/api/v1/member-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': current.csrfToken,
          'X-Wedding-Context': wedding.id,
          'Idempotency-Key': request.current.key,
        },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (!response.ok) {
        const code = body.error?.code;
        setFailure(
          code === 'ALREADY_MEMBER'
            ? 'This organizer is already part of your wedding.'
            : code === 'WEDDING_CONTEXT_CHANGED'
              ? 'Your signed-in wedding changed. Reload before inviting anyone.'
              : response.status === 503
                ? 'Invitation email is unavailable or not configured. Your email is still here; please try again after setup.'
                : response.status === 429
                  ? 'Too many requests. Try again in 15 minutes.'
                  : 'Could not queue the invitation. Your email is still here; retry with the same details.',
        );
        return;
      }
      setNotice(
        body.data.created
          ? 'Invitation queued. They can join after signing in with the invited email and accepting.'
          : 'This invitation already exists. No additional email was queued.',
      );
      setEmail('');
      request.current = null;
      inviteDialog.current?.close();
      try {
        await load('invitations');
      } catch {
        setFailure(
          'The invitation request succeeded, but the list could not refresh. Refresh invitations to see its current status.',
        );
      }
    } catch {
      setFailure(
        'Could not confirm the invitation. Your email has been kept. Check your signed-in account and retry with the same details.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function confirmRevoke() {
    if (!revoke || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    setNotice('');
    try {
      const current = await session();
      const response = await fetch(
        `/api/v1/member-invites/${revoke.id}/revoke`,
        {
          method: 'POST',
          headers: {
            'X-CSRF-Token': current.csrfToken,
            'X-Wedding-Context': wedding.id,
          },
        },
      );
      if (!response.ok) {
        setFailure(
          response.status === 409
            ? 'This invitation may already have been accepted. Refresh the team list.'
            : 'Could not revoke the invitation. Refresh and try again.',
        );
        return;
      }
      setNotice('Invitation revoked. It can no longer be used to join.');
      setRevoke(null);
      revokeDialog.current?.close();
      try {
        await load('invitations');
      } catch {
        setFailure(
          'The invitation was revoked, but the list could not refresh. Refresh invitations to see its current status.',
        );
      }
    } catch {
      setFailure(
        'Could not confirm revocation. Refresh the invitation list before trying again.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function confirmRemoval() {
    if (!removing || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    setNotice('');
    try {
      const current = await session();
      const response = await fetch(`/api/v1/members/${removing.id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': current.csrfToken,
          'X-Wedding-Context': wedding.id,
          'If-Match': `"${removing.membershipVersion}"`,
        },
      });
      if (!response.ok) {
        setFailure(
          response.status === 412
            ? 'This membership changed. Cancel, refresh organizers and review it again before removing.'
            : response.status === 404
              ? 'This organizer is no longer in this wedding. Cancel and refresh the team list.'
              : response.status === 409
                ? 'Your signed-in wedding changed. Reload the workspace before continuing.'
                : response.status === 429
                  ? 'Too many attempts. Try again in 15 minutes.'
                  : 'Could not remove this Manager. Check your account and refresh the team before retrying.',
        );
        return;
      }
      setNotice(
        'Manager removed. Their sessions and old invitations have been revoked.',
      );
      setRemoving(null);
      removeDialog.current?.close();
      try {
        await Promise.all([load('members'), load('invitations')]);
      } catch {
        setFailure(
          'Removal succeeded, but the lists could not refresh. Refresh the team to see its current status.',
        );
      }
    } catch {
      setFailure(
        'Could not confirm removal. Refresh the team before retrying; your request may already have succeeded.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const expire = (value: string) =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: wedding.timezone,
    }).format(new Date(value));
  return (
    <WorkspaceShell wedding={wedding} name={name} role="admin" active="Team">
      <div className={styles.container}>
        <div className={styles.heading}>
          <div>
            <p className={workspace.eyebrow}>Management · Workspace access</p>
            <h1>Planning Team</h1>
            <p>
              The family, planners and organizers coordinating your celebration.
            </p>
          </div>
          <button
            className={workspace.primaryButton}
            disabled={!hydrated || pending}
            onClick={() => {
              setFailure('');
              setFieldError('');
              setActiveDialog('invite');
              inviteDialog.current?.showModal();
            }}
          >
            Invite a Manager
          </button>
        </div>
        <div className={styles.permissionNote}>
          <strong>One shared wedding. Clear responsibilities.</strong>
          <p>
            Managers can help manage wedding planning. Only Admins manage the
            team. Invitations expire after seven days.
          </p>
        </div>
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {failure && !activeDialog && (
          <p role="alert" className={workspace.errorNotice}>
            {failure}
          </p>
        )}
        <section className={styles.panel} aria-labelledby="organizers-title">
          <div className={styles.sectionHeading}>
            <h2 id="organizers-title">Active organizers</h2>
            <button
              className={workspace.textButton}
              disabled={!hydrated || pending}
              onClick={() => refresh('members')}
            >
              Refresh
            </button>
          </div>
          <ul className={styles.list}>
            {memberPage.members.map((member) => (
              <li key={member.id} className={styles.memberRow}>
                <span className={styles.avatar}>{member.name.slice(0, 1)}</span>
                <div>
                  <strong>{member.name}</strong>
                  {member.id === userId && <small>You</small>}
                </div>
                <div className={styles.memberActions}>
                  <span className={styles.role}>
                    {member.role === 'admin' ? 'Admin' : 'Manager'}
                  </span>
                  {member.role === 'manager' && member.id !== userId && (
                    <button
                      className={workspace.textButton}
                      disabled={!hydrated || pending}
                      aria-label={`Remove ${member.name}`}
                      onClick={() => {
                        setFailure('');
                        setRemoving(member);
                        setActiveDialog('remove');
                        removeDialog.current?.showModal();
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {memberPage.nextCursor && (
            <button
              className={workspace.textButton}
              disabled={pending}
              onClick={() => refresh('members', true)}
            >
              Load more organizers
            </button>
          )}
          <p className={styles.help}>
            Both roles can manage wedding planning. Only Admins manage team
            access.
          </p>
        </section>
        <section className={styles.panel} aria-labelledby="invitations-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="invitations-title">Organizer invitations</h2>
              <p>Review pending invitations and their sending status.</p>
            </div>
            <button
              className={workspace.textButton}
              disabled={!hydrated || pending}
              onClick={() => refresh('invitations')}
            >
              Refresh
            </button>
          </div>
          {invitePage.invitations.length === 0 ? (
            <div className={styles.empty}>
              <h3>A little more room at the planning table</h3>
              <p>
                No organizer invitations yet. Invite a Manager when you’re
                ready.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {invitePage.invitations.map((invitation) => (
                <li key={invitation.id} className={styles.inviteRow}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <small>
                      Manager · {invitation.state} · Expires{' '}
                      {expire(invitation.expiresAt)}
                    </small>
                    <small>{mailLabels[invitation.delivery]}</small>
                  </div>
                  {invitation.state === 'pending' && (
                    <button
                      className={workspace.textButton}
                      disabled={!hydrated || pending}
                      onClick={() => {
                        setFailure('');
                        setRevoke(invitation);
                        setActiveDialog('revoke');
                        revokeDialog.current?.showModal();
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {invitePage.nextCursor && (
            <button
              className={workspace.textButton}
              disabled={pending}
              onClick={() => refresh('invitations', true)}
            >
              Load more invitations
            </button>
          )}
          <p className={styles.help}>
            “Accepted by email provider” confirms submission, not delivery to an
            inbox.
          </p>
        </section>
        <dialog
          ref={inviteDialog}
          className={styles.dialog}
          aria-labelledby="invite-title"
          onClose={() => setActiveDialog(null)}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <p className={workspace.eyebrow}>Collaborative access</p>
          <h2 id="invite-title">Invite a Manager</h2>
          <p>Bring someone you trust into your wedding workspace.</p>
          <form
            onSubmit={invite}
            noValidate
            aria-label="Invite a Manager"
            aria-busy={pending}
          >
            {failure && (
              <p role="alert" className={workspace.errorNotice}>
                {failure}
              </p>
            )}
            <fieldset
              className={workspace.formFields}
              disabled={!hydrated || pending}
            >
              <legend className={workspace.srOnly}>Invitation details</legend>
              <div className={workspace.field}>
                <label htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  maxLength={254}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldError('');
                  }}
                  aria-invalid={!!fieldError}
                  aria-describedby="invite-email-help invite-email-error"
                />
                <p id="invite-email-error" className={workspace.fieldError}>
                  {fieldError}
                </p>
                <small id="invite-email-help">
                  They must sign in with this email to accept. No separate email
                  verification is required.
                </small>
              </div>
              <div className={styles.permissionNote}>
                <strong>Manager</strong>
                <p>
                  Can manage wedding planning. Cannot invite, remove or change
                  organizers.
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={workspace.textButton}
                  onClick={() => inviteDialog.current?.close()}
                >
                  Cancel
                </button>
                <button type="submit" className={workspace.primaryButton}>
                  {pending ? 'Queuing…' : 'Send invitation'}
                </button>
              </div>
            </fieldset>
          </form>
        </dialog>
        <dialog
          ref={removeDialog}
          className={styles.dialog}
          aria-labelledby="remove-title"
          onClose={() => setActiveDialog(null)}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <p className={workspace.eyebrow}>Wedding workspace access</p>
          <h2 id="remove-title">Remove this Manager?</h2>
          <p>
            <strong>{removing?.name}</strong>
          </p>
          <p>
            They will lose access to this wedding. Their signed-in sessions and
            old invitations to this wedding will be revoked. Their account and
            existing wedding planning records will be kept.
          </p>
          <p>
            They can join again only through a new invitation and explicit
            acceptance.
          </p>
          {failure && (
            <p role="alert" className={workspace.errorNotice}>
              {failure}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={workspace.textButton}
              disabled={pending}
              onClick={() => removeDialog.current?.close()}
            >
              Keep Manager
            </button>
            <button
              className={workspace.primaryButton}
              disabled={!hydrated || pending}
              onClick={confirmRemoval}
            >
              {pending ? 'Removing…' : 'Remove Manager'}
            </button>
          </div>
        </dialog>
        <dialog
          ref={revokeDialog}
          className={styles.dialog}
          aria-labelledby="revoke-title"
          onClose={() => setActiveDialog(null)}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <h2 id="revoke-title">Revoke this invitation?</h2>
          <p>{revoke?.email}</p>
          <p>
            This invitation will no longer allow them to join. Revoking an
            unused invitation does not remove an existing organizer.
          </p>
          {failure && (
            <p role="alert" className={workspace.errorNotice}>
              {failure}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={workspace.textButton}
              disabled={pending}
              onClick={() => revokeDialog.current?.close()}
            >
              Keep invitation
            </button>
            <button
              className={workspace.primaryButton}
              disabled={pending}
              onClick={confirmRevoke}
            >
              {pending ? 'Revoking…' : 'Revoke invitation'}
            </button>
          </div>
        </dialog>
      </div>
    </WorkspaceShell>
  );
}
