import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { EMOTIONS, FORTUNES, now, pickDaily, pickRandom } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { usePrefersReducedMotion } from '../core/theme.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip } from '../ui/primitives.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon, type IconName } from '../ui/Icon.js';

/**
 * Games.
 *
 * Calm, low-stakes things to do right now — a breathing rhythm, something to
 * pop, a walk through the five senses. Nothing here is scored or timed
 * against you; there is nothing to win. Split out of Cycle & Wellbeing into
 * its own tab — the two were easy to mistake for the same thing when a long
 * grid of games sat behind one toggle on a page named for something else.
 */
export default function Games(): JSX.Element {
  return (
    <>
      <PageHeader title="Games" description="Nothing here is timed or scored. Stay as long as it helps." />
      <WellbeingGames />
    </>
  );
}

/**
 * Every game this screen offers, in the order the tiles appear — mirrors
 * `DASHBOARD_WIDGETS`'s `{id, label}` + switch shape rather than each game
 * carrying its own dialog and open-callback, which is what this was before
 * it was three tiles and became worth not repeating an eighth time.
 */
export const WELLBEING_GAMES: readonly { id: string; label: string; subtitle: string; icon: IconName }[] = [
  { id: 'breathing', label: 'Breathing', subtitle: 'A slow, guided rhythm', icon: 'headspace' },
  { id: 'bubbles', label: 'Bubble pop', subtitle: 'Pop as many as you like', icon: 'sparkle' },
  { id: 'grounding', label: 'Grounding', subtitle: 'The five senses, one at a time', icon: 'eye' },
  { id: 'memory-match', label: 'Memory match', subtitle: 'Find the pairs', icon: 'duplicate' },
  { id: 'constellation', label: 'Constellation', subtitle: 'Connect the stars in order', icon: 'constellation' },
  { id: 'emotion-match', label: 'Emotion match', subtitle: 'Pair the word with the face', icon: 'emotion' },
  { id: 'mood-cards', label: 'Pick a card', subtitle: 'A small prompt, picked for you', icon: 'shuffle' },
  { id: 'maze', label: 'Maze', subtitle: 'Find your way through', icon: 'grid' },
  { id: 'doodle', label: 'Doodle', subtitle: 'Draw whatever comes to mind', icon: 'create' },
  { id: 'spot-the-difference', label: 'Spot the difference', subtitle: 'Two scenes, a few small changes', icon: 'search' },
  { id: 'daily-puzzle', label: 'Daily puzzle', subtitle: "Today's little question", icon: 'help' },
] as const;

function WellbeingGame({ id }: { id: string }): JSX.Element | null {
  switch (id) {
    case 'breathing':
      return <BreathingExercise />;
    case 'bubbles':
      return <BubblePop />;
    case 'grounding':
      return <GroundingExercise />;
    case 'memory-match':
      return <MemoryMatchGame />;
    case 'constellation':
      return <ConstellationGame />;
    case 'emotion-match':
      return <EmotionMatchGame />;
    case 'mood-cards':
      return <MoodCardsGame />;
    case 'maze':
      return <MazeGame />;
    case 'doodle':
      return <DoodleGame />;
    case 'spot-the-difference':
      return <SpotTheDifferenceGame />;
    case 'daily-puzzle':
      return <DailyPuzzleGame />;
    default:
      return null;
  }
}

function WellbeingGames(): JSX.Element {
  const dialog = useDialog<string>();
  const gameLog = useCollection('wellbeingGameLog');

  // Logged on close rather than open — a tap that opens and immediately
  // closes a game is not really "playing" it, and this way there is exactly
  // one row per sitting, however long it lasted.
  const close = (): void => {
    if (dialog.value) void gameLog.create({ gameId: dialog.value, playedAt: now() });
    dialog.hide();
  };

  const active = WELLBEING_GAMES.find((game) => game.id === dialog.value);

  return (
    <>
      <div className="grid" style={{ ['--grid-min' as never]: '200px' }}>
        {WELLBEING_GAMES.map((game) => (
          <Card
            key={game.id}
            interactive
            role="button"
            tabIndex={0}
            aria-label={game.label}
            onClick={() => dialog.show(game.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dialog.show(game.id);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <Icon name={game.icon} size={22} />
            <div style={{ marginTop: 'var(--space-2)', fontWeight: 'var(--weight-semibold)' }}>{game.label}</div>
            <div className="small faint">{game.subtitle}</div>
          </Card>
        ))}
      </div>

      <Dialog open={dialog.open} onClose={close} title={active?.label ?? ''}>
        {dialog.value ? <WellbeingGame id={dialog.value} /> : null}
      </Dialog>
    </>
  );
}

type BreathPattern = 'box' | 'calm' | 'simple';

const BREATH_PATTERNS: Record<
  BreathPattern,
  { label: string; phases: { name: string; seconds: number; scale: number }[] }
> = {
  box: {
    label: 'Box — 4 in, 4 hold, 4 out, 4 hold',
    phases: [
      { name: 'Breathe in', seconds: 4, scale: 1 },
      { name: 'Hold', seconds: 4, scale: 1 },
      { name: 'Breathe out', seconds: 4, scale: 0.55 },
      { name: 'Hold', seconds: 4, scale: 0.55 },
    ],
  },
  calm: {
    label: '4-7-8 — a longer, slower exhale',
    phases: [
      { name: 'Breathe in', seconds: 4, scale: 1 },
      { name: 'Hold', seconds: 7, scale: 1 },
      { name: 'Breathe out', seconds: 8, scale: 0.55 },
    ],
  },
  simple: {
    label: 'Simple — in and out, no holding',
    phases: [
      { name: 'Breathe in', seconds: 4, scale: 1 },
      { name: 'Breathe out', seconds: 4, scale: 0.55 },
    ],
  },
};

function BreathingExercise(): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const [pattern, setPattern] = useState<BreathPattern>('box');
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);

  const phases = BREATH_PATTERNS[pattern].phases;
  const phase = phases[phaseIndex]!;

  useEffect(() => {
    setPhaseIndex(0);
    setRunning(false);
  }, [pattern]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setPhaseIndex((current) => (current + 1) % phases.length);
    }, phase.seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [running, phaseIndex, phase.seconds, phases.length]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
        {(Object.keys(BREATH_PATTERNS) as BreathPattern[]).map((key) => (
          <Chip key={key} selected={pattern === key} onClick={() => setPattern(key)}>
            {BREATH_PATTERNS[key].label.split(' — ')[0]}
          </Chip>
        ))}
      </div>

      <div
        className="breath-circle"
        style={{
          transform: `scale(${running ? phase.scale : 0.75})`,
          transition: reducedMotion ? 'none' : `transform ${phase.seconds}s ease-in-out`,
        }}
      />

      <p style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)', minHeight: '1.6em' }}>
        {running ? phase.name : 'Ready when you are'}
      </p>
      <p className="small faint">{BREATH_PATTERNS[pattern].label}</p>

      <Button
        variant="primary"
        size="lg"
        style={{ marginTop: 'var(--space-3)' }}
        onClick={() => {
          if (running) {
            setRunning(false);
          } else {
            setPhaseIndex(0);
            setRunning(true);
          }
        }}
      >
        {running ? 'Stop' : 'Start'}
      </Button>
    </div>
  );
}

function BubblePop(): JSX.Element {
  const size = 40;
  const [popped, setPopped] = useState<boolean[]>(() => Array(size).fill(false) as boolean[]);
  const allPopped = popped.every(Boolean);

  return (
    <div>
      <div className="bubble-grid">
        {popped.map((isPopped, index) => (
          <button
            key={index}
            type="button"
            className={`bubble${isPopped ? ' bubble--popped' : ''}`}
            aria-label={isPopped ? 'Already popped' : 'Pop this bubble'}
            aria-pressed={isPopped}
            onClick={() =>
              setPopped((current) => current.map((value, position) => (position === index ? true : value)))
            }
          />
        ))}
      </div>

      {allPopped ? (
        <p className="small faint" style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
          All popped.
        </p>
      ) : null}

      <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
        <Button variant="ghost" onClick={() => setPopped(Array(size).fill(false) as boolean[])}>
          Re-inflate
        </Button>
      </div>
    </div>
  );
}

const GROUNDING_STEPS = [
  { count: 5, sense: 'see' },
  { count: 4, sense: 'hear' },
  { count: 3, sense: 'feel' },
  { count: 2, sense: 'smell' },
  { count: 1, sense: 'taste' },
] as const;

function GroundingExercise(): JSX.Element {
  const [step, setStep] = useState(0);
  const done = step >= GROUNDING_STEPS.length;
  const current = done ? null : GROUNDING_STEPS[step]!;

  return (
    <div style={{ textAlign: 'center' }}>
      {done || !current ? (
        <>
          <p className="prose">
            That is the five senses. However that felt, it is over now — nothing to fix or judge about it.
          </p>
          <Button variant="ghost" style={{ marginTop: 'var(--space-3)' }} onClick={() => setStep(0)}>
            Start again
          </Button>
        </>
      ) : (
        <>
          <div className="tiny faint" style={{ marginBottom: 'var(--space-2)' }}>
            Step {step + 1} of {GROUNDING_STEPS.length}
          </div>
          <p style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)' }}>
            Name {current.count} thing{current.count === 1 ? '' : 's'} you can {current.sense}
          </p>
          <p className="small faint" style={{ marginTop: 'var(--space-2)' }}>
            Say them out loud or just notice them. No need to write anything down.
          </p>
          <Button variant="primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setStep((value) => value + 1)}>
            {step === GROUNDING_STEPS.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </>
      )}
    </div>
  );
}

/** Fisher–Yates, shared by every game here that needs a shuffled order. */
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const MEMORY_GLYPHS = ['⭐', '🌙', '☄️', '🪐', '✨', '🌟'] as const;

function MemoryMatchGame(): JSX.Element {
  const [deck, setDeck] = useState(() => shuffle([...MEMORY_GLYPHS, ...MEMORY_GLYPHS]));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);

  const flip = (index: number): void => {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length === 2) {
      const [a, b] = next;
      if (deck[a!] === deck[b!]) {
        setMatched((current) => [...current, a!, b!]);
        setFlipped([]);
      } else {
        setTimeout(() => setFlipped([]), 650);
      }
    }
  };

  const reset = (): void => {
    setDeck(shuffle([...MEMORY_GLYPHS, ...MEMORY_GLYPHS]));
    setFlipped([]);
    setMatched([]);
  };

  return (
    <div>
      <div className="memory-grid">
        {deck.map((glyph, index) => {
          const shown = flipped.includes(index) || matched.includes(index);
          return (
            <button
              key={index}
              type="button"
              className={`memory-card${shown ? ' memory-card--shown' : ''}`}
              onClick={() => flip(index)}
              aria-label={shown ? glyph : 'Face-down card'}
            >
              {shown ? glyph : ''}
            </button>
          );
        })}
      </div>
      {matched.length === deck.length ? (
        <p className="small faint" style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
          All paired up.
        </p>
      ) : null}
      <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
        <Button variant="ghost" onClick={reset}>
          Shuffle again
        </Button>
      </div>
    </div>
  );
}

const CONSTELLATION_STARS = [
  { x: 30, y: 150 },
  { x: 85, y: 55 },
  { x: 150, y: 115 },
  { x: 205, y: 35 },
  { x: 255, y: 100 },
  { x: 295, y: 25 },
] as const;

function ConstellationGame(): JSX.Element {
  const [next, setNext] = useState(0);
  const done = next === CONSTELLATION_STARS.length;

  const click = (index: number): void => {
    if (index === next) setNext((value) => value + 1);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 320 180" className="constellation-board" role="img" aria-label="Stars to connect in order">
        {Array.from({ length: Math.max(0, next - 1) }, (_, i) => (
          <line
            key={i}
            x1={CONSTELLATION_STARS[i]!.x}
            y1={CONSTELLATION_STARS[i]!.y}
            x2={CONSTELLATION_STARS[i + 1]!.x}
            y2={CONSTELLATION_STARS[i + 1]!.y}
            className="constellation-line"
          />
        ))}
        {CONSTELLATION_STARS.map((star, index) => (
          <circle
            key={index}
            cx={star.x}
            cy={star.y}
            r={index < next ? 7 : 10}
            tabIndex={0}
            role="button"
            aria-label={index < next ? `Star ${index + 1}, already connected` : `Star ${index + 1}`}
            className={index < next ? 'constellation-star constellation-star--lit' : 'constellation-star'}
            onClick={() => click(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                click(index);
              }
            }}
          />
        ))}
      </svg>
      <p className="small faint" style={{ marginTop: 'var(--space-2)' }}>
        {done ? 'The constellation is complete.' : `Find star ${next + 1} of ${CONSTELLATION_STARS.length}.`}
      </p>
      {done ? (
        <Button variant="ghost" style={{ marginTop: 'var(--space-2)' }} onClick={() => setNext(0)}>
          Start again
        </Button>
      ) : null}
    </div>
  );
}

function pickRandomEmotions(count: number): typeof EMOTIONS[number][] {
  return shuffle(EMOTIONS).slice(0, count);
}

function EmotionMatchGame(): JSX.Element {
  const [round, setRound] = useState(() => pickRandomEmotions(5));
  const words = useMemo(() => shuffle(round), [round]);
  const emojis = useMemo(() => shuffle(round), [round]);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [selectedEmojiId, setSelectedEmojiId] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedWordId || !selectedEmojiId) return undefined;
    if (selectedWordId === selectedEmojiId) {
      setMatched((current) => [...current, selectedWordId]);
      setSelectedWordId(null);
      setSelectedEmojiId(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      setSelectedWordId(null);
      setSelectedEmojiId(null);
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedWordId, selectedEmojiId]);

  const reset = (): void => {
    setRound(pickRandomEmotions(5));
    setMatched([]);
    setSelectedWordId(null);
    setSelectedEmojiId(null);
  };

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-5)' }}>
        <div className="stack stack--tight" style={{ flex: 1 }}>
          {words.map((emotion) => (
            <button
              key={emotion.id}
              type="button"
              className={`emotion-match-tile${matched.includes(emotion.id) ? ' emotion-match-tile--matched' : ''}${selectedWordId === emotion.id ? ' emotion-match-tile--selected' : ''}`}
              disabled={matched.includes(emotion.id)}
              onClick={() => setSelectedWordId(emotion.id)}
            >
              {emotion.name}
            </button>
          ))}
        </div>
        <div className="stack stack--tight" style={{ flex: 1 }}>
          {emojis.map((emotion) => (
            <button
              key={emotion.id}
              type="button"
              className={`emotion-match-tile${matched.includes(emotion.id) ? ' emotion-match-tile--matched' : ''}${selectedEmojiId === emotion.id ? ' emotion-match-tile--selected' : ''}`}
              disabled={matched.includes(emotion.id)}
              onClick={() => setSelectedEmojiId(emotion.id)}
            >
              {emotion.emoji}
            </button>
          ))}
        </div>
      </div>
      {matched.length === round.length ? (
        <p className="small faint" style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
          All matched.
        </p>
      ) : null}
      <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
        <Button variant="ghost" onClick={reset}>
          New words
        </Button>
      </div>
    </div>
  );
}

function MoodCardsGame(): JSX.Element {
  const [cards, setCards] = useState(() => Array.from({ length: 4 }, () => pickRandom(FORTUNES)));
  const [revealed, setRevealed] = useState<number | null>(null);

  const reset = (): void => {
    setCards(Array.from({ length: 4 }, () => pickRandom(FORTUNES)));
    setRevealed(null);
  };

  return (
    <div>
      <div className="grid" style={{ ['--grid-min' as never]: '120px' }}>
        {cards.map((text, index) => (
          <button
            key={index}
            type="button"
            className="mood-card"
            onClick={() => setRevealed(index)}
            disabled={revealed !== null}
          >
            {revealed === index ? text : '🔮'}
          </button>
        ))}
      </div>
      {revealed !== null ? (
        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
          <Button variant="ghost" onClick={reset}>
            Pick again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type MazeWall = 'top' | 'right' | 'bottom' | 'left';
type MazeCell = Record<MazeWall, boolean>;

const MAZE_SIZE = 6;
const MAZE_DIRECTIONS: { dx: number; dy: number; wall: MazeWall; opposite: MazeWall }[] = [
  { dx: 0, dy: -1, wall: 'top', opposite: 'bottom' },
  { dx: 1, dy: 0, wall: 'right', opposite: 'left' },
  { dx: 0, dy: 1, wall: 'bottom', opposite: 'top' },
  { dx: -1, dy: 0, wall: 'left', opposite: 'right' },
];

/** A randomised depth-first "carve a path" maze — small enough to generate instantly, no library needed. */
function generateMaze(size: number): MazeCell[][] {
  const grid: MazeCell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ top: true, right: true, bottom: true, left: true })),
  );
  const visited = new Set<number>();
  const indexOf = (x: number, y: number): number => y * size + x;

  const carve = (x: number, y: number): void => {
    visited.add(indexOf(x, y));
    for (const dir of shuffle(MAZE_DIRECTIONS)) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || visited.has(indexOf(nx, ny))) continue;
      grid[y]![x]![dir.wall] = false;
      grid[ny]![nx]![dir.opposite] = false;
      carve(nx, ny);
    }
  };
  carve(0, 0);
  return grid;
}

function MazeGame(): JSX.Element {
  const [maze, setMaze] = useState(() => generateMaze(MAZE_SIZE));
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const won = position.x === MAZE_SIZE - 1 && position.y === MAZE_SIZE - 1;

  const move = (dx: number, dy: number): void => {
    if (won) return;
    const nx = position.x + dx;
    const ny = position.y + dy;
    if (nx < 0 || ny < 0 || nx >= MAZE_SIZE || ny >= MAZE_SIZE) return;
    const wall: MazeWall = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'bottom' : 'top';
    if (maze[position.y]![position.x]![wall]) return;
    setPosition({ x: nx, y: ny });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowUp') move(0, -1);
      else if (event.key === 'ArrowDown') move(0, 1);
      else if (event.key === 'ArrowLeft') move(-1, 0);
      else if (event.key === 'ArrowRight') move(1, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, position, won]);

  const reset = (): void => {
    setMaze(generateMaze(MAZE_SIZE));
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="maze-grid" style={{ ['--maze-size' as never]: MAZE_SIZE }}>
        {maze.map((row, y) =>
          row.map((cell, x) => (
            <button
              key={`${x}-${y}`}
              type="button"
              className="maze-cell"
              aria-label={x === position.x && y === position.y ? 'Your position' : `Cell ${x + 1}, ${y + 1}`}
              style={{
                borderTopWidth: cell.top ? 2 : 0,
                borderRightWidth: cell.right ? 2 : 0,
                borderBottomWidth: cell.bottom ? 2 : 0,
                borderLeftWidth: cell.left ? 2 : 0,
              }}
              onClick={() => move(x - position.x, y - position.y)}
            >
              {x === position.x && y === position.y ? '●' : x === MAZE_SIZE - 1 && y === MAZE_SIZE - 1 ? '✦' : ''}
            </button>
          )),
        )}
      </div>
      <p className="small faint" style={{ marginTop: 'var(--space-3)' }}>
        {won ? 'You made it through.' : 'Arrow keys, or tap a cell next to you.'}
      </p>
      {won ? (
        <Button variant="ghost" style={{ marginTop: 'var(--space-2)' }} onClick={reset}>
          New maze
        </Button>
      ) : null}
    </div>
  );
}

const DOODLE_COLORS = ['#e8ecf7', '#7aa2f7', '#f2c45a', '#e0705f', '#63c9b4'];

function DoodleGame(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState(DOODLE_COLORS[0]!);

  // The canvas scales to fit narrow dialogs via CSS while keeping its 400×260
  // drawing buffer, so a pointer position in CSS pixels has to be rescaled to
  // buffer pixels or strokes drift from the cursor once the canvas shrinks.
  const point = (event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = point(event);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const clear = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={260}
        className="doodle-canvas"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
      />
      <div className="row" style={{ justifyContent: 'center', alignItems: 'center', marginTop: 'var(--space-3)' }}>
        {DOODLE_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="doodle-swatch"
            aria-label={`Use this colour`}
            aria-pressed={color === swatch}
            style={{ background: swatch }}
            onClick={() => setColor(swatch)}
          />
        ))}
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

const SPOT_DIFFERENCES = [
  { id: 'missing-star', x: 130, y: 40 },
  { id: 'star-colour', x: 60, y: 92 },
  { id: 'moon-shift', x: 224, y: 60 },
] as const;

function NightSkyScene({ variant }: { variant: 'a' | 'b' }): JSX.Element {
  return (
    <svg viewBox="0 0 280 160" className="spot-scene" role="img" aria-label="A night sky scene">
      <rect width="280" height="160" rx="12" fill="#141a2e" />
      <circle cx={variant === 'b' ? 232 : 220} cy="60" r="18" fill="#e8ecf7" />
      {variant === 'a' ? <circle cx="130" cy="40" r="3" fill="#e8ecf7" /> : null}
      <circle cx="60" cy="92" r="3" fill={variant === 'b' ? '#f2c45a' : '#e8ecf7'} />
      <circle cx="90" cy="125" r="3" fill="#e8ecf7" />
      <circle cx="180" cy="115" r="3" fill="#e8ecf7" />
      <circle cx="245" cy="130" r="3" fill="#e8ecf7" />
    </svg>
  );
}

function SpotTheDifferenceGame(): JSX.Element {
  const [found, setFound] = useState<string[]>([]);
  const done = found.length === SPOT_DIFFERENCES.length;

  const click = (id: string): void => {
    if (!found.includes(id)) setFound((current) => [...current, id]);
  };

  return (
    <div>
      <div className="row" style={{ gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
        {(['a', 'b'] as const).map((variant) => (
          <div key={variant} className="spot-scene-wrap">
            <NightSkyScene variant={variant} />
            {SPOT_DIFFERENCES.map((spot) => (
              <button
                key={spot.id}
                type="button"
                className={`spot-hotspot${found.includes(spot.id) ? ' spot-hotspot--found' : ''}`}
                style={{ left: `${(spot.x / 280) * 100}%`, top: `${(spot.y / 160) * 100}%` }}
                aria-label={found.includes(spot.id) ? 'Difference found' : 'Is this different?'}
                onClick={() => click(spot.id)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="small faint" style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
        {done ? 'Found them all.' : `${found.length} of ${SPOT_DIFFERENCES.length} found.`}
      </p>
    </div>
  );
}

interface TriviaQA {
  question: string;
  answer: string;
}

const DAILY_TRIVIA: readonly TriviaQA[] = [
  { question: 'How many bones are in an adult human body?', answer: '206.' },
  { question: 'What do you call a group of crows?', answer: 'A murder.' },
  { question: 'Which planet spins on its side, rather than upright?', answer: 'Uranus.' },
  { question: "What's the only big cat that can't roar?", answer: "The snow leopard — it purrs instead." },
  { question: 'Which lasts longer: a day on Venus, or its year?', answer: 'The day — Venus turns slower than it orbits the sun.' },
  { question: "What colour is a polar bear's skin, under all that fur?", answer: 'Black.' },
  { question: 'How many hearts does an octopus have?', answer: 'Three.' },
  { question: 'Which bird is the only one that can fly backwards?', answer: 'The hummingbird.' },
  { question: 'What do you call a baby hedgehog?', answer: 'A hoglet.' },
  { question: 'About how many moons does Jupiter have, at last count?', answer: 'Over ninety.' },
  { question: "What's the tallest mountain on Earth, measured base to peak?", answer: 'Mauna Kea — most of it is underwater.' },
  { question: 'Which ocean is the largest?', answer: 'The Pacific.' },
  { question: 'Is a light-year a measure of distance or time?', answer: 'Distance — how far light travels in a year.' },
];

function DailyPuzzleGame(): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const today = useMemo(() => pickDaily(DAILY_TRIVIA, new Date()), []);

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)' }}>{today.question}</p>
      {revealed ? (
        <p className="prose" style={{ marginTop: 'var(--space-3)' }}>
          {today.answer}
        </p>
      ) : (
        <Button variant="primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setRevealed(true)}>
          Reveal the answer
        </Button>
      )}
      <p className="tiny faint" style={{ marginTop: 'var(--space-4)' }}>
        A new one tomorrow.
      </p>
    </div>
  );
}
