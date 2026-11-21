import { useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { PageContainer } from '#components/page-container';

/**
 * OA URLs and client credentials are configured via
 * packages/apps/app-meeting/.env only. This route remains so old bookmarks
 * redirect instead of 404.
 */
export default function MeetingIntegrationsPage(): ReactElement {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate('/meetings', { replace: true });
  }, [navigate]);
  return <PageContainer />;
}
