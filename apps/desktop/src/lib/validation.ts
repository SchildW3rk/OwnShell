/**
 * Shared Validation Utilities
 *
 * Common validation functions used across screens
 */

/**
 * Master password validation error keys (i18n)
 */
type PasswordValidationKey =
  | 'setup.errorLength'
  | 'setup.errorUppercase'
  | 'setup.errorLowercase'
  | 'setup.errorNumber'
  | 'setup.errorMismatch';

/**
 * Validate a master password against OwnShell requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - Optionally confirm it matches a confirmation value
 *
 * @returns The i18n key for the first failed rule, or null if valid
 */
export function validateMasterPassword(
  password: string,
  confirmation?: string
): PasswordValidationKey | null {
  if (password.length < 8) return 'setup.errorLength';
  if (!/[A-Z]/.test(password)) return 'setup.errorUppercase';
  if (!/[a-z]/.test(password)) return 'setup.errorLowercase';
  if (!/[0-9]/.test(password)) return 'setup.errorNumber';
  if (confirmation !== undefined && password !== confirmation) return 'setup.errorMismatch';
  return null;
}
