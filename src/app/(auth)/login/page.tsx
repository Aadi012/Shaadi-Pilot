import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth/auth-page';

export const metadata: Metadata = {
  title: 'Log in — ShaadiPilot',
  description:
    'A shared space for your wedding planning. Log in to your organizer account.',
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
