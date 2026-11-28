import { resolveAppUrl, useClientApplication } from '@nocobase/app-client';
import {
  useAuthentication,
  usePasswordResetCapability,
  useSignUpAvailable,
} from '@nocobase/app-plugin-authentication/client';
import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { PasswordLoginForm } from '#extensions/nocobase-auth-forms/password-login-form';
import { AuthMethods } from '#extensions/nocobase-auth-methods/auth-methods';

import '../../auth/casdoor-public-config.js';
import { useOaLtpaLogin } from '../../auth/oa-ltpa/use-oa-ltpa-login.js';
import { safeReturnTo } from '../../lib/return-to.js';
import { AuthPage } from './shared.js';

export default function LoginPage(): ReactElement {
  const { t } = useTranslation();
  const login = usePasswordLogin();
  const oaLogin = useOaLtpaLogin();
  const { client } = useAuthentication();
  const [search] = useSearchParams();
  const showCasdoor =
    useClientApplication().config.public.get(
      'casdoorIdentity.browserSignIn',
    ) === true;
  const casdoorInFlightRef = useRef(false);
  const [casdoorPending, setCasdoorPending] = useState(false);
  const [casdoorFailed, setCasdoorFailed] = useState(
    search.get('casdoor') === 'failed',
  );

  async function signInWithCasdoor() {
    if (!showCasdoor || casdoorInFlightRef.current) return;
    casdoorInFlightRef.current = true;
    setCasdoorPending(true);
    setCasdoorFailed(false);
    const destination = safeReturnTo(search.get('redirect'));
    const failure = new URLSearchParams({ casdoor: 'failed' });
    if (destination) failure.set('redirect', destination);
    try {
      const result = await client.signIn.social({
        provider: 'casdoor',
        callbackURL: resolveAppUrl(destination ?? '/'),
        errorCallbackURL: resolveAppUrl(`/login?${failure}`),
      });
      if (result.error || !result.data?.url) setCasdoorFailed(true);
    } catch {
      setCasdoorFailed(true);
    } finally {
      casdoorInFlightRef.current = false;
      setCasdoorPending(false);
    }
  }

  // The sign-up link follows the server: it is hidden while `auth.emailAndPassword` turns sign-up off.
  const signUpAvailable = useSignUpAvailable();
  const resetCapability = usePasswordResetCapability();
  const showOa =
    oaLogin.status?.enabled === true && oaLogin.statusLoading === false;

  return (
    <AuthPage
      className='auth-login-page'
      description={t('auth.loginDescription')}
      title={t('auth.welcome')}
    >
      {/* Add another sign-in method to `methods`, or SSO buttons as `providers`; the guest route redirects once
          the session exists. */}
      <AuthMethods
        labels={{
          continueWith: t('auth.continueWith'),
          methods: t('auth.methods'),
          separator: t('auth.or'),
        }}
        methods={[
          {
            content: (
              <PasswordLoginForm
                error={login.error?.message ?? oaLogin.error}
                footer={
                  signUpAvailable ? (
                    <>
                      {t('auth.noAccount')}{' '}
                      <Link to='/register'>{t('auth.signUp')}</Link>
                    </>
                  ) : undefined
                }
                forgotPasswordLink={
                  resetCapability.data?.passwordResetAvailable === true ? (
                    <Link to='/forgot-password'>{t('auth.forgotLink')}</Link>
                  ) : undefined
                }
                labels={{
                  hidePassword: t('auth.hidePassword'),
                  identifier: t('auth.identifier'),
                  password: t('auth.password'),
                  showPassword: t('auth.showPassword'),
                  submit: t('auth.signIn'),
                  submitting: t('auth.signingIn'),
                }}
                onSubmit={login.submit}
                submitting={login.isPending || oaLogin.isPending}
              />
            ),
            id: 'password',
            label: t('auth.password'),
          },
        ]}
        providers={[
          ...(showCasdoor
            ? [
                {
                  id: 'casdoor',
                  label: t('meetingCasdoor.providerLabel'),
                  disabled: casdoorPending,
                  onClick: () => {
                    void signInWithCasdoor();
                  },
                },
              ]
            : []),
          ...(showOa
            ? [
                {
                  id: 'oa-ltpa',
                  label: oaLogin.isPending
                    ? t('meetingOaSso.signingIn')
                    : t('meetingOaSso.providerLabel'),
                  disabled: oaLogin.isPending,
                  onClick: () => {
                    void oaLogin.submit();
                  },
                },
              ]
            : []),
        ]}
      />
      {showCasdoor && casdoorFailed ? (
        <p className='text-destructive mt-4 text-center text-sm' role='alert'>
          {t('meetingCasdoor.signInFailed')}
        </p>
      ) : null}
      {showOa && oaLogin.status?.oaLoginUrl ? (
        <p className='text-muted-foreground mt-4 text-center text-sm'>
          <a
            className='underline underline-offset-4'
            href={oaLogin.status.oaLoginUrl}
            rel='noopener noreferrer'
            target='_blank'
          >
            {t('meetingOaSso.openOaLogin')}
          </a>
        </p>
      ) : null}
    </AuthPage>
  );
}
