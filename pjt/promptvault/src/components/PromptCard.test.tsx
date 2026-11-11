import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Prompt } from '../../shared/schema';
import { PromptCard } from './PromptCard';

const p: Prompt = {
  id: '1', title: 'Review my driver', description: 'Checks ISR safety', content: 'x {{CODE}}', categoryId: 2, category: 'Embedded Systems', subcategory: 'Device Drivers',
  promptType: 'User Prompt', platforms: ['Claude / Claude Code', 'Cursor'], tags: ['misra'], variables: ['CODE'], variants: {}, version: 3, author: 'Me',
  isFavorite: false, usageCount: 4, lastUsedAt: null, notes: '', expectedOutput: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('PromptCard', () => {
  it('shows key metadata', () => {
    render(<PromptCard p={p} onOpen={() => {}} onCopy={() => {}} onFavorite={() => {}} />);
    expect(screen.getByText('Embedded Systems / Device Drivers')).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('4 uses')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  it('wires open, copy and favorite to separate handlers', async () => {
    const onOpen = vi.fn(), onCopy = vi.fn(), onFavorite = vi.fn();
    render(<PromptCard p={p} onOpen={onOpen} onCopy={onCopy} onFavorite={onFavorite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(onFavorite).toHaveBeenCalledWith(p);
    expect(onCopy).toHaveBeenCalledWith(p);
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Review my driver' }));
    expect(onOpen).toHaveBeenCalledWith(p);
  });
});
