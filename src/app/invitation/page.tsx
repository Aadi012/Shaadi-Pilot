import { InvitationHub } from '@/components/guest/invitation-hub';
export const metadata = {
  title: 'Your private invitation — ShaadiPilot',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <InvitationHub />;
}
