/**
 * @ownshell/ui
 *
 * Shared React components for OwnShell
 * Dark Mode First, Modern Professional Design
 */

// Utilities
export * from './utils/cn';
export * from './utils/format';

// Components
export * from './components/Button';
export * from './components/Input'; // @deprecated - Legacy Input with label/helperText. Use FormField + FormInput instead.
export * from './components/Modal';
export * from './components/ConfirmDialog';
export * from './components/DropdownMenu';
export * from './components/Tabs';
export * from './components/DataTable';
export * from './components/DataTable/types';
export * from './components/DataTable/helpers';

// Form Components (NEW - v1.18.0)
export { FormField } from './components/Form/FormField';
export { Input as FormInput } from './components/Form/Input'; // New composable Input (use with FormField)
export * from './components/Form/Textarea';
export * from './components/Form/Select';
export * from './components/Form/Checkbox';
export * from './components/Form/AppSelect';
export * from './components/Form/AppCheckbox';
export * from './components/Form/SegmentedChoice';
export * from './components/Form/Label';
export * from './components/Badge';

// Layout Components (NEW - v1.18.0)
export * from './components/PageHeader';

// State Components (NEW - Phase 1)
export * from './components/LoadingState';
export * from './components/EmptyState';

// Generic UI Components (NEW - Phase 4)
export * from './components/TooltipButton';
export * from './components/StatusDot';
export * from './components/SectionHeader';
