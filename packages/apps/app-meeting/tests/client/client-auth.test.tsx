import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import LoginPage from '../../client/pages/auth/login.tsx';
import ForgotPasswordPage from '../../client/pages/auth/forgot-password.tsx';
import RegisterPage from '../../client/pages/auth/register.tsx';

const passwordLoginAction = vi.hoisted(() => ({
  error: undefined as { message: string } | undefined,
  isPending: false,
  submit: vi.fn(),
}));

const signUpAvailable = vi.hoisted(() => ({ value: true }));
const resetCapability = vi.hoisted(() => ({
  data: { passwordResetAvailable: true } as
    { passwordResetAvailable: boolean } | undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
const passwordResetRequest = vi.hoisted(() => ({
  isPending: false,
  isSuccess: false,
  submit: vi.fn(),
}));

const oaLogin = vi.hoisted(() => ({
  status: { enabled: false, oaLoginUrl: 'https://oa.example.invalid/login' },
  statusLoading: false,
  isPending: false,
  error: undefined as string | undefined,
  submit: vi.fn(),
}));

vi.mock('../../client/auth/oa-ltpa/use-oa-ltpa-login.js', () => ({
  useOaLtpaLogin: () => oaLogin,
}));

vi.mock('@nocobase/app-plugin-authentication/client/actions', () => ({
  usePasswordLogin: () => passwordLoginAction,
  usePasswordRegistration: () => ({ isPending: false, submit: vi.fn() }),
  usePasswordResetRequest: () => passwordResetRequest,
}));

const casdoor = vi.hoisted(() => ({ enabled: false, social: vi.fn() }));

vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useClientApplication: () => ({
    config: { public: { get: () => casdoor.enabled } },
  }),
}));

vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ client: { signIn: { social: casdoor.social } } }),
  useSignUpAvailable: () => signUpAvailable.value,
  usePasswordResetCapability: () => resetCapability,
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: 'app', resources: enUS },
});

function renderAt(path: string, page: ReactElement) {
  return render(
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={page} path={path.split('?')[0]} />
          <Route element={<p>Login route</p>} path='/login' />
        </Routes>
      </MemoryRouter>
    </TestI18nProvider>,
  );
}

describe('application authentication pages', () => {
  it.each([
    ['/meetings?view=mine#upcoming', '/main/meetings?view=mine#upcoming'],
    ['//other.example.test/collect', '/main/'],
  ])(
    'starts Casdoor with an application-local return for %s',
    async (destination, expected) => {
      casdoor.enabled = true;
      casdoor.social.mockRejectedValue(new Error('secret provider detail'));
      try {
        renderAt(
          `/?redirect=${encodeURIComponent(destination)}`,
          <LoginPage />,
        );
        fireEvent.click(
          screen.getByRole('button', { name: 'Continue with Casdoor' }),
        );
        expect(casdoor.social).toHaveBeenCalledWith({
          provider: 'casdoor',
          callbackURL: expected,
          errorCallbackURL: expect.stringMatching(
            /^\/main\/login\?casdoor=failed/,
          ),
        });
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Casdoor sign-in could not be completed',
        );
        expect(
          screen.queryByText('secret provider detail'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
      } finally {
        casdoor.enabled = false;
        casdoor.social.mockReset();
      }
    },
  );

  it('shows generic failure feedback after a Casdoor callback', () => {
    casdoor.enabled = true;
    try {
      renderAt('/?casdoor=failed&error_description=raw-detail', <LoginPage />);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Casdoor sign-in could not be completed',
      );
      expect(screen.queryByText('raw-detail')).not.toBeInTheDocument();
    } finally {
      casdoor.enabled = false;
    }
  });

  it('offers OA login only when enabled and submits the OA action', () => {
    oaLogin.status.enabled = true;
    oaLogin.submit.mockClear();
    try {
      renderAt('/', <LoginPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Continue with OA' }));
      expect(oaLogin.submit).toHaveBeenCalledOnce();
      expect(
        screen.getByRole('link', { name: 'Open the OA login page' }),
      ).toHaveAttribute('href', 'https://oa.example.invalid/login');
    } finally {
      oaLogin.status.enabled = false;
      oaLogin.submit.mockReset();
    }
  });

  it('wires the login form to the plugin authentication action', async () => {
    passwordLoginAction.submit.mockClear();
    renderAt('/', <LoginPage />);

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Continue with OA' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Username or email'), {
      target: { value: 'alice' },
    });
    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password' } });

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordLoginAction.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(passwordLoginAction.submit).toHaveBeenCalledWith({
        identifier: 'alice',
        password: 'password',
      });
    });
    expect(
      screen.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('puts the brand panel beside the form on wide screens', () => {
    renderAt('/', <LoginPage />);
    const panel = screen.getByRole('complementary', {
      name: 'About this application',
    });
    expect(panel).toHaveClass('hidden', 'xl:block');
    expect(panel).toHaveTextContent('AI-native application platform');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent(
      /^AI \+ NocoBase\s*Build reliable business systems$/,
    );
    expect(panel).toHaveTextContent('AI-native frontend');
    expect(panel).toHaveTextContent('NocoBase foundation');
    expect(panel).toHaveTextContent('Freedom above. Confidence below.');
  });

  it('shows the action error', () => {
    passwordLoginAction.error = { message: 'Invalid username or password.' };
    renderAt('/', <LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Invalid username or password.',
    );
    passwordLoginAction.error = undefined;
  });

  it('offers sign-up only while the server accepts it', () => {
    signUpAvailable.value = false;
    const { unmount } = renderAt('/', <LoginPage />);
    expect(
      screen.queryByRole('link', { name: 'Sign up' }),
    ).not.toBeInTheDocument();
    unmount();

    signUpAvailable.value = true;
    renderAt('/', <LoginPage />);
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('hides password recovery when it is not available', () => {
    resetCapability.data = { passwordResetAvailable: false };
    renderAt('/', <LoginPage />);
    expect(
      screen.queryByRole('link', { name: 'Forgot password?' }),
    ).not.toBeInTheDocument();
    resetCapability.data = { passwordResetAvailable: true };
  });

  it('shows the administrator contact message on direct access while recovery is disabled', () => {
    resetCapability.data = { passwordResetAvailable: false };
    renderAt('/forgot-password', <ForgotPasswordPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Self-service password reset is not enabled',
    );
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    resetCapability.data = { passwordResetAvailable: true };
  });

  it('shows loading, retries a failed capability request, and restores the form', () => {
    resetCapability.data = undefined;
    resetCapability.isPending = true;
    resetCapability.isError = false;
    const { rerender } = renderAt('/forgot-password', <ForgotPasswordPage />);
    expect(screen.getByLabelText('Loading')).toBeVisible();

    resetCapability.isPending = false;
    resetCapability.isError = true;
    rerender(
      <TestI18nProvider runtime={runtime}>
        <MemoryRouter initialEntries={['/forgot-password']}>
          <Routes>
            <Route element={<ForgotPasswordPage />} path='/forgot-password' />
          </Routes>
        </MemoryRouter>
      </TestI18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(resetCapability.refetch).toHaveBeenCalled();

    resetCapability.data = { passwordResetAvailable: true };
    resetCapability.isPending = false;
    resetCapability.isError = false;
    passwordResetRequest.submit.mockClear();
    rerender(
      <TestI18nProvider runtime={runtime}>
        <MemoryRouter initialEntries={['/forgot-password']}>
          <Routes>
            <Route element={<ForgotPasswordPage />} path='/forgot-password' />
          </Routes>
        </MemoryRouter>
      </TestI18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(passwordResetRequest.submit).toHaveBeenCalledWith({
      email: 'person@example.com',
    });
  });

  it('sends a visitor back to sign-in while sign-up is off', () => {
    signUpAvailable.value = false;
    renderAt('/register', <RegisterPage />);
    expect(screen.getByText('Login route')).toBeVisible();
    signUpAvailable.value = true;
  });
});
