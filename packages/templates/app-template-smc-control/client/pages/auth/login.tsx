import { resolveAppUrl, useClientApplication } from '@nocobase/app-client';
import {
  useAuthentication,
  usePasswordResetCapability,
  useSignUpAvailable,
} from '@nocobase/app-plugin-authentication/client';
import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { Link } from 'react-router';

import { PasswordLoginForm } from '#extensions/nocobase-auth-forms/password-login-form';
import { AuthMethods } from '#extensions/nocobase-auth-methods/auth-methods';

import '../../casdoor-public-config.js';
import { AuthPage } from './shared.js';

export default function LoginPage(): ReactElement {
  const { t } = useTranslation();
  const login = usePasswordLogin();
  // The sign-up link follows the server: it is hidden while `auth.emailAndPassword` turns sign-up off.
  const signUpAvailable = useSignUpAvailable();
  const resetCapability = usePasswordResetCapability();
  const { client } = useAuthentication();
  const browserSignIn =
    useClientApplication().config.public.get(
      'casdoorIdentity.browserSignIn',
    ) === true;

  const signInWithCasdoor = useCallback(() => {
    // better-auth 1.7.5: `genericOAuth` providers are social providers (`signIn.social`), not `signIn.oauth2`.
    void client.signIn.social({
      provider: 'casdoor',
      callbackURL: resolveAppUrl('/'),
    });
  }, [client]);

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
                error={login.error?.message}
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
                submitting={login.isPending}
              />
            ),
            id: 'password',
            label: t('auth.password'),
          },
        ]}
        providers={
          browserSignIn
            ? [
                {
                  id: 'casdoor',
                  label: t('auth.casdoor'),
                  onClick: signInWithCasdoor,
                },
              ]
            : []
        }
      />
    </AuthPage>
  );
}
