import type { SVGProps } from 'react';

/**
 * The icon set.
 *
 * One 24×24 stroke grid, 1.6px weight, round caps. Drawn here rather than
 * pulled from a library so the whole set shares a voice — astronomical where
 * the metaphor earns it, plain where it does not. Icons are decorative by
 * default and inherit colour; anything meaningful gets a `label`.
 */

export type IconName = keyof typeof PATHS;

const PATHS = {
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  system: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.6-3.9-9S9.5 5.4 12 3',
  member: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5',
  members: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M3 19c0-3 2.7-4.8 6-4.8s6 1.8 6 4.8M16 11.5a3 3 0 1 0 0-6M17 14.6c2.4.5 4 2.1 4 4.4',
  front: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  bolt: 'M13 3 5 13.5h5.5L11 21l8-10.5h-5.5z',
  profiles: 'M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z',
  organize: 'M4 6h16M4 12h10M4 18h13M17 10l3 2-3 2',
  subsystem: 'M12 4v4M12 8 6 12v4M12 8l6 4v4M4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  journal: 'M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2zM6 17h13M9 7h7M9 11h7',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z',
  bulletin: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3M12 2v2',
  poll: 'M6 19V9M12 19V5M18 19v-7M4 21h16',
  relationship: 'M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M10 8l5 6M5 12a7 7 0 0 0 5.6 6.9',
  headspace: 'M12 3a6 6 0 0 0-6 6c0 2 .8 3 1.6 4 .7.9 1.4 1.7 1.4 3v2h6v-2c0-1.3.7-2.1 1.4-3 .8-1 1.6-2 1.6-4a6 6 0 0 0-6-6M9 21h6',
  history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4.5l3 1.8',
  achievement: 'M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8z',
  flag: 'M6 21V4M6 5h11l-2 3.5L17 12H6',
  life: 'M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10',
  calendar: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4',
  task: 'M5 6h14M5 12h14M5 18h9M3.5 6 4.5 7l2-2M3.5 12l1 1 2-2',
  note: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  contact: 'M5 4h14v16H5zM12 11a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4M8 17c0-2 1.8-3.2 4-3.2s4 1.2 4 3.2',
  emergency: 'M12 3l9 16H3zM12 9v5M12 16.5v.5',
  location: 'M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  sleep: 'M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5M16 4h4l-4 4h4',
  wellbeing: 'M3 12h4l2-5 3 10 2.5-6 1.5 3h5',
  emotion: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9 10v.5M15 10v.5M8.5 14.5a5 5 0 0 0 7 0',
  mood: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.5 14.5a5 5 0 0 0 7 0M9 10h.5M14.5 10h.5',
  body: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4M12 8v7M8 10l4-1 4 1M9.5 21 12 15l2.5 6',
  insight: 'M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3M10 20h4',
  cycle: 'M20 12a8 8 0 1 1-3.1-6.3M20 4v5h-5',
  fitness: 'M5 9v6M19 9v6M8 7v10M16 7v10M8 12h8M3 11v2M21 11v2',
  finance: 'M12 3v18M16 7.5C16 6 14.2 5 12 5S8 6 8 7.5 9.8 10 12 10.5s4 1.5 4 3-1.8 2.5-4 2.5-4-1-4-2.5',
  work: 'M4 8h16v12H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16',
  social: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 9h17M3.5 15h17M12 3c2 2.6 3 5.7 3 9s-1 6.4-3 9c-2-2.6-3-5.7-3-9s1-6.4 3-9',
  constellation: 'M5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M18.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M11 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M18 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M6.2 6.6l4 5M17.4 8.1l-5.2 3.7M10.3 13.8 7.7 17M12.2 13.2 17 17.4',
  friend: 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M4 20c0-3.1 2.8-5 6-5s6 1.9 6 5M18 8v6M21 11h-6',
  flux: 'M4 12a8 8 0 0 1 8-8M20 12a8 8 0 0 1-8 8M12 4l3 3-3 3M12 20l-3-3 3-3M7 12h10',
  message: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H6a2 2 0 0 1-2-2z',
  create: 'M12 5v14M5 12h14',
  media: 'M4 5h16v14H4zM4 15l4-4 3 3 4-5 5 6',
  music: 'M9 18V6l11-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  video: 'M3 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM15 10l6-3v10l-6-3z',
  character: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M5 20c0-3.3 3.1-5.2 7-5.2s7 1.9 7 5.2M17 4l.8 1.7 1.7.8-1.7.8L17 9l-.8-1.7-1.7-.8 1.7-.8z',
  story: 'M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z',
  fic: 'M5 4h10l4 4v12H5zM15 4v4h4M8 13h8M8 17h5',
  resource: 'M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.3 6M14 11a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3',
  dictionary: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 8h7M8 12h5',
  template: 'M4 4h16v5H4zM4 12h7v8H4zM14 12h6v8h-6z',
  notification: 'M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9M10 18.5a2 2 0 0 0 4 0',
  vault: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1M12 14a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M12 14v2.5',
  backup: 'M12 3v11M8 10.5l4 3.5 4-3.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  import: 'M12 14V3M8 6.5 12 3l4 3.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 14a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.5 1v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1-2.5h-.2a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1-2.6l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 2.5-1v-.2a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 2.6 1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1 2.5h.2a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.3.9',
  features: 'M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 17l.9-5L4.8 8.3l5-.7z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .9-1 1.6v.4M12 17v.5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M16.2 16.2 21 21',
  summary: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  more: 'M6 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M18 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  group: 'M4 6h7v5H4zM13 6h7v5h-7zM8.5 13h7v6h-7z',
  tag: 'M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8z M7.5 8a.6.6 0 1 0 0-1.2A.6.6 0 0 0 7.5 8',
  folder: 'M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  device: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M10.5 18h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5 9.5 17 19 7',
  close: 'M6 6l12 12M18 6 6 18',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronUp: 'M5 15l7-7 7 7',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z',
  duplicate: 'M9 9h11v11H9zM6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1',
  trash: 'M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M11 11v5M14 11v5',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  sort: 'M7 4v14M4 15l3 3 3-3M17 20V6M14 9l3-3 3 3',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  star: 'M12 4l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 18l.9-5L4.8 9.3l5-.7z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  eyeOff: 'M4 4l16 16M9.9 5.8A8.6 8.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.2 8.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5zM12 15v2',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v9H5zM12 15v2',
  download: 'M12 4v10M8 10.5l4 3.5 4-3.5M5 19h14',
  upload: 'M12 14V4M8 7.5 12 4l4 3.5M5 19h14',
  play: 'M7 4.5 19 12 7 19.5z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  skipNext: 'M6 5l9 7-9 7zM17 5v14',
  skipPrev: 'M18 5l-9 7 9 7zM7 5v14',
  shuffle: 'M4 7h3l10 10h3M17 4l3 3-3 3M4 17h3l3-3M14 10l3-3h3M17 14l3 3-3 3',
  repeat: 'M4 9a3 3 0 0 1 3-3h10l-3-3M20 15a3 3 0 0 1-3 3H7l3 3',
  link: 'M9 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7M15 11a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7',
  send: 'M4 12 20 5l-5 15-3.5-6z M11.5 14 20 5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5.2l3.4 2',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 7.5v.5',
  warning: 'M12 3 2.5 20h19zM12 10v4M12 16.5v.5',
  sparkle: 'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H10',
} as const;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Supply when the icon is the only thing conveying meaning. */
  label?: string;
}

export function Icon({ name, size = 20, label, ...props }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function hasIcon(name: string): name is IconName {
  return name in PATHS;
}

/** Falls back to a neutral glyph rather than rendering nothing. */
export function iconOr(name: string, fallback: IconName = 'note'): IconName {
  return hasIcon(name) ? name : fallback;
}
