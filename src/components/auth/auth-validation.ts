import { loginSchema, registerSchema } from '@/modules/auth/contracts';

export type AuthMode = 'login' | 'signup';
export type AuthFieldName =
  'fullName' | 'email' | 'password' | 'confirmPassword';
export type AuthFormValues = Record<AuthFieldName, string>;
export type AuthFormErrors = Partial<Record<AuthFieldName, string>>;

export function validateAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
): AuthFormErrors {
  const errors: AuthFormErrors = {};
  const input = {
    email: values.email,
    password: values.password,
    ...(mode === 'signup' ? { displayName: values.fullName } : {}),
  };
  const result = (mode === 'signup' ? registerSchema : loginSchema).safeParse(
    input,
  );
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field =
        issue.path[0] === 'displayName' ? 'fullName' : issue.path[0];
      if (field === 'fullName')
        errors.fullName = 'Enter your full name (up to 100 characters).';
      if (field === 'email') errors.email = 'Enter a valid email address.';
      if (field === 'password')
        errors.password =
          mode === 'signup'
            ? 'Use 15–128 characters for your password.'
            : 'Enter your password (up to 128 characters).';
    }
  }
  if (mode === 'signup') {
    if (!values.confirmPassword) {
      errors.confirmPassword = 'Confirm your password.';
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = 'Your passwords do not match.';
    }
  }
  return errors;
}
