import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
import { AuthForm } from './auth-form';
import { validateAuthForm, type AuthFormValues } from './auth-validation';

const valid: AuthFormValues = {
  fullName: 'अनन्या शर्मा',
  email: 'ananya@example.test',
  password: 'Example celebration!',
  confirmPassword: 'Example celebration!',
};

describe('account form validation', () => {
  it('reports every missing signup field with fixed, actionable messages', () => {
    expect(
      validateAuthForm('signup', {
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
      }),
    ).toEqual({
      fullName: 'Enter your full name (up to 100 characters).',
      email: 'Enter a valid email address.',
      password: 'Use 15–128 characters for your password.',
      confirmPassword: 'Confirm your password.',
    });
  });

  it('accepts Unicode names and surrounding email whitespace without mutating values', () => {
    const values = {
      ...valid,
      email: '  ananya@example.test  ',
      password: '  meaningful spaces  ',
      confirmPassword: '  meaningful spaces  ',
    };
    const original = { ...values };
    expect(validateAuthForm('signup', values)).toEqual({});
    expect(values).toEqual(original);
  });

  it('rejects malformed email addresses without echoing input', () => {
    for (const email of [
      'not-an-email',
      'name@',
      'name@bad..test',
      'name with space@example.test',
    ]) {
      const errors = validateAuthForm('signup', { ...valid, email });
      expect(errors.email).toBe('Enter a valid email address.');
      expect(JSON.stringify(errors)).not.toContain(email);
    }
  });

  it('applies the signup length policy to signup, not existing-user login', () => {
    expect(
      validateAuthForm('signup', {
        ...valid,
        password: 'short',
        confirmPassword: 'short',
      }).password,
    ).toBeTruthy();
    expect(
      validateAuthForm('login', {
        ...valid,
        fullName: '',
        password: 'short',
        confirmPassword: '',
      }),
    ).toEqual({});
  });

  it('detects confirmation mismatches and accepts the corrected value', () => {
    expect(
      validateAuthForm('signup', {
        ...valid,
        confirmPassword: 'another value',
      }).confirmPassword,
    ).toBe('Your passwords do not match.');
    expect(validateAuthForm('signup', valid)).toEqual({});
  });

  it('does not accept whitespace-only names or short passwords', () => {
    const errors = validateAuthForm('signup', {
      ...valid,
      fullName: '  ',
      password: 'short',
      confirmPassword: 'short',
    });
    expect(errors.fullName).toBe(
      'Enter your full name (up to 100 characters).',
    );
    expect(errors.password).toBe('Use 15–128 characters for your password.');
  });
});

describe('account form before JavaScript hydration', () => {
  for (const mode of ['login', 'signup'] as const) {
    it(
      'keeps ' +
        mode +
        ' controls disabled so the native form cannot transmit credentials',
      () => {
        const html = renderToStaticMarkup(createElement(AuthForm, { mode }));
        expect(html).toMatch(/<fieldset\b[^>]*\bdisabled=/);
        expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*disabled=/);
        expect(html).toContain('value=""');
        expect(html).not.toContain('Account access preview');
        expect(html).not.toContain('Account created');
      },
    );
  }
});
