import { RecoveryPage } from '@/components/auth/recovery-page';
export const metadata = {
  title: 'Forgot password — ShaadiPilot',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function Page() {
  return <RecoveryPage mode="request" />;
}
