import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import * as AuthContext from '../contexts/AuthContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockLogin = vi.fn();
const mockRegister = vi.fn();

const mockAuthContext: AuthContext.AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: mockLogin,
  register: mockRegister,
  logout: vi.fn(),
  refreshUser: vi.fn(),
  hasRole: vi.fn(),
  hasAnyRole: vi.fn(),
};

vi.spyOn(AuthContext, 'useAuth').mockReturnValue(mockAuthContext);

function renderLoginPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form by default', () => {
    renderLoginPage();

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits login form with valid credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('displays error when login fails', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i);
    });
  });

  it('switches to registration mode', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /need an account\? register/i }));

    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('submits registration form with valid data', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue(undefined);
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /need an account\? register/i }));

    await user.type(screen.getByLabelText(/display name/i), 'New User');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'New User', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('requires display name in registration mode', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /need an account\? register/i }));

    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');

    const displayNameField = screen.getByLabelText(/display name/i);
    await user.clear(displayNameField);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const alert = screen.queryByRole('alert');
      if (alert) {
        expect(alert).toHaveTextContent(/display name is required/i);
      }
    });

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('switches back to login mode from registration', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /need an account\? register/i }));
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /already have an account\? sign in/i }));
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('disables submit button while submitting', async () => {
    const user = userEvent.setup();
    let resolveLogin: ((value?: void) => void) | undefined;
    mockLogin.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveTextContent(/please wait/i);

    resolveLogin?.();

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });
});
