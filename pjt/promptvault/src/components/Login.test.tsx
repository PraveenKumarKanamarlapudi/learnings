import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login';

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (status: number, body: object) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body }));

describe('Login', () => {
  it('shows the server error and clears the field on a wrong password', async () => {
    stubFetch(401, { error: 'Incorrect password' });
    const onSuccess = vi.fn();
    render(<Login onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onSuccess after a correct password', async () => {
    stubFetch(200, { ok: true });
    const onSuccess = vi.fn();
    render(<Login onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText('Password'), 'right-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('disables sign-in until something is typed', () => {
    render(<Login onSuccess={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});
