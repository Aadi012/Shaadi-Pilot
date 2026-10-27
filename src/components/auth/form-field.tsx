'use client';

import { useState } from 'react';
import type { AuthFieldName } from './auth-validation';
import styles from './auth.module.css';

export function FormField({
  name,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  value,
  error,
  hint,
  onChange,
  maxLength,
}: {
  name: AuthFieldName;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  placeholder: string;
  value: string;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  const describedBy =
    [hint ? name + '-hint' : '', error ? name + '-error' : '']
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={name}>{label}</label>
      <div className={styles.inputWrap}>
        <svg
          className={styles.inputIcon}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {type === 'email' ? (
            <path d="M3 5h18v14H3V5Zm0 1 9 7 9-7" />
          ) : password ? (
            <path d="M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2" />
          ) : (
            <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2" />
          )}
        </svg>
        <input
          id={name}
          name={name}
          type={password && visible ? 'text' : type}
          autoComplete={autoComplete}
          autoCapitalize={type === 'email' ? 'none' : undefined}
          spellCheck={type === 'email' || password ? false : undefined}
          className={password ? styles.passwordInput : undefined}
          placeholder={placeholder}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        {password && (
          <button
            type="button"
            className={styles.visibilityToggle}
            aria-label={
              (visible ? 'Hide ' : 'Show ') +
              (name === 'confirmPassword' ? 'confirm password' : 'password')
            }
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {visible && <path d="m3 3 18 18" />}
            </svg>
          </button>
        )}
      </div>
      {hint && (
        <p id={name + '-hint'} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={name + '-error'} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
