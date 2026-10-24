import type { MarketingIconName } from './icon';

// Fictional, public marketing examples. Never populate this with tenant data.
export const exampleWedding = {
  couple: 'Aarav & Ananya',
  location: 'Udaipur, Rajasthan',
  dates: '12–15 March 2027',
  functions: [
    {
      name: 'Mehendi',
      day: '12',
      time: '3:00 PM',
      venue: 'Courtyard Garden',
      attending: 120,
    },
    {
      name: 'Sangeet',
      day: '13',
      time: '7:00 PM',
      venue: 'Grand Ballroom',
      attending: 180,
    },
    {
      name: 'Wedding',
      day: '14',
      time: '4:00 PM',
      venue: 'Lakeside Pavilion',
      attending: 240,
    },
    {
      name: 'Reception',
      day: '15',
      time: '8:00 PM',
      venue: 'Palace Lawns',
      attending: 280,
    },
  ],
  tasks: [
    {
      title: 'Confirm the Mehendi venue',
      assignee: 'Ananya',
      initials: 'AN',
      status: 'Completed',
    },
    {
      title: 'Choose the Sangeet playlist',
      assignee: 'Rohan',
      initials: 'RK',
      status: 'In Progress',
    },
    {
      title: 'Review Reception invitations',
      assignee: 'Meera',
      initials: 'MS',
      status: 'To Do',
    },
  ],
  expenses: [
    { label: 'Venue deposit', amountMinor: 25000000, paidBy: 'Aarav' },
    { label: 'Photography', amountMinor: 8500000, paidBy: 'Ananya' },
    { label: 'Flowers & decor', amountMinor: 4500000, paidBy: 'Meera' },
  ],
} as const;

export function formatExampleMoney(amountMinor: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export const navigation = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#wedding-websites', label: 'Wedding websites' },
] as const;

export const features = [
  {
    icon: 'calendar',
    title: 'Plan every function',
    description:
      'From the first Mehendi to the final Reception. Keep dates, venues and all the little details together.',
  },
  {
    icon: 'users',
    title: 'Share the responsibilities',
    description:
      'Invite your family organizers, assign tasks and give everyone a clear part to play.',
  },
  {
    icon: 'mail',
    title: 'Invitations, made personal',
    description:
      'Send email invitations and collect RSVPs for each function. Your guests never need an account.',
  },
  {
    icon: 'wallet',
    title: 'Every expense, accounted for',
    description:
      'Record what you’ve paid, see shared spending totals and keep your wedding expenses organized.',
  },
  {
    icon: 'vendor',
    title: 'Your vendors, in one place',
    description:
      'Discover nearby vendors and save their contact details and notes for easy reference.',
  },
  {
    icon: 'camera',
    title: 'Memories worth keeping',
    description:
      'Give guests personal links and QR codes to upload and view photos in your private wedding gallery.',
  },
] as const satisfies ReadonlyArray<{
  icon: MarketingIconName;
  title: string;
  description: string;
}>;
