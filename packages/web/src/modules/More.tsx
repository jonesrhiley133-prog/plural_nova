import { useNavigate } from 'react-router-dom';
import { categoriesForMode } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useI18n } from '../core/i18n.js';
import { useBadges } from '../core/badges.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Badge, Button, Card } from '../ui/primitives.js';
import { Icon, iconOr } from '../ui/Icon.js';

/**
 * Everything.
 *
 * The mobile counterpart to the desktop rail — the whole navigation map on one
 * screen, in the same order and with the same terminology.
 */
export default function More(): JSX.Element {
  const navigate = useNavigate();
  const { settings, user, signOut } = useAuth();
  const { term } = useI18n();
  const badges = useBadges();

  const categories = categoriesForMode(settings.mode);

  return (
    <>
      <PageHeader title="Everything" />

      <Card
        interactive
        onClick={() => navigate('/settings/account')}
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <div className="row row--nowrap">
          <Avatar name={user?.displayName ?? 'You'} size={44} round />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 'var(--weight-medium)' }}>{user?.displayName}</div>
            <div className="tiny faint truncate">
              {user?.isGuest ? 'Demo account' : user?.email || 'Signed in'}
            </div>
          </div>
          <Icon name="chevronRight" size={16} />
        </div>
      </Card>

      <div className="stack stack--loose">
        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="section-heading__label" style={{ marginBottom: 'var(--space-2)' }}>
              {term(category.label)}
            </h2>
            <Card flush>
              <div className="list">
                {category.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="list-row"
                    onClick={() => navigate(item.path)}
                  >
                    <Icon name={iconOr(item.icon)} size={18} />
                    <span className="list-row__body">
                      <span className="list-row__title">{term(item.label)}</span>
                      {item.description ? (
                        <span className="list-row__meta">{term(item.description)}</span>
                      ) : null}
                    </span>
                    <span className="list-row__trailing">
                      {item.badge ? <Badge count={badges[item.badge] ?? 0} /> : null}
                      <Icon name="chevronRight" size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </section>
        ))}
      </div>

      <div className="row" style={{ marginTop: 'var(--space-6)', justifyContent: 'center' }}>
        <Button variant="ghost" icon="logout" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </>
  );
}
