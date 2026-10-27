const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export function resetEmail(link: string) {
  return {
    subject: 'Reset your ShaadiPilot password',
    text: `Reset your password\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 30 minutes. If you didn't request this, you can ignore this email. Your password has not changed.`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#fcf8ff;color:#29232a;font-family:Arial,sans-serif"><main style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border-radius:12px"><p style="color:#4c2f3d;font-size:22px">ShaadiPilot</p><h1>Reset your password</h1><p>Choose a new password for your organizer account.</p><p style="margin:32px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 24px;background:#4c2f3d;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p><p>This link expires in 30 minutes.</p><p>If you didn't request this, you can ignore this email. Your password has not changed.</p></main></body></html>`,
  };
}
