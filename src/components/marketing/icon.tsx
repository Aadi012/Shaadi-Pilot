const paths = {
  arrow: ['M4 12h15m-6-6 6 6-6 6'],
  calendar: [
    'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',
    'M8 14h2m4 0h2m-8 3h2',
  ],
  tasks: ['m3 6 2 2 3-4m-5 9 2 2 3-4m-5 9 2 2 3-4M12 6h9m-9 7h9m-9 7h9'],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9',
    'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-3.9a4 4 0 0 1 0 7.8',
  ],
  wallet: ['M20 8V5H5a2 2 0 0 1 0-4h14v4M4 5v16h17V8H4m17 5h-5v4h5'],
  vendor: [
    'M3 10V5h18v5M5 14v7h14v-7M2 10a3.3 3.3 0 0 0 6.7 0 3.3 3.3 0 0 0 6.6 0 3.3 3.3 0 0 0 6.7 0M9 21v-6h6v6',
  ],
  camera: ['M3 6h4l2-3h6l2 3h4v15H3V6Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  check: ['m5 12 4 4L19 6'],
  pin: [
    'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  ],
  mail: ['M3 5h18v14H3V5Zm0 1 9 7 9-7'],
  link: [
    'm10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 4 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  ],
  play: ['m9 5 11 7-11 7V5Z'],
  sparkle: ['m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  close: ['m6 6 12 12M6 18 18 6'],
  globe: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  ],
  heart: [
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  ],
} as const;

export type MarketingIconName = keyof typeof paths;

export function MarketingIcon({
  name,
  size = 20,
  className,
}: {
  name: MarketingIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
