import Link from 'next/link';
export function WorkspaceAccessError() {
  return (
    <main style={{ maxWidth: 600, margin: '15vh auto', padding: 24 }}>
      <h1>Your workspace is temporarily unavailable</h1>
      <p>
        Please try again shortly. Your wedding details have not been changed.
      </p>
      <Link href="/account">Try again</Link>
    </main>
  );
}
