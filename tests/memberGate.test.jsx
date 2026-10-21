// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemberGate } from '../src/components/MemberAccess.jsx';
import { DateLangToggle } from '../src/components/MonthNavigator.jsx';
import { SettingsProvider } from '../src/hooks/useSettings.jsx';

afterEach(cleanup);

describe('member sign-in screen', () => {
  it('asks only for mobile number and password — never an email address', () => {
    render(<MemberGate />);
    const form = screen.getByRole('form', { name: 'सदस्य साइन इन' });
    const inputs = [...form.querySelectorAll('input')];
    expect(inputs.map((i) => i.type)).toEqual(['tel', 'password']);
    expect(form.querySelector('input[type="email"]')).toBeNull();
    expect(form.textContent).not.toMatch(/ईमेल|email/i);
  });

  it('opens the access request form (no account needed) and back', () => {
    render(<MemberGate />);
    fireEvent.click(screen.getByRole('button', { name: /पहुँच का अनुरोध/ }));
    const form = screen.getByRole('form', { name: 'पहुँच का अनुरोध' });
    expect(form.querySelector('input[type="email"]')).toBeNull();
    expect(screen.getByRole('combobox', { name: /जिला/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'वापस साइन इन पर' }));
    expect(screen.getByRole('form', { name: 'सदस्य साइन इन' })).toBeTruthy();
  });
});

describe('MINOR_UI_CHANGES.md — Change 1', () => {
  it('the date-language toggle shows the full language name', () => {
    render(
      <SettingsProvider>
        <DateLangToggle />
      </SettingsProvider>,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('English');
    fireEvent.click(button);
    expect(button.textContent).toBe('हिंदी');
  });
});
