import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { CAPABILITY_GUIDE_ACCESS } from '@nocobase/app-plugin-foundation/client';
import {
  ArrowRightIcon,
  SparklesIcon,
  ShieldCheckIcon,
  PaperclipIcon,
  GitBranchIcon,
  BellIcon,
  CalendarClockIcon,
  type LucideIcon,
} from 'lucide-react';
import { type ReactElement } from 'react';
import { Link } from 'react-router';
import {
  CAPABILITY_GUIDE_PATH,
  capabilityPath,
  createCapabilityCatalog,
  entryContent,
  format,
  guideContent,
  type CatalogEntry,
  type GuideContent,
} from '@nocobase/app-plugin-foundation/capability-guide';

import applicationManifest from '../../../package.json' with { type: 'json' };

import { PageContainer } from '#components/page-container';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

const catalog = createCapabilityCatalog(applicationManifest);
const HOME_ICONS: Readonly<Record<string, LucideIcon>> = {
  'app-plugin-authorization': ShieldCheckIcon,
  'app-plugin-file': PaperclipIcon,
  lifecycle: GitBranchIcon,
  'app-plugin-notification': BellIcon,
  'app-plugin-scheduler': CalendarClockIcon,
};

export default function HomePage(): ReactElement {
  const { i18n, t } = useTranslation();
  const content = guideContent(i18n.language);
  const { can: canBrowseCapabilities } = useCan(CAPABILITY_GUIDE_ACCESS);
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
      <section
        aria-labelledby='home-capabilities'
        className='flex flex-col gap-4'
      >
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div className='flex flex-col gap-1'>
            <h2 id='home-capabilities' className='text-base font-medium'>
              {content.home.title}
            </h2>
            {canBrowseCapabilities ? (
              <p className='text-sm text-muted-foreground'>
                {content.home.description}
              </p>
            ) : null}
          </div>
          {canBrowseCapabilities ? (
            <Link
              to={CAPABILITY_GUIDE_PATH}
              className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'
            >
              {format(content.home.viewAll, { count: catalog.entries.length })}
              <ArrowRightIcon className='size-4' aria-hidden />
            </Link>
          ) : null}
        </div>
        <ul className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          {catalog.featured.map((entry) => (
            <li key={entry.id} className='flex'>
              <CapabilityCard
                entry={entry}
                content={content}
                canBrowse={canBrowseCapabilities}
              />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}

function CapabilityCard({
  entry,
  content,
  canBrowse,
}: {
  readonly entry: CatalogEntry;
  readonly content: GuideContent;
  readonly canBrowse: boolean;
}): ReactElement {
  const text = entryContent(content, entry);
  const Icon = HOME_ICONS[entry.id] ?? SparklesIcon;

  const card = (
    <Card className='w-full transition-[translate,box-shadow,background-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-hover group-hover:shadow-md motion-reduce:transition-none motion-reduce:group-hover:translate-y-0'>
      <CardHeader className='gap-3'>
        <span className='flex size-9 items-center justify-center rounded-lg bg-primary/5 text-primary ring-1 ring-transparent transition-[background-color,box-shadow] duration-200 ease-out group-hover:bg-primary/10 group-hover:ring-border motion-reduce:transition-none'>
          <Icon
            className='size-4 transition-transform duration-200 ease-out group-hover:scale-110 motion-reduce:transition-none'
            aria-hidden
          />
        </span>
        <div className='flex flex-col gap-1'>
          <CardTitle>{text.title}</CardTitle>
          <CardDescription className='leading-6'>
            {text.summary}
          </CardDescription>
        </div>
      </CardHeader>
      {canBrowse ? (
        <CardFooter className='mt-auto justify-between text-sm text-muted-foreground transition-colors duration-200 ease-out group-hover:text-foreground'>
          {content.home.open}
          <ArrowRightIcon
            className='size-4 transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transition-none'
            aria-hidden
          />
        </CardFooter>
      ) : null}
    </Card>
  );

  return canBrowse ? (
    <Link
      to={capabilityPath(entry.id)}
      className='group flex w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      {card}
    </Link>
  ) : (
    card
  );
}
