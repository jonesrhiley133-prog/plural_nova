import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Card } from '../ui/primitives.js';
import { EmptyState } from '../ui/feedback.js';

/** A page that is not here. Says so, and offers somewhere to go instead. */
export default function NotFound(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  return (
    <>
      <PageHeader title={t('error.notFound')} />
      <Card>
        <EmptyState
          icon="search"
          title={t('error.notFound')}
          body={`Nothing lives at ${location.pathname}. It may have been renamed, or the link may be out of date.`}
          action={{ label: 'Go to the dashboard', run: () => navigate('/') }}
          secondaryAction={{ label: 'Search instead', run: () => navigate('/search') }}
        />
      </Card>
    </>
  );
}
