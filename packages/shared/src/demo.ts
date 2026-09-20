import { newId } from './ids.js';
import { EMOTIONS } from './emotions.js';
import type { StoredRecord, Visibility } from './types.js';

/**
 * The demo system.
 *
 * Guest mode needs data that looks like a real account being used, not three
 * rows of "Example 1". Everything here is generated from a fixed seed, so the
 * same demo period always produces the same {{system}} — which is also what lets
 * guest data survive an app update instead of being regenerated differently and
 * looking wiped.
 */

export type DemoPeriod = 7 | 30 | 60 | 90;

export const DEMO_PERIODS: readonly { days: DemoPeriod; label: string; description: string }[] = [
  { days: 7, label: 'One week', description: 'A light week of activity.' },
  { days: 30, label: 'One month', description: 'Enough history for trends to appear.' },
  { days: 60, label: 'Two months', description: 'Fuller statistics and streaks.' },
  { days: 90, label: 'Three months', description: 'Everything, including long-run patterns.' },
];

/** Deterministic PRNG (mulberry32) — same seed, same demo system, every time. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ctx {
  rand: () => number;
  userId: string;
  systemId: string;
  now: Date;
  days: number;
}

function pick<T>(ctx: Ctx, items: readonly T[]): T {
  return items[Math.floor(ctx.rand() * items.length)] ?? items[0]!;
}

function chance(ctx: Ctx, probability: number): boolean {
  return ctx.rand() < probability;
}

function daysAgo(ctx: Ctx, days: number, hour = 9, minute = 0): string {
  const date = new Date(ctx.now);
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function base(ctx: Ctx, overrides: Partial<StoredRecord> & { id?: string }, prefix: string): StoredRecord {
  const createdAt = overrides['createdAt'] ?? daysAgo(ctx, ctx.days);
  return {
    id: overrides.id ?? newId(prefix),
    userId: ctx.userId,
    systemId: ctx.systemId,
    memberId: null,
    visibility: 'system' as Visibility,
    createdAt: createdAt as string,
    updatedAt: (overrides['updatedAt'] as string) ?? (createdAt as string),
    deletedAt: null,
    version: 1,
    ...overrides,
  } as StoredRecord;
}

const MEMBER_SEEDS = [
  {
    name: 'Vega',
    pronouns: 'she/her',
    color: '#7aa2f7',
    icon: '✦',
    roles: ['host', 'organiser'],
    bio: 'Handles most of the day-to-day. Keeps the calendar honest and the plants alive.',
    interests: ['astronomy', 'baking', 'long walks'],
    frontWeight: 0.34,
  },
  {
    name: 'Corvid',
    pronouns: 'they/them',
    color: '#a78bfa',
    icon: '◈',
    roles: ['protector'],
    bio: 'Shows up when things get sharp. Blunt, not unkind. Likes rain and loud music.',
    interests: ['bass guitar', 'boxing', 'true crime podcasts'],
    frontWeight: 0.18,
  },
  {
    name: 'Juniper',
    pronouns: 'she/they',
    color: '#5ec6a8',
    icon: '❀',
    roles: ['caretaker'],
    bio: 'Keeps everyone fed and watered. Terrible at receiving the same care back.',
    interests: ['gardening', 'soup', 'knitting'],
    frontWeight: 0.16,
  },
  {
    name: 'Ash',
    pronouns: 'he/him',
    color: '#f0a85a',
    icon: '▲',
    roles: ['worker'],
    bio: 'Does the parts of the job nobody else wants to. Fronts on weekdays, mostly.',
    interests: ['woodworking', 'strategy games'],
    frontWeight: 0.14,
  },
  {
    name: 'Wren',
    pronouns: 'she/her',
    color: '#ec7392',
    icon: '♪',
    roles: ['little'],
    bio: 'Seven, and firm about it. Draws constantly. Has strong opinions about dinosaurs.',
    interests: ['drawing', 'dinosaurs', 'cartoons'],
    frontWeight: 0.08,
  },
  {
    name: 'Orrin',
    pronouns: 'he/they',
    color: '#8bd5ff',
    icon: '◐',
    roles: ['archivist'],
    bio: 'Remembers what the rest of us do not. Keeps the {{journal}} and the records.',
    interests: ['history', 'maps', 'old films'],
    frontWeight: 0.07,
  },
  {
    name: 'Sable',
    pronouns: 'it/its',
    color: '#c0c8e0',
    icon: '◌',
    roles: ['observer'],
    bio: 'Rarely fronts, always watching. Prefers it that way.',
    interests: ['stargazing', 'silence'],
    frontWeight: 0.03,
  },
];

const ACTIVITIES = [
  'work', 'errands', 'cooking', 'resting', 'gaming', 'walking', 'appointment',
  'cleaning', 'reading', 'drawing', 'phone call', 'commute', 'groceries',
];

const JOURNAL_SEEDS = [
  ['Steady day', 'Nothing dramatic. Got through the list, ate properly, went to bed on time. Writing it down because the ordinary days are the ones I forget.'],
  ['Rough morning, better evening', 'Woke up foggy and it took until about two to feel like anyone in particular. Juniper took over for a bit and made soup, which helped more than it should have.'],
  ['Switch mid-conversation', 'Was talking to the neighbour and went distant halfway through. Corvid picked it up. They said it was fine. I am mostly annoyed I missed the end of the story.'],
  ['Good session', 'Talked about the fronting log in therapy. Showing the actual data instead of trying to remember was easier than I expected.'],
  ['Wren fronted after school pickup', 'Drew four dinosaurs and named all of them. Taping them to the fridge.'],
  ['Long stretch out', 'Six days mostly me. Tired in a way that sleep does not fix. Asked Ash to take the work days next week.'],
  ['Quiet co-front', 'Orrin and I were both around for most of the afternoon. Easy. We do not do that often enough.'],
  ['Argument about the calendar', 'Resolved it with a poll, of all things. Turns out four of us wanted the same thing and nobody had said so.'],
  ['Not much to report', 'Flat. Not bad flat, just flat. Logged it anyway.'],
  ['Better week than last', 'Sleeping more, fronting is less jumpy. Keeping the same routine another week to see if it holds.'],
];

const NOTE_SEEDS = [
  ['Grocery list', 'oats, oat milk, tinned tomatoes, garlic, washing up liquid, birthday card for mum'],
  ['Things Wren is allowed to decide', 'Dinner on Fridays. What we watch on Sunday. Which pens are hers (all the purple ones).'],
  ['Therapy questions', 'Ask about the gap between Tuesday afternoon and Wednesday morning. Ask whether logging this much is helping or just keeping me busy.'],
  ['House rules we actually agreed on', 'No big decisions after 10pm. Tell someone before switching if there is time. Ash does not have to do the phone calls.'],
  ['Books to find', 'The one about the cartographer. Anything by the author Orrin keeps mentioning. A dinosaur encyclopaedia that is not for toddlers.'],
];

const TASK_SEEDS = [
  ['Refill the prescription', 'health', 'high'],
  ['Email the landlord about the radiator', 'home', 'normal'],
  ['Book the dentist', 'health', 'normal'],
  ['Pay the electricity bill', 'money', 'urgent'],
  ['Water the plants', 'home', 'low'],
  ['Finish the report draft', 'work', 'high'],
  ['Call Nana back', 'people', 'normal'],
  ['Return the library books', 'errands', 'low'],
  ['Sort the laundry pile', 'home', 'low'],
  ['Back up the photos', 'admin', 'normal'],
];

const EVENT_SEEDS = [
  ['Therapy', 'health', 60],
  ['Work shift', 'work', 480],
  ['Coffee with Ren', 'social', 90],
  ['Dentist', 'health', 45],
  ['Grocery run', 'personal', 60],
  ['Wren’s art club', 'personal', 120],
  ['Video call with Mum', 'social', 45],
];

const MOODS = [
  ['Steady', 6, '#5ec6a8'], ['Tired', 4, '#8a93a8'], ['Bright', 8, '#f2c45a'],
  ['Flat', 4, '#5f86c4'], ['Anxious', 3, '#9a86d8'], ['Content', 7, '#63c9b4'],
  ['Wired', 6, '#f0855a'], ['Low', 3, '#5f86c4'], ['Hopeful', 7, '#7aa2f7'],
] as const;

/**
 * Builds the whole demo account as collection → rows, in the same shape a backup
 * uses. That means guest mode, "add example data" and restore all take the same
 * path into the database.
 */
export function buildDemoData(options: {
  userId: string;
  systemId: string;
  days?: DemoPeriod;
  seed?: number;
  now?: Date;
}): Record<string, StoredRecord[]> {
  const ctx: Ctx = {
    rand: makeRandom(options.seed ?? 20240137),
    userId: options.userId,
    systemId: options.systemId,
    now: options.now ?? new Date(),
    days: options.days ?? 30,
  };

  const out: Record<string, StoredRecord[]> = {};
  const push = (collection: string, row: StoredRecord): StoredRecord => {
    (out[collection] ??= []).push(row);
    return row;
  };

  // — Subsystems and groups ————————————————————————————————
  const dayside = push('subsystems', base(ctx, {
    id: newId('sub'),
    name: 'Dayside',
    description: 'Whoever tends to be out during working hours.',
    color: '#7aa2f7',
    icon: '☀',
    parentId: null,
    sortOrder: 0,
    tags: [],
  }, 'sub'));
  const quiet = push('subsystems', base(ctx, {
    id: newId('sub'),
    name: 'The Quiet Wing',
    description: 'Rarely front, and that is the arrangement.',
    color: '#a78bfa',
    icon: '☾',
    parentId: null,
    sortOrder: 1,
    tags: [],
  }, 'sub'));
  const littles = push('subsystems', base(ctx, {
    id: newId('sub'),
    name: 'Littles',
    description: 'Inside the Quiet Wing.',
    color: '#ec7392',
    icon: '✿',
    parentId: quiet['id'] as string,
    sortOrder: 0,
    tags: [],
  }, 'sub'));

  const everyday = push('memberGroups', base(ctx, {
    id: newId('grp'),
    name: 'Everyday',
    description: 'People who front most weeks.',
    color: '#5ec6a8',
    icon: '◉',
    subsystemId: dayside['id'] as string,
    sortOrder: 0,
  }, 'grp'));

  // — Members ——————————————————————————————————————————————
  const members = MEMBER_SEEDS.map((seed, index) => {
    const subsystemId =
      seed.name === 'Wren' ? littles['id'] : seed.name === 'Sable' ? quiet['id'] : dayside['id'];
    return push('members', base(ctx, {
      id: newId('mem'),
      name: seed.name,
      pronouns: seed.pronouns,
      color: seed.color,
      icon: seed.icon,
      bio: seed.bio,
      roles: [...seed.roles],
      interests: [...seed.interests],
      subsystemId,
      groupId: index < 4 ? (everyday['id'] as string) : null,
      frontStatus: index === 0 ? 'fronting' : index < 4 ? 'nearby' : 'resting',
      orbitOrder: index,
      frontCount: 0,
      frontMinutes: 0,
      tags: [...seed.roles],
      customFields: index === 0 ? { 'Favourite constellation': 'Lyra' } : null,
      privacy: { showOnProfile: index !== 6, showFronting: index !== 6, showJournal: false },
      visibility: 'system',
      createdAt: daysAgo(ctx, ctx.days, 10 + index),
    }, 'mem'));
  });

  const weights = MEMBER_SEEDS.map((m) => m.frontWeight);
  const weightedMember = (): StoredRecord => {
    const roll = ctx.rand();
    let acc = 0;
    for (let i = 0; i < members.length; i += 1) {
      acc += weights[i] ?? 0;
      if (roll <= acc) return members[i]!;
    }
    return members[0]!;
  };

  // — Fronting history —————————————————————————————————————
  const frontMinutes = new Map<string, number>();
  const frontCounts = new Map<string, number>();
  for (let day = ctx.days; day >= 0; day -= 1) {
    const switches = 1 + Math.floor(ctx.rand() * 3);
    let hour = 7 + Math.floor(ctx.rand() * 2);
    for (let s = 0; s < switches && hour < 23; s += 1) {
      const member = weightedMember();
      const length = 2 + Math.floor(ctx.rand() * 6);
      const endHour = Math.min(23, hour + length);
      const isActive = day === 0 && s === switches - 1;
      const coFronters = chance(ctx, 0.22)
        ? [pick(ctx, members.filter((m) => m['id'] !== member['id']))['id'] as string]
        : [];
      const startedAt = daysAgo(ctx, day, hour, Math.floor(ctx.rand() * 60));
      const endedAt = isActive ? null : daysAgo(ctx, day, endHour, Math.floor(ctx.rand() * 60));
      const duration = isActive
        ? null
        : Math.max(30, Math.round((new Date(endedAt!).getTime() - new Date(startedAt).getTime()) / 60000));

      push('frontEvents', base(ctx, {
        id: newId('fev'),
        memberId: member['id'] as string,
        coFronterIds: coFronters,
        startedAt,
        endedAt,
        durationMinutes: duration,
        activity: pick(ctx, ACTIVITIES),
        mood: pick(ctx, MOODS)[0],
        note: chance(ctx, 0.18) ? 'Handover was smooth.' : '',
        location: chance(ctx, 0.3) ? pick(ctx, ['home', 'work', 'out', 'the park']) : '',
        tags: [],
        statusType: coFronters.length ? 'cofronting' : 'fronting',
        unknownFronter: 0,
        createdAt: startedAt,
        updatedAt: endedAt ?? startedAt,
      }, 'fev'));

      if (duration) {
        const id = member['id'] as string;
        frontMinutes.set(id, (frontMinutes.get(id) ?? 0) + duration);
        frontCounts.set(id, (frontCounts.get(id) ?? 0) + 1);
        for (const co of coFronters) {
          frontMinutes.set(co, (frontMinutes.get(co) ?? 0) + duration);
        }
      }
      hour = endHour + 1;
    }
  }

  for (const member of members) {
    const id = member['id'] as string;
    member['frontMinutes'] = frontMinutes.get(id) ?? 0;
    member['frontCount'] = frontCounts.get(id) ?? 0;
    const events = (out['frontEvents'] ?? []).filter((e) => e['memberId'] === id);
    member['lastFrontedAt'] = events.length ? (events[events.length - 1]!['startedAt'] as string) : null;
  }

  // — Journal, notes, moods, emotions ——————————————————————
  const journalCount = Math.max(4, Math.round(ctx.days * 0.45));
  for (let i = 0; i < journalCount; i += 1) {
    const seed = JOURNAL_SEEDS[i % JOURNAL_SEEDS.length]!;
    const day = Math.floor((i / journalCount) * ctx.days);
    push('journalEntries', base(ctx, {
      id: newId('jrn'),
      memberId: chance(ctx, 0.75) ? (weightedMember()['id'] as string) : null,
      title: seed[0],
      body: seed[1],
      entryDate: daysAgo(ctx, ctx.days - day, 20, 30),
      mood: pick(ctx, MOODS)[0],
      moodScore: pick(ctx, MOODS)[1],
      tags: chance(ctx, 0.4) ? ['daily'] : [],
      attachmentIds: [],
      pinned: i === 0 ? 1 : 0,
      inVault: 0,
      visibility: chance(ctx, 0.2) ? 'private' : 'system',
      createdAt: daysAgo(ctx, ctx.days - day, 20, 30),
    }, 'jrn'));
  }

  NOTE_SEEDS.forEach(([title, body], i) => {
    push('notes', base(ctx, {
      id: newId('not'),
      title,
      body,
      memberId: chance(ctx, 0.5) ? (weightedMember()['id'] as string) : null,
      folderId: null,
      tags: [],
      checklist: i === 0 ? [{ id: '1', label: 'oats', done: true }, { id: '2', label: 'garlic', done: false }] : null,
      attachmentIds: [],
      pinned: i < 2 ? 1 : 0,
      archived: 0,
      createdAt: daysAgo(ctx, Math.floor(ctx.rand() * ctx.days), 14),
    }, 'not'));
  });

  for (let day = ctx.days; day >= 0; day -= 1) {
    if (!chance(ctx, 0.8)) continue;
    const mood = pick(ctx, MOODS);
    push('moodEntries', base(ctx, {
      id: newId('mod'),
      memberId: weightedMember()['id'] as string,
      label: mood[0],
      score: mood[1],
      color: mood[2],
      recordedAt: daysAgo(ctx, day, 12 + Math.floor(ctx.rand() * 8)),
      note: '',
      tags: [],
      createdAt: daysAgo(ctx, day, 12),
    }, 'mod'));

    const emotionCount = 1 + Math.floor(ctx.rand() * 3);
    for (let e = 0; e < emotionCount; e += 1) {
      const emotion = pick(ctx, EMOTIONS);
      push('emotionEntries', base(ctx, {
        id: newId('emo'),
        memberId: weightedMember()['id'] as string,
        emotionId: emotion.id,
        category: emotion.family,
        intensity: 1 + Math.floor(ctx.rand() * 5),
        recordedAt: daysAgo(ctx, day, 8 + Math.floor(ctx.rand() * 12), Math.floor(ctx.rand() * 60)),
        context: chance(ctx, 0.5) ? pick(ctx, ['at work', 'after a call', 'before bed', 'out of nowhere']) : '',
        activity: chance(ctx, 0.3) ? pick(ctx, ACTIVITIES) : '',
        note: '',
        tags: [],
        createdAt: daysAgo(ctx, day, 8),
      }, 'emo'));
    }

    if (chance(ctx, 0.85)) {
      const bed = 22 + Math.floor(ctx.rand() * 2);
      const duration = 300 + Math.floor(ctx.rand() * 240);
      push('sleepEntries', base(ctx, {
        id: newId('slp'),
        memberId: null,
        startedAt: daysAgo(ctx, day + 1, bed, Math.floor(ctx.rand() * 60)),
        endedAt: daysAgo(ctx, day, Math.floor(bed + duration / 60) % 24 || 7, 0),
        durationMinutes: duration,
        quality: 1 + Math.floor(ctx.rand() * 5),
        isNap: 0,
        awakenings: Math.floor(ctx.rand() * 3),
        mood: pick(ctx, MOODS)[0],
        dreamNotes: chance(ctx, 0.25) ? 'Something about a station with no trains.' : '',
        note: '',
        tags: [],
        createdAt: daysAgo(ctx, day, 8),
      }, 'slp'));
    }

    if (chance(ctx, 0.55)) {
      push('wellnessEntries', base(ctx, {
        id: newId('wel'),
        memberId: weightedMember()['id'] as string,
        recordedAt: daysAgo(ctx, day, 21),
        energy: 2 + Math.floor(ctx.rand() * 8),
        stress: 1 + Math.floor(ctx.rand() * 8),
        comfort: 3 + Math.floor(ctx.rand() * 7),
        hydrationGlasses: 2 + Math.floor(ctx.rand() * 7),
        mealCount: 1 + Math.floor(ctx.rand() * 3),
        painLevel: Math.floor(ctx.rand() * 5),
        socialBattery: 1 + Math.floor(ctx.rand() * 9),
        medicationTaken: chance(ctx, 0.8) ? 1 : 0,
        note: '',
        customMetrics: null,
        tags: [],
        createdAt: daysAgo(ctx, day, 21),
      }, 'wel'));
    }
  }

  // — Tasks, calendar ——————————————————————————————————————
  TASK_SEEDS.forEach(([title, category, priority], i) => {
    const done = i < 4;
    const dueOffset = i - 3;
    push('tasks', base(ctx, {
      id: newId('tsk'),
      title,
      category,
      priority,
      notes: '',
      memberId: chance(ctx, 0.6) ? (weightedMember()['id'] as string) : null,
      dueAt: daysAgo(ctx, -dueOffset, 17),
      completed: done ? 1 : 0,
      completedAt: done ? daysAgo(ctx, i, 15) : null,
      subtasks: i === 5 ? [{ id: 'a', label: 'Outline', done: true }, { id: 'b', label: 'Draft', done: false }] : null,
      recurrence: i === 4 ? 'weekly' : '',
      remindAt: null,
      remindSent: 0,
      tags: [],
      archived: 0,
      forWholeSystem: chance(ctx, 0.5) ? 1 : 0,
      createdAt: daysAgo(ctx, Math.min(ctx.days, i + 2), 9),
    }, 'tsk'));
  });

  for (let i = 0; i < Math.min(18, Math.round(ctx.days * 0.5)); i += 1) {
    const [title, kind, minutes] = EVENT_SEEDS[i % EVENT_SEEDS.length]!;
    const offset = Math.floor(ctx.rand() * ctx.days) - Math.floor(ctx.days / 3);
    const startsAt = daysAgo(ctx, offset, 9 + Math.floor(ctx.rand() * 9));
    push('calendarEvents', base(ctx, {
      id: newId('evt'),
      title,
      kind,
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + (minutes as number) * 60000).toISOString(),
      allDay: 0,
      location: chance(ctx, 0.5) ? pick(ctx, ['the clinic', 'the office', 'town', 'home']) : '',
      memberIds: chance(ctx, 0.5) ? [weightedMember()['id'] as string] : [],
      notes: '',
      color: '',
      recurrence: '',
      remindAt: null,
      remindSent: 0,
      attachmentIds: [],
      memberId: null,
      createdAt: daysAgo(ctx, Math.max(0, offset), 9),
    }, 'evt'));
  }

  // — Relationships, flags, dictionary —————————————————————
  const relationshipSeeds = [
    [0, 1, 'looks out for me', 'looks out for'],
    [1, 4, 'protective of', 'protected by'],
    [2, 4, 'looks after', 'looked after by'],
    [0, 5, 'works closely with', 'works closely with'],
    [3, 0, 'covers work days for', 'has work days covered by'],
  ] as const;
  for (const [fromIdx, toIdx, label, reverse] of relationshipSeeds) {
    push('relationships', base(ctx, {
      id: newId('rel'),
      fromType: 'member',
      fromId: members[fromIdx]!['id'] as string,
      toType: 'member',
      toId: members[toIdx]!['id'] as string,
      label,
      reverseLabel: reverse,
      strength: pick(ctx, ['close', 'neutral', 'inseparable']),
      color: '',
      notes: '',
      mutual: 1,
      showOnMap: 1,
    }, 'rel'));
  }

  const flagSeeds = [
    ['Needs warning first', 'boundary', '#f0a85a', '!'],
    ['Do not front at work', 'fronting', '#ec7392', '✕'],
    ['Text, do not call', 'communication', '#8bd5ff', '✉'],
    ['Sensory: no loud places', 'accessibility', '#5ec6a8', '◍'],
  ] as const;
  for (const [name, category, color, icon] of flagSeeds) {
    push('flags', base(ctx, {
      id: newId('flg'),
      name,
      category,
      color,
      icon,
      description: '',
      showOnProfile: 1,
    }, 'flg'));
  }

  const dictSeeds = [
    ['Co-fronting', 'More than one person present at the front at the same time.', 'plurality'],
    ['Switch', 'A change in who is fronting.', 'plurality'],
    ['Headspace', 'The internal space the system experiences.', 'plurality'],
    ['Going distant', 'Our word for the fuzzy stretch before a switch.', 'ours'],
    ['The quiet wing', 'Where the people who rarely front tend to be.', 'ours'],
  ] as const;
  for (const [term, definition, category] of dictSeeds) {
    push('dictionaryTerms', base(ctx, {
      id: newId('dic'),
      term,
      definition,
      category,
      example: '',
      synonyms: [],
      favorite: 0,
      systemSpecific: category === 'ours' ? 1 : 0,
    }, 'dic'));
  }

  // — Headspace ————————————————————————————————————————————
  const map = push('headspaceMaps', base(ctx, {
    id: newId('hsm'),
    name: 'The House',
    description: 'How the inner world is laid out, roughly.',
    viewport: { x: 0, y: 0, zoom: 1 },
    layers: [{ id: 'base', label: 'Rooms', visible: true }, { id: 'markers', label: 'People', visible: true }],
    background: '#0a1330',
    sortOrder: 0,
    isDefault: 1,
  }, 'hsm'));

  const rooms = [
    ['Front room', 160, 120, 260, 180, '#7aa2f7'],
    ['Kitchen', 460, 120, 200, 160, '#5ec6a8'],
    ['The garden', 160, 340, 320, 200, '#63c9b4'],
    ['Quiet wing', 540, 340, 240, 200, '#a78bfa'],
    ['Wren’s room', 820, 200, 180, 160, '#ec7392'],
  ] as const;
  rooms.forEach(([label, x, y, width, height, color], i) => {
    push('headspaceObjects', base(ctx, {
      id: newId('hso'),
      mapId: map['id'] as string,
      kind: 'room',
      label,
      description: '',
      x, y, width, height,
      rotation: 0,
      z: i,
      layer: 'base',
      color,
      icon: '',
      imageUrl: '',
      shape: 'rounded',
      connectsToId: '',
      meta: null,
      memberId: null,
    }, 'hso'));
  });
  members.slice(0, 5).forEach((member, i) => {
    const room = rooms[i % rooms.length]!;
    push('headspaceObjects', base(ctx, {
      id: newId('hso'),
      mapId: map['id'] as string,
      kind: 'member',
      label: member['name'] as string,
      description: '',
      x: room[1] + 40 + i * 12,
      y: room[2] + 50,
      width: 56,
      height: 56,
      rotation: 0,
      z: 10 + i,
      layer: 'markers',
      color: member['color'] as string,
      icon: member['icon'] as string,
      imageUrl: '',
      shape: 'circle',
      connectsToId: '',
      meta: null,
      memberId: member['id'] as string,
    }, 'hso'));
  });

  // — Internal social ——————————————————————————————————————
  const chatLines = [
    ['Kitchen light is out again.', 3],
    ['I will grab a bulb on the way back.', 3],
    ['Who has the appointment on Thursday?', 1],
    ['Me. I already put it on the calendar.', 0],
    ['Can someone do the phone call bit? I cannot today.', 3],
    ['I will do it.', 1],
    ['thank you 🙏', 3],
    ['Wren wants pasta again.', 2],
    ['Pasta is fine.', 0],
  ] as const;
  chatLines.forEach(([body, memberIdx], i) => {
    const at = daysAgo(ctx, Math.max(0, 2 - Math.floor(i / 4)), 18, i * 6);
    push('systemChatMessages', base(ctx, {
      id: newId('scm'),
      memberId: members[memberIdx]!['id'] as string,
      body,
      sentAt: at,
      replyToId: null,
      channel: 'general',
      reactions: null,
      attachmentIds: [],
      edited: 0,
      createdAt: at,
    }, 'scm'));
  });

  push('bulletinPosts', base(ctx, {
    id: newId('bul'),
    memberId: members[0]!['id'] as string,
    title: 'House rules, updated',
    body: 'No big decisions after 10pm. Tell someone before switching if there is time. Ash does not have to do the phone calls. Agreed by poll on the 4th.',
    postedAt: daysAgo(ctx, Math.min(6, ctx.days), 19),
    kind: 'announcement',
    attachmentIds: [],
    tags: ['rules'],
    pinned: 1,
    archived: 0,
    reactions: null,
  }, 'bul'));

  const poll = push('polls', base(ctx, {
    id: newId('pol'),
    memberId: members[0]!['id'] as string,
    title: 'Who takes the weekday mornings next month?',
    description: 'Not binding, just want to know where everyone is at.',
    options: [
      { id: 'o1', label: 'Keep it as it is (Vega)' },
      { id: 'o2', label: 'Ash takes Mon–Wed' },
      { id: 'o3', label: 'Rotate weekly' },
    ],
    anonymous: 0,
    multipleChoice: 0,
    closesAt: daysAgo(ctx, -4, 20),
    closed: 0,
  }, 'pol'));
  members.slice(0, 4).forEach((member, i) => {
    push('pollVotes', base(ctx, {
      id: newId('pvt'),
      memberId: member['id'] as string,
      pollId: poll['id'] as string,
      optionIds: [i < 2 ? 'o3' : 'o2'],
      comment: '',
    }, 'pvt'));
  });

  // — Creative and life extras —————————————————————————————
  const story = push('stories', base(ctx, {
    id: newId('sty'),
    memberId: members[5]!['id'] as string,
    title: 'The Cartographer’s Apprentice',
    summary: 'A mapmaker who can only draw places she has never been.',
    genre: 'fantasy',
    status: 'drafting',
    coverUrl: '',
    tags: ['wip'],
    wordGoal: 60000,
    worldbuilding: 'Maps are legally binding. Redrawing a border changes it.',
    timeline: null,
    color: '#a78bfa',
  }, 'sty'));
  push('storyChapters', base(ctx, {
    id: newId('chp'),
    storyId: story['id'] as string,
    title: 'The commission',
    body: 'The letter arrived without a seal, which was the first thing wrong with it.',
    summary: 'Mira takes a job she should refuse.',
    sortOrder: 0,
    wordCount: 1840,
    status: 'draft',
    memberId: null,
  }, 'chp'));
  push('characters', base(ctx, {
    id: newId('chr'),
    memberId: members[5]!['id'] as string,
    name: 'Mira Vell',
    imageUrl: '',
    biography: 'Apprentice cartographer. Draws the unvisited accurately and the familiar badly.',
    traits: ['stubborn', 'precise', 'homesick'],
    source: 'The Cartographer’s Apprentice',
    pronouns: 'she/her',
    role: 'protagonist',
    tags: [],
    storyIds: [story['id'] as string],
    notes: '',
    customFields: null,
    color: '#8bd5ff',
  }, 'chr'));

  push('fics', base(ctx, {
    id: newId('fic'),
    memberId: members[4]!['id'] as string,
    title: 'Long Way Round',
    author: 'quietcartographer',
    url: 'https://example.org/works/1',
    platform: 'AO3',
    status: 'reading',
    publicationStatus: 'in progress',
    chaptersRead: 12,
    chaptersTotal: 20,
    wordCount: 84000,
    lastReadAt: daysAgo(ctx, 2, 23),
    rating: 5,
    tags: ['slow burn'],
    fandom: 'original work',
    characters: [],
    notes: 'Update Thursdays.',
    favorite: 1,
    importSource: '',
  }, 'fic'));

  const playlist = push('musicPlaylists', base(ctx, {
    id: newId('mpl'),
    memberId: null,
    name: 'Handover songs',
    description: 'What we put on when someone is coming to the front.',
    coverUrl: '',
    color: '#7aa2f7',
    isSystemPlaylist: 1,
    trackCount: 3,
  }, 'mpl'));
  [
    ['Slow Weather', 'Hollow Coast'],
    ['Signal Drift', 'Pale Orbit'],
    ['Nightshift', 'Corvid Hours'],
  ].forEach(([title, artist], i) => {
    push('musicTracks', base(ctx, {
      id: newId('mtr'),
      playlistId: playlist['id'] as string,
      memberId: null,
      title,
      artist,
      album: '',
      artworkUrl: '',
      previewUrl: '',
      externalUrl: '',
      provider: 'local',
      providerTrackId: '',
      durationSeconds: 180 + i * 20,
      favorite: i === 0 ? 1 : 0,
      sortOrder: i,
      lastPlayedAt: null,
      playCount: 0,
    }, 'mtr'));
  });

  push('contacts', base(ctx, {
    id: newId('con'),
    name: 'Ren Adeyemi',
    nickname: 'Ren',
    relationship: 'friend',
    phone: '',
    email: '',
    socialLinks: null,
    safety: 'safe',
    currentlyWith: 0,
    lastInteractionAt: daysAgo(ctx, 3, 16),
    knownByMemberIds: [members[0]!['id'] as string, members[1]!['id'] as string],
    notes: 'Knows about the system. Fine with whoever is out.',
    tags: ['safe people'],
    avatarUrl: '',
    memberId: null,
  }, 'con'));
  push('emergencyContacts', base(ctx, {
    id: newId('ecn'),
    name: 'Dr. Halloway',
    relationship: 'therapist',
    phone: '',
    email: '',
    priority: 1,
    availability: 'Weekdays, 9–5',
    notes: '',
    memberId: null,
    visibility: 'private',
  }, 'ecn'));

  push('financeAccounts', base(ctx, {
    id: newId('fac'),
    name: 'Everyday',
    kind: 'checking',
    openingBalance: 1240,
    currency: 'USD',
    color: '#5ec6a8',
    notes: '',
    archived: 0,
    memberId: null,
    visibility: 'private',
  }, 'fac'));

  push('templates', base(ctx, {
    id: newId('tpl'),
    name: 'Daily check-in',
    targetCollection: 'journalEntries',
    description: 'The three questions we answer most evenings.',
    payload: {
      title: 'Check-in',
      body: 'Who was out today?\n\nWhat went well?\n\nWhat needs carrying over?',
      tags: ['daily'],
    },
    icon: '✎',
    color: '#7aa2f7',
    useCount: 0,
    memberId: null,
  }, 'tpl'));

  // — System history ———————————————————————————————————————
  const historySeeds: [string, string, number][] = [
    ['system.created', 'System created', ctx.days],
    ['member.created', `${members[0]!['name']} added`, ctx.days],
    ['member.created', `${members[1]!['name']} added`, ctx.days - 1],
    ['subsystem.created', 'Subsystem "Dayside" created', Math.max(1, ctx.days - 3)],
    ['poll.created', 'Poll opened about weekday mornings', Math.min(5, ctx.days)],
    ['settings.updated', 'Terminology updated', Math.min(4, ctx.days)],
  ];
  for (const [eventType, summary, day] of historySeeds) {
    push('systemHistory', base(ctx, {
      id: newId('hst'),
      eventType,
      summary,
      entityType: '',
      entityId: '',
      occurredAt: daysAgo(ctx, day, 12),
      note: '',
      meta: null,
      automatic: 1,
      memberId: null,
      createdAt: daysAgo(ctx, day, 12),
    }, 'hst'));
  }

  return out;
}

/** Row counts for the demo preview, without building the whole thing twice. */
export function demoSummary(data: Record<string, StoredRecord[]>): { collection: string; count: number }[] {
  return Object.entries(data)
    .map(([collection, rows]) => ({ collection, count: rows.length }))
    .sort((a, b) => b.count - a.count);
}
