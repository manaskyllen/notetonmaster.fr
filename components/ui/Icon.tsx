import { Glyph } from './Glyph';
import { ALERT, CHECK, CLOSE, MENU, MONITOR, MOON, SEARCH, SUN } from './glyphs';

/**
 * Stroke icons by name (drawn by Glyph): 2 px, round caps, 24 grid, currentColor.
 * The first 17 icons come from the reference bundle; the others follow the same rules.
 */
const PATHS = {
  search: SEARCH,
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  external: ['M7 17L17 7', 'M9 7h8v8'],
  close: CLOSE,
  check: CHECK,
  heart: ['M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z'],
  thumb: ['M7 11v9H4v-9h3z', 'M7 11l4-7a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 6A2 2 0 0117.3 20H7'],
  universite: ['M3 10l9-6 9 6', 'M5 10v9', 'M19 10v9', 'M9.5 10v9', 'M14.5 10v9', 'M3 20h18'],
  mention: ['M12 3l9 5-9 5-9-5 9-5z', 'M3 13l9 5 9-5'],
  parcours: ['C6 18 2.5', 'C18 6 2.5', 'M8.5 18H15a3.5 3.5 0 000-7H9a3.5 3.5 0 010-7h6.5'],
  pin: ['M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z', 'C12 9.5 2.5'],
  info: ['C12 12 9', 'M12 11v5', 'M12 8h.01'],
  alert: ALERT,
  refresh: [
    'M20 11a8 8 0 00-14.6-4.5L4 8',
    'M4 3v5h5',
    'M4 13a8 8 0 0014.6 4.5L20 16',
    'M20 21v-5h-5',
  ],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  database: ['E12 5 8 3', 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  menu: MENU,
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  user: ['C12 8 4', 'M4 21a8 8 0 0116 0'],
  users: ['C9 8 3.5', 'M2 20a7 7 0 0114 0', 'M16 4.5a3.5 3.5 0 010 7', 'M18 14a6 6 0 014 6'],
  mail: ['R3 5 18 14 3', 'M3 7l9 6 9-6'],
  lock: ['R4 11 16 10 3', 'M8 11V7a4 4 0 018 0v4'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z', 'M8.5 12l2.5 2.5 4.5-5'],
  message: ['M4 5h16v11H9l-5 4V5z'],
  send: ['M4 12l16-8-6 16-3-7-7-1z'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  file: ['M6 3h8l4 4v14H6V3z', 'M14 3v4h4'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'C12 12 3'],
  'eye-off': [
    'M3 3l18 18',
    'M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3 3.9',
    'M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 005.4-1.6',
    'M9.9 9.9a3 3 0 004.2 4.2',
  ],
  sun: SUN,
  moon: MOON,
  monitor: MONITOR,
  clock: ['C12 12 9', 'M12 7v5l3 2'],
  calendar: ['R3 5 18 16 3', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  filter: ['M4 5h16l-6 7v6l-4 2v-8L4 5z'],
  sort: ['M7 4v16', 'M3 16l4 4 4-4', 'M17 20V4', 'M13 8l4-4 4 4'],
  settings: [
    'C12 12 3',
    'M12 2v3',
    'M12 19v3',
    'M2 12h3',
    'M19 12h3',
    'M4.9 4.9l2.1 2.1',
    'M17 17l2.1 2.1',
    'M4.9 19.1L7 17',
    'M17 7l2.1-2.1',
  ],
  logout: ['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9'],
  chart: ['M4 20V4', 'M4 20h16', 'M8 16v-4', 'M12 16V8', 'M16 16v-6'],
  grid: ['R4 4 7 7 2', 'R13 4 7 7 2', 'R4 13 7 7 2', 'R13 13 7 7 2'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  columns: ['R3 4 18 16 3', 'M9 4v16', 'M15 4v16'],
  link: [
    'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1',
    'M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  ],
  book: ['M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z', 'M4 19a2 2 0 012-2h13'],
  briefcase: ['R3 7 18 13 3', 'M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2', 'M3 13h18'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5'],
  ban: ['C12 12 9', 'M5.6 5.6l12.8 12.8'],
  play: ['M7 4l13 8-13 8V4z'],
  history: ['M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  scale: [
    'M12 3v18',
    'M7 21h10',
    'M5 7h14',
    'M5 7l-3 7a3.5 3.5 0 006 0L5 7z',
    'M19 7l-3 7a3.5 3.5 0 006 0l-3-7z',
  ],
} as const;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** When set, the icon carries meaning and gets role="img". Otherwise it is decorative. */
  label?: string;
  className?: string;
}

export function Icon({ name, ...rest }: IconProps) {
  return <Glyph parts={PATHS[name] ?? PATHS.arrow} {...rest} />;
}
