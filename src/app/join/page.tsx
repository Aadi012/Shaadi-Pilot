import { Join } from '@/components/workspace/join';
export const metadata = {
  title: 'Wedding invitation — ShaadiPilot',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function Page() {
  return <Join />;
}
