import { newId } from './ids.js';
import { DEFAULT_APPEARANCE, DEFAULT_GRADIENT, type AppearanceState } from './appearance.js';
import type { StoredRecord, Visibility } from './types.js';

/**
 * Guest Mode, the rest of the app.
 *
 * `demo.ts` seeds the core system. This fills in every other area so a guest
 * can open any screen and find realistic, clearly fictional content: School
 * Life, Flux, Finances, Work, Locations, System Chat threads, Notifications,
 * Constellations, Video, Reminders, and chat categories/themes.
 *
 * Deterministic: no randomness, so a reset produces exactly the same sandbox.
 */

interface Ctx {
  userId: string;
  systemId: string;
  now: Date;
}

type Out = Record<string, StoredRecord[]>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function at(ctx: Ctx, days: number, hour = 12, minute = 0): string {
  const d = new Date(ctx.now.getTime() + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function row(ctx: Ctx, prefix: string, fields: Record<string, unknown>, created = at(ctx, -3)): StoredRecord {
  return {
    id: newId(prefix),
    userId: ctx.userId,
    systemId: ctx.systemId,
    memberId: null,
    visibility: 'system' as Visibility,
    createdAt: created,
    updatedAt: created,
    deletedAt: null,
    version: 1,
    ...fields,
  } as StoredRecord;
}

/** Fixed demo birthdays, so zodiac signs and horoscopes are populated for every alter. */
const BIRTHDAYS = ['1994-03-21', '1991-10-31', '1996-06-14', '1989-12-02', '2017-08-09', '1985-02-17', '1999-09-23'];
const ORIGINS = ['Original host', 'Formed in childhood', 'Formed during university', 'Came through stress', 'Formed in early childhood', 'Found in the headspace library', 'Always been here'];
const BIRTH_PLACES: [string, number, number, number][] = [
  ['London, UK', 51.5074, -0.1278, 0],
  ['Chicago, USA', 41.8781, -87.6298, -6],
  ['Toronto, Canada', 43.6532, -79.3832, -5],
  ['Sydney, Australia', -33.8688, 151.2093, 10],
  ['Dublin, Ireland', 53.3498, -6.2603, 0],
  ['Wellington, New Zealand', -41.2866, 174.7756, 12],
  ['Edinburgh, UK', 55.9533, -3.1883, 0],
];

export function addDemoExtras(out: Out, opts: { userId: string; systemId: string; now: Date }): void {
  const ctx: Ctx = opts;
  const push = (collection: string, r: StoredRecord): StoredRecord => ((out[collection] ??= []).push(r), r);
  const members = out['members'] ?? [];
  const mid = (i: number): string => (members[i % Math.max(1, members.length)]?.['id'] as string) ?? '';

  // — Alters: birthdays (→ astrology), origins, ages, banners-by-colour ———
  members.forEach((m, i) => {
    const place = BIRTH_PLACES[i % BIRTH_PLACES.length]!;
    Object.assign(m, {
      birthday: BIRTHDAYS[i % BIRTHDAYS.length],
      origin: ORIGINS[i % ORIGINS.length],
      age: ['30', '33', '28', '35', '7', '39', 'unknown'][i % 7],
      birthPlace: place[0],
      birthLatitude: place[1],
      birthLongitude: place[2],
      birthUtcOffset: place[3],
      birthTime: i % 2 === 0 ? `${String(6 + i).padStart(2, '0')}:30` : null,
      astroVisibility: 'system',
    });
  });

  // — System chat: threads, categories, replies, reactions ——————————————
  const everyone = push('systemChatThreads', row(ctx, 'sct', {
    kind: 'system', name: 'Everyone', participantMemberIds: [], lastMessageAt: at(ctx, 0, 18), lastMessagePreview: 'Who has the grocery list?', pinned: 1,
    settings: { icon: { type: 'emoji', value: '🌌' }, category: 'none', description: 'The whole system, always open.' },
  }));
  const dayside = push('systemChatThreads', row(ctx, 'sct', {
    kind: 'group', name: 'Dayside crew', participantMemberIds: [mid(0), mid(3), mid(2)], lastMessageAt: at(ctx, -1, 9), lastMessagePreview: 'Remember the dentist at 3.',
    settings: { icon: { type: 'emoji', value: '☀️' }, category: 'work', description: 'Weekday planning.', appearance: { bubbleMine: '#7aa2f7', wallpaper: null, bubbleTheirs: null, spacing: 'cozy' } },
  }));
  const little = push('systemChatThreads', row(ctx, 'sct', {
    kind: 'group', name: 'Cozy corner', participantMemberIds: [mid(4), mid(2), mid(1)], lastMessageAt: at(ctx, -2, 19), lastMessagePreview: 'Dino drawings ahoy!',
    settings: { icon: { type: 'emoji', value: '🦖' }, category: 'fun', description: 'Drawing, snacks, comfort.' },
  }));
  const chatLines: [StoredRecord, number, string][] = [
    [dayside, 0, 'Morning everyone — shift starts at 10.'],
    [dayside, 3, 'On it. I will take the early commute.'],
    [dayside, 2, 'Remember the dentist at 3.'],
    [little, 4, 'Look, I drew a stegosaurus!'],
    [little, 2, 'That is amazing, Wren. Want a snack?'],
    [little, 1, 'I am proud of you. Dino drawings ahoy!'],
    [everyone, 5, 'Archive note: we have been out 41 hours this week.'],
    [everyone, 0, 'Who has the grocery list?'],
  ];
  const created: StoredRecord[] = [];
  chatLines.forEach(([thread, m, body], i) => {
    const msg = push('systemChatMessages', row(ctx, 'scm', {
      memberId: mid(m), threadId: thread['id'], body, sentAt: at(ctx, -Math.floor((chatLines.length - i) / 3), 8 + i, i * 7),
      channel: 'general', replyToId: i === 5 && created[3] ? created[3]['id'] : null,
      reactions: i % 3 === 0 ? { '❤️': [mid(1)], '✨': [mid(2)] } : null, attachmentIds: [], edited: 0,
    }));
    created.push(msg);
  });
  push('systemChatMessages', row(ctx, 'scm', {
    memberId: mid(4), threadId: little['id'], body: '[image placeholder: stegosaurus drawing]', sentAt: at(ctx, -2, 19, 30),
    channel: 'general', reactions: { '🦖': [mid(2), mid(1)] }, attachmentIds: [], edited: 0,
  }));

  // — School Life ——————————————————————————————————————————————————
  const classDefs: [string, string, string, string, string][] = [
    ['Biology 201', 'Dr. Okafor', 'science', '#5ec6a8', '09:00'],
    ['English Literature', 'Ms. Hartley', 'english', '#a78bfa', '11:00'],
    ['Studio Art', 'Mr. Lindqvist', 'arts', '#ec7392', '13:30'],
    ['Pre-Calculus', 'Mrs. Park', 'math', '#7aa2f7', '15:00'],
  ];
  const classes = classDefs.map(([name, teacher, cat, color, start], i) =>
    push('classes', row(ctx, 'cls', {
      name, teacher, subjectCategory: cat, color, room: `Room ${100 + i * 7}`, period: String(i + 1), schoolYear: '2026–27', term: 'Autumn',
      startTime: start, endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`, meetingDays: ['Mon', 'Wed', 'Fri'], archived: 0,
      gradeCategories: [{ name: 'Homework', weight: 30 }, { name: 'Tests', weight: 50 }, { name: 'Projects', weight: 20 }],
    })));
  const assignmentDefs: [number, string, string, number, string, number | null][] = [
    [0, 'Cell structure worksheet', 'worksheet', 2, 'notStarted', null],
    [0, 'Photosynthesis quiz', 'quiz', -4, 'completed', 46],
    [1, 'Essay: unreliable narrators', 'essay', 5, 'inProgress', null],
    [1, 'Reading: chapters 4–6', 'reading', -2, 'completed', 20],
    [2, 'Portfolio piece: self-portrait', 'project', 9, 'inProgress', null],
    [2, 'Gallery visit reflection', 'homework', -6, 'submitted', 18],
    [3, 'Unit circle test', 'test', 3, 'notStarted', null],
    [3, 'Problem set 7', 'homework', -1, 'completed', 27],
  ];
  assignmentDefs.forEach(([ci, name, type, due, status, score]) => {
    const a = push('assignments', row(ctx, 'asg', {
      classId: classes[ci]!['id'], name, type, dueAt: at(ctx, due, 23, 59), status, priority: due >= 0 && due <= 3 ? 'high' : 'normal',
      maxPoints: score !== null ? 50 : null, gradeReceived: score, estimatedMinutes: 45, completedByMemberId: mid(5), remindSent: 0,
    }));
    if (score !== null) push('grades', row(ctx, 'grd', {
      classId: classes[ci]!['id'], assignmentId: a['id'], label: name, category: type === 'quiz' || type === 'test' ? 'Tests' : 'Homework',
      pointsEarned: score, maxPoints: 50, gradedAt: at(ctx, due + 1, 10),
    }));
  });
  [['Drama club', 'club', 'Stage manager', '🎭'], ['Orchestra', 'music', 'Second violin', '🎻']].forEach(([name, kind, role, icon], i) => {
    const e = push('extracurriculars', row(ctx, 'ext', {
      name, activityType: kind, role, icon, color: i ? '#f0a85a' : '#ec7392', meetingDays: i ? ['Tue'] : ['Thu'],
      startTime: '16:00', endTime: '17:30', season: 'Autumn', archived: 0,
    }));
    for (let d = 1; d <= 4; d += 1) push('extracurricularLogs', row(ctx, 'exl', { extracurricularId: e['id'], date: at(ctx, -d * 5).slice(0, 10), hours: 1.5, note: 'Rehearsal' }));
  });
  push('calendarEvents', row(ctx, 'evt', { title: 'Spring performance (demo)', kind: 'social', startsAt: at(ctx, 12, 19), endsAt: at(ctx, 12, 21), emoji: '🎭', allDay: 0, memberIds: [mid(4), mid(0)], priority: 'high', showOnCalendar: 1 }));
  [0, 1, 2, 3, 4].forEach((d) => push('schoolCheckIns', row(ctx, 'sck', {
    recordedAt: at(ctx, -d, 15), classId: classes[d % 4]!['id'], understanding: 3 + (d % 3), stress: 2 + ((d + 1) % 3), workload: 3, note: d === 0 ? 'Felt focused today.' : '',
    memberId: mid(d),
  })));
  for (let d = 1; d <= 6; d += 1) push('studySessions', row(ctx, 'ssn', { classId: classes[d % 4]!['id'], startedAt: at(ctx, -d, 17), endedAt: at(ctx, -d, 18), durationSeconds: 3000 + d * 120 }));

  // — Calendar extras: birthdays, reminders, assignments due ————————————
  members.forEach((m, i) => {
    const [, month, day] = String(m['birthday']).split('-').map(Number) as [number, number, number];
    const next = new Date(ctx.now.getFullYear(), month - 1, day, 9);
    if (next < ctx.now) next.setFullYear(next.getFullYear() + 1);
    push('calendarEvents', row(ctx, 'evt', {
      title: `${m['name'] as string}’s birthday`, kind: 'birthday', startsAt: next.toISOString(), endsAt: next.toISOString(), allDay: 1,
      isRecurring: 1, recurrenceType: 'yearly', recurrenceInterval: 1, emoji: '🎂', memberIds: [mid(i)], showOnCalendar: 1,
    }));
  });
  [['Water the plants', 1], ['Refill prescription', 3], ['Call Ren back', 5]].forEach(([title, d]) =>
    push('reminders', row(ctx, 'rem', { title, remindAt: at(ctx, d as number, 9), remindSent: 0, forWholeSystem: 1 })));

  // — Notes folders + shared/alter notes —————————————————————————————
  const folder = push('noteFolders', row(ctx, 'nfd', { name: 'Shared with everyone', color: '#7aa2f7', icon: '📌', sortOrder: 0 }));
  push('notes', row(ctx, 'note', { title: 'House rules (demo)', body: 'Eat something before 2pm. Tell someone before you switch. Be kind about the dishes.', folderId: folder['id'], pinned: 1, tags: ['shared'] }));
  push('memberNotes', row(ctx, 'mnt', { fromMemberId: mid(2), toMemberIds: [mid(0)], kind: 'compliment', body: 'You handled that meeting beautifully.', sticker: '🌟' }));
  push('memberNotes', row(ctx, 'mnt', { fromMemberId: mid(1), toMemberIds: [mid(3)], kind: 'note', body: 'I took the late bus so you could sleep.', sticker: '🌙' }));
  push('boards', row(ctx, 'brd', { boardType: 'vibe', authorMemberId: mid(4), body: 'Cozy blankets + rain sounds', color: '#f4a8d8', posX: 40, posY: 30, rotation: -3 }));
  push('boards', row(ctx, 'brd', { boardType: 'insideJoke', authorMemberId: mid(1), body: '“The soup is a personality trait.”', color: '#a78bfa', posX: 160, posY: 90, rotation: 2 }));
  push('bucketListItems', row(ctx, 'bkt', { title: 'See the northern lights', notes: 'Corvid wants to go too.', completed: 0, addedByMemberId: mid(0) }));
  push('bucketListItems', row(ctx, 'bkt', { title: 'Finish the quilt', completed: 1, completedAt: at(ctx, -10), addedByMemberId: mid(2) }));

  // — Flux: posts, comments, reactions, profile ————————————————————————
  push('constellationProfiles', row(ctx, 'cst', {
    handle: 'meridian-demo', displayName: 'The Meridian System', bio: 'A fictional system for exploring PluralNova. ✦', accent: '#7aa2f7',
    systemType: 'Demo', pronouns: 'we/us', isPublic: 0, showMemberCount: 1, showMemberList: 1, showCurrentFronter: 1, acceptFriendRequests: 1, acceptMessageRequests: 1,
    memberSort: 'orbit', memberColumns: 2,
  }));
  const postDefs: [number, string][] = [
    [0, 'Planted tomatoes today. Corvid says they look suspicious. 🍅'],
    [4, 'I drew a whole dinosaur family! Look at them!! 🦖'],
    [2, 'Soup season has officially begun. Recipes in the comments.'],
    [5, 'Reminder: the library is open late on Thursdays.'],
  ];
  postDefs.forEach(([m, body], i) => {
    const p = push('posts', row(ctx, 'pst', {
      memberId: mid(m), body, postedAt: at(ctx, -i, 11 + i), authorKind: 'member', reactionCount: 2 + i, commentCount: 1, repostCount: 0, tags: i % 2 ? ['demo', 'cozy'] : ['demo'], edited: 0, visibility: 'private',
    }, at(ctx, -i, 11 + i)));
    push('comments', row(ctx, 'cmt', { postId: p['id'], body: i % 2 ? 'Love this! ✨' : 'Same energy.', postedAt: at(ctx, -i, 12 + i), authorKind: 'member', memberId: mid(m + 1) }));
    ['❤️', '✨'].forEach((emoji) => push('reactions', row(ctx, 'rxn', { targetType: 'post', targetId: p['id'], emoji, memberId: mid(m + 2) })));
  });

  // — Notifications ——————————————————————————————————————————
  [
    ['Friend request (demo)', 'Nova the fictional friend would like to connect.', 'friendRequests', 'friend_request'],
    ['Birthday coming up', 'Ash’s birthday is next month.', 'birthdays', 'birthday'],
    ['Assignment due soon', 'Cell structure worksheet is due in 2 days.', 'assignmentDue', 'assignment'],
    ['Sleep check-in', 'How did you sleep last night?', 'mood', 'checkin'],
  ].forEach(([title, body, category, kind], i) =>
    push('notifications', row(ctx, 'ntf', { kind, title, body, category, link: null, readAt: i > 2 ? at(ctx, -1) : null }, at(ctx, 0, 8 + i))));

  // — Finances (fake, round numbers) ———————————————————————————————
  const budgetDefs: [string, number][] = [['Groceries', 400], ['Transport', 120], ['Fun', 150], ['Rent', 900]];
  budgetDefs.forEach(([category, limit]) => push('budgets', row(ctx, 'bdg', { category, limitAmount: limit, period: 'monthly', color: '#7aa2f7' })));
  const account = (out['financeAccounts'] ?? [])[0];
  const txs: [string, number, string, 'expense' | 'income'][] = [
    ['Demo paycheck', 1800, 'Income', 'income'], ['Farmers market', 46.5, 'Groceries', 'expense'], ['Bus pass', 60, 'Transport', 'expense'],
    ['Board game night', 28, 'Fun', 'expense'], ['Rent (demo)', 900, 'Rent', 'expense'], ['Supermarket', 82.2, 'Groceries', 'expense'],
  ];
  txs.forEach(([description, amount, category, kind], i) =>
    push('transactions', row(ctx, 'trx', { description, amount, category, kind, occurredAt: at(ctx, -i * 4, 14), accountId: account?.['id'] ?? null })));
  push('savingsGoals', row(ctx, 'sav', { name: 'Trip fund (demo)', targetAmount: 1500, savedAmount: 420, targetDate: at(ctx, 200).slice(0, 10), color: '#5ec6a8' }));

  // — Locations ————————————————————————————————————————————
  const places: [string, string, string][] = [['Home', '🏠', 'home'], ['Library', '📚', 'learning'], ['Riverside park', '🌳', 'outdoors']];
  const saved = places.map(([name, icon, category], i) => push('savedLocations', row(ctx, 'loc', { name, icon, category, color: '#7aa2f7', sortOrder: i, address: 'Demo address' })));
  [[0, 5, 480], [1, 2, 95], [2, 1, 60], [1, 4, 120], [0, 3, 600]].forEach(([p, d, mins], i) =>
    push('locationEntries', row(ctx, 'lce', {
      name: places[p as number]![0], savedLocationId: saved[p as number]!['id'], visitedAt: at(ctx, -(d as number), 10), arrivedAt: at(ctx, -(d as number), 10),
      leftAt: new Date(new Date(at(ctx, -(d as number), 10)).getTime() + (mins as number) * 60000).toISOString(),
      durationMinutes: mins, durationSeconds: (mins as number) * 60, frontingMemberId: mid(i), isCurrent: 0, safetyRating: 5,
    })));

  // — Work ————————————————————————————————————————————————
  const wp = push('workplaces', row(ctx, 'wrk', { name: 'Greenleaf Garden Centre (demo)', position: 'Sales assistant', hourlyRate: 17.5, currency: 'USD', color: '#5ec6a8', current: 1 }));
  for (let d = 1; d <= 6; d += 1) {
    push('workShifts', row(ctx, 'shf', {
      workplaceId: wp['id'], startsAt: at(ctx, -d, 9), endsAt: at(ctx, -d, 15), breakMinutes: 30, durationSeconds: 5.5 * 3600, completed: 1, role: 'Floor', assignedMemberIds: [mid(3)],
    }));
  }
  push('workShifts', row(ctx, 'shf', { workplaceId: wp['id'], startsAt: at(ctx, 1, 9), endsAt: at(ctx, 1, 15), breakMinutes: 30, completed: 0, role: 'Floor', assignedMemberIds: [mid(3)] }));

  // — Video / media + playback ————————————————————————————————
  push('videoItems', row(ctx, 'vid', { title: 'Gentle stargazing guide (placeholder)', channel: 'Demo Channel', externalUrl: 'https://example.com/demo-video', provider: 'external', favorite: 1, durationSeconds: 600, sortOrder: 0 }));
}

/**
 * The sandbox's own appearance: a couple of saved themes, assignments, a
 * pinned song and chat categories, so Theme Editor and Music pins are not
 * empty on first open. Pins reference real track ids from the seeded data.
 */
export function buildDemoAppearance(out: Out): AppearanceState {
  const track = (out['musicTracks'] ?? [])[0];
  const alter = (out['members'] ?? [])[0];
  const purple = {
    id: 'theme_demo_purple', name: 'Bonnie Purple', pinned: true, createdAt: '2024-01-01T00:00:00.000Z', elements: {},
    global: { accent: '#c084fc', surfaceColor: '#2a1650', bgColor: '#150a2e', bgGradient: { ...DEFAULT_GRADIENT, colors: ['#150a2e', '#3b1a6e'], angle: 160 } },
  };
  const sunset = {
    id: 'theme_demo_sunset', name: 'Sunset Orange', pinned: true, createdAt: '2024-01-01T00:00:00.000Z', elements: {},
    global: { accent: '#fb923c', surfaceColor: '#3a1d12', bgColor: '#1c0f0a', rounding: 70 },
  };
  return {
    ...DEFAULT_APPEARANCE,
    savedThemes: [purple, sunset],
    assignments: { ...(alter ? { [`alter:${alter['id'] as string}`]: purple.id } : {}), 'section:music': purple.id },
    musicPins: track
      ? [{
          id: 'pin_demo_1', trackId: track['id'] as string, displayName: 'My Song', coverUrl: null, accent: '#fb923c', themeId: sunset.id,
          gradient: null, background: null, favorite: true, playlistId: (track['playlistId'] as string) ?? null,
        }]
      : [],
    chatCategories: [{ id: 'cat_demo_custom', label: 'Rituals' }],
  };
}
