type IconName = 'play' | 'pause' | 'previous' | 'next' | 'reset' | 'code' | 'chart' | 'chevron' | 'book';

const paths: Record<IconName, string> = {
  play: 'm8 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  previous: 'M6 5v14m12-14-9 7 9 7V5Z',
  next: 'M18 5v14M6 5l9 7-9 7V5Z',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
  chart: 'M5 20V10m7 10V4m7 16V8',
  chevron: 'm9 5 7 7-7 7',
  book: 'M12 5v15M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v14h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3V4Z',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
