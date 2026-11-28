import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { ArrowRightIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { can: canOpenMeetings } = useCan({
    resource: { type: 'page', id: 'meetings' },
    action: 'access',
  });

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <section className='flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 md:p-10'>
        <p className='text-sm font-medium text-primary'>{t('home.platform')}</p>
        <h1 className='font-heading text-3xl font-semibold tracking-[-0.035em] text-balance md:text-4xl'>
          {t('home.title')}
        </h1>
        <p className='text-base leading-7 text-muted-foreground'>
          {t('home.description')}
        </p>
        {canOpenMeetings ? (
          <Link
            to='/meetings'
            className='inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline'
          >
            {t('meetings.title')}
            <ArrowRightIcon className='size-4' aria-hidden />
          </Link>
        ) : null}
      </section>
    </PageContainer>
  );
}
