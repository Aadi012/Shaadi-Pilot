import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth/auth-page';

export const metadata: Metadata = {
  title: 'Create an account — ShaadiPilot',
  description: 'Plan your celebration together. Create your organizer account.',
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
