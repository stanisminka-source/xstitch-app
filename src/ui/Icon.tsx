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
  area: 'M4 4h6v6H4Z M14 4h6v6h-6Z M4 14h6v6H4Z M14 14h6v6h-6Z',
  org: 'M4 5h16 M6 5v14 M10 5v14 M14 5v14 M18 5v14 M4 19h16',
  bag: 'M5 8h14l-1 12H6Z M9 8V6a3 3 0 0 1 6 0v2',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4Z M4 8l8 4 8-4 M12 12v8',
  share: 'M12 15V4 M8 8l4-4 4 4 M6 12H5v8h14v-8h-1',
  chart: 'M4 20h16 M7 16v-4 M12 16V7 M17 16v-7',
  download: 'M12 4v12 M7 11l5 5 5-5 M5 20h14',
  sort: 'M7 4v16 M4 17l3 3 3-3 M17 20V4 M14 7l3-3 3 3',
  brush: 'M4 20c2.5 0 4-1.3 4-3.5a2.5 2.5 0 0 0-5 0c0 1.4-.4 2.6-1 3.5Z M9.5 14.5 20 4 M8 12l4 4',
  square: 'M4 4h16v16H4Z M8 8l8 8 M16 8l-8 8',
  eraser: 'M8 20h12 M5.5 15.5l9-9a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L11 18H8l-2.5-2.5Z M10 11l4 4',
  undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
