import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './core/auth.js';
import { DataProvider } from './core/data.js';
import { I18nProvider } from './core/i18n.js';
import { ThemeProvider, usePreAuthTheme } from './core/theme.js';
import { ToastProvider } from './core/toast.js';
import { startSyncWatchers, syncEngine } from './core/sync.js';
import { startRealtime } from './core/realtime.js';
import { ErrorBoundary, SkeletonList } from './ui/feedback.js';
import { Layout } from './app/Layout.js';
import { Atmosphere } from './app/Atmosphere.js';
import { AuthScreens } from './modules/auth/AuthScreens.js';
import { Onboarding } from './modules/auth/Onboarding.js';

/**
 * Routes.
 *
 * Every screen is code-split, so opening the app loads the shell and the one
 * page being looked at rather than all fifty. System-only routes are filtered
 * by mode at the route level, not hidden with CSS.
 */

const load = <T,>(loader: () => Promise<{ default: T }>) => lazy(loader as never);

const Dashboard = load(() => import('./modules/Dashboard.js'));
const WhosThere = load(() => import('./modules/WhosThere.js'));
const QuickFront = load(() => import('./modules/QuickFront.js'));
const Fronting = load(() => import('./modules/Fronting.js'));
const Stats = load(() => import('./modules/Stats.js'));
const Members = load(() => import('./modules/Members.js'));
const MemberProfile = load(() => import('./modules/MemberProfile.js'));
const ProfileSelect = load(() => import('./modules/ProfileSelect.js'));
const Organize = load(() => import('./modules/Organize.js'));
const Subsystems = load(() => import('./modules/Subsystems.js'));
const SystemHistory = load(() => import('./modules/SystemHistory.js'));
const Journal = load(() => import('./modules/Journal.js'));
const Notes = load(() => import('./modules/Notes.js'));
const Tasks = load(() => import('./modules/Tasks.js'));
const Calendar = load(() => import('./modules/Calendar.js'));
const Media = load(() => import('./modules/Media.js'));
const Flags = load(() => import('./modules/Flags.js'));
const Achievements = load(() => import('./modules/Achievements.js'));
const Wellbeing = load(() => import('./modules/Wellbeing.js'));
const Emotions = load(() => import('./modules/Emotions.js'));
const BodyMap = load(() => import('./modules/BodyMap.js'));
const EmotionInsights = load(() => import('./modules/EmotionInsights.js'));
const Sleep = load(() => import('./modules/Sleep.js'));
const Fitness = load(() => import('./modules/Fitness.js'));
const Cycle = load(() => import('./modules/Cycle.js'));
const DailySummary = load(() => import('./modules/DailySummary.js'));
const Finances = load(() => import('./modules/Finances.js'));
const Contacts = load(() => import('./modules/Contacts.js'));
const EmergencyContacts = load(() => import('./modules/EmergencyContacts.js'));
const Locations = load(() => import('./modules/Locations.js'));
const Vault = load(() => import('./modules/Vault.js'));
const Relationships = load(() => import('./modules/Relationships.js'));
const Headspace = load(() => import('./modules/Headspace.js'));
const Constellations = load(() => import('./modules/Constellations.js'));
const ConstellationProfile = load(() => import('./modules/ConstellationProfile.js'));
const Friends = load(() => import('./modules/Friends.js'));
const Flux = load(() => import('./modules/Flux.js'));
const Messages = load(() => import('./modules/Messages.js'));
const SystemChat = load(() => import('./modules/SystemChat.js'));
const Bulletin = load(() => import('./modules/Bulletin.js'));
const Polls = load(() => import('./modules/Polls.js'));
const NotificationCentre = load(() => import('./modules/NotificationCentre.js'));
const Music = load(() => import('./modules/Music.js'));
const Video = load(() => import('./modules/Video.js'));
const FicTracker = load(() => import('./modules/FicTracker.js'));
const Characters = load(() => import('./modules/Characters.js'));
const Stories = load(() => import('./modules/Stories.js'));
const StoryWorkspace = load(() => import('./modules/StoryWorkspace.js'));
const Resources = load(() => import('./modules/Resources.js'));
const Dictionary = load(() => import('./modules/Dictionary.js'));
const Work = load(() => import('./modules/Work.js'));
const Templates = load(() => import('./modules/Templates.js'));
const ImportCentre = load(() => import('./modules/ImportCentre.js'));
const Backup = load(() => import('./modules/Backup.js'));
const Settings = load(() => import('./modules/Settings.js'));
const Help = load(() => import('./modules/Help.js'));
const Features = load(() => import('./modules/Features.js'));
const Search = load(() => import('./modules/Search.js'));
const More = load(() => import('./modules/More.js'));
const NotFound = load(() => import('./modules/NotFound.js'));

function ScreenFallback(): JSX.Element {
  return (
    <div style={{ padding: 'var(--space-2) 0' }}>
      <SkeletonList rows={4} />
    </div>
  );
}

/** System-only routes send a Singlet Mode account somewhere useful instead of erroring. */
function SystemOnly({ children }: { children: JSX.Element }): JSX.Element {
  const { settings } = useAuth();
  const location = useLocation();
  if (settings.mode !== 'system') {
    return <Navigate to="/" replace state={{ blocked: location.pathname }} />;
  }
  return children;
}

function AppRoutes(): JSX.Element {
  const { status, user } = useAuth();

  useEffect(() => {
    if (status !== 'authenticated') return;
    const stopSync = startSyncWatchers();
    const stopRealtime = startRealtime();
    void syncEngine.run();
    return () => {
      stopSync();
      stopRealtime();
    };
  }, [status]);

  if (status === 'loading') {
    return (
      <>
        <Atmosphere />
        <div className="auth-screen">
          <div className="auth-card" aria-busy="true">
            <SkeletonList rows={3} />
          </div>
        </div>
      </>
    );
  }

  if (status === 'anonymous') return <AuthScreens />;
  if (user && !user.onboardedAt) return <Onboarding />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="whos-there" element={<SystemOnly><WhosThere /></SystemOnly>} />
        <Route path="quick-front" element={<SystemOnly><QuickFront /></SystemOnly>} />
        <Route path="fronting" element={<SystemOnly><Fronting /></SystemOnly>} />
        <Route path="stats" element={<SystemOnly><Stats /></SystemOnly>} />
        <Route path="members" element={<SystemOnly><Members /></SystemOnly>} />
        <Route path="members/:id" element={<SystemOnly><MemberProfile /></SystemOnly>} />
        <Route path="profiles" element={<SystemOnly><ProfileSelect /></SystemOnly>} />
        <Route path="organize" element={<SystemOnly><Organize /></SystemOnly>} />
        <Route path="subsystems" element={<SystemOnly><Subsystems /></SystemOnly>} />
        <Route path="system-history" element={<SystemOnly><SystemHistory /></SystemOnly>} />
        <Route path="relationships" element={<SystemOnly><Relationships /></SystemOnly>} />
        <Route path="headspace" element={<SystemOnly><Headspace /></SystemOnly>} />
        <Route path="system-chat" element={<SystemOnly><SystemChat /></SystemOnly>} />
        <Route path="bulletin" element={<SystemOnly><Bulletin /></SystemOnly>} />
        <Route path="polls" element={<SystemOnly><Polls /></SystemOnly>} />

        <Route path="journal" element={<Journal />} />
        <Route path="notes" element={<Notes />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="media" element={<Media />} />
        <Route path="flags" element={<Flags />} />
        <Route path="achievements" element={<Achievements />} />
        <Route path="daily-summary" element={<DailySummary />} />

        <Route path="wellbeing" element={<Wellbeing />} />
        <Route path="emotions" element={<Emotions />} />
        <Route path="body-map" element={<BodyMap />} />
        <Route path="emotion-insights" element={<EmotionInsights />} />
        <Route path="sleep" element={<Sleep />} />
        <Route path="fitness" element={<Fitness />} />
        <Route path="cycle" element={<Cycle />} />
        <Route path="finances" element={<Finances />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="emergency" element={<EmergencyContacts />} />
        <Route path="locations" element={<Locations />} />
        <Route path="work" element={<Work />} />
        <Route path="vault" element={<Vault />} />

        <Route path="constellations" element={<Constellations />} />
        <Route path="constellations/:handle" element={<ConstellationProfile />} />
        <Route path="friends" element={<Friends />} />
        <Route path="flux" element={<Flux />} />
        <Route path="flux/:id" element={<Flux />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:threadId" element={<Messages />} />
        <Route path="notifications" element={<NotificationCentre />} />

        <Route path="music" element={<Music />} />
        <Route path="video" element={<Video />} />
        <Route path="fics" element={<FicTracker />} />
        <Route path="characters" element={<Characters />} />
        <Route path="stories" element={<Stories />} />
        <Route path="stories/:id" element={<StoryWorkspace />} />
        <Route path="resources" element={<Resources />} />
        <Route path="dictionary" element={<Dictionary />} />
        <Route path="templates" element={<Templates />} />

        <Route path="import" element={<ImportCentre />} />
        <Route path="backup" element={<Backup />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/:section" element={<Settings />} />
        <Route path="help" element={<Help />} />
        <Route path="features" element={<Features />} />
        <Route path="search" element={<Search />} />
        <Route path="more" element={<More />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App(): JSX.Element {
  usePreAuthTheme();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <I18nProvider>
            <ThemeProvider>
              <ToastProvider>
                <DataProvider>
                  <Suspense fallback={<ScreenFallback />}>
                    <AppRoutes />
                  </Suspense>
                </DataProvider>
              </ToastProvider>
            </ThemeProvider>
          </I18nProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
