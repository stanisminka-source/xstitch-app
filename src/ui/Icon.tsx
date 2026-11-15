// Простые контурные значки (24×24), нарисованные вручную.
const PATHS: Record<string, string> = {
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  grid: 'M4 4h16v16H4Z M4 9.3h16 M4 14.6h16 M9.3 4v16 M14.6 4v16',
  pencil: 'M4 20l4-1 11-11-3-3L5 16l-1 4Z M14 7l3 3',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  target: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z',
  x: 'M6 6l12 12 M18 6L6 18',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  check: 'M5 12l5 5 9-10',
  sort: 'M7 4v16 M4 17l3 3 3-3 M17 20V4 M14 7l3-3 3 3',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
