import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { Assertion, AssertionType, Capture } from '../../../electron/http/runner-checks';

// Same list as ASSERTION_TYPES in runner-checks (that module also needs Node, so it is not imported here).
const TYPES: AssertionType[] = [
  'status-equals',
  'status-range',
  'header-exists',
  'header-equals',
  'json-equals',
  'json-exists',
  'json-contains',
  'time-below',
];
const HAS_TARGET = new Set<AssertionType>(['header-exists', 'header-equals', 'json-equals', 'json-exists', 'json-contains']);
const HAS_VALUE = new Set<AssertionType>(['status-equals', 'status-range', 'header-equals', 'json-equals', 'json-contains', 'time-below']);
const DEFAULT_VALUE: Partial<Record<AssertionType, string>> = { 'status-equals': '200', 'status-range': '200-299', 'time-below': '1000' };

export function parseChecks<T>(json: string | null | undefined): T[] {
  try {
    const items = JSON.parse(json || '[]') as unknown;
    return Array.isArray(items) ? (items as T[]) : [];
  } catch {
    return [];
  }
}

const inputClass =
  'h-7 min-w-0 rounded border border-border bg-secondary px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50';

interface RunnerChecksEditorProps {
  assertions: Assertion[];
  captures: Capture[];
  onAssertionsChange: (assertions: Assertion[]) => void;
  onCapturesChange: (captures: Capture[]) => void;
}

/** Declarative checks for the collection runner (no scripting). */
export const RunnerChecksEditor: React.FC<RunnerChecksEditorProps> = ({
  assertions,
  captures,
  onAssertionsChange,
  onCapturesChange,
}) => {
  const { t } = useTranslation();
  const updateAssertion = (id: string, patch: Partial<Assertion>) =>
    onAssertionsChange(assertions.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const updateCapture = (id: string, patch: Partial<Capture>) =>
    onCapturesChange(captures.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">{t('api.tests.assertions')}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onAssertionsChange([
                ...assertions,
                { id: crypto.randomUUID(), enabled: true, type: 'status-equals', target: '', value: '200' },
              ])
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('api.tests.addAssertion')}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{t('api.tests.hint')}</p>
        {assertions.map((assertion) => (
          <div key={assertion.id} className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={assertion.enabled}
              onChange={(event) => updateAssertion(assertion.id, { enabled: event.target.checked })}
              aria-label={t('api.tests.enabled')}
            />
            <select
              value={assertion.type}
              onChange={(event) => {
                const type = event.target.value as AssertionType;
                updateAssertion(assertion.id, { type, value: DEFAULT_VALUE[type] ?? assertion.value });
              }}
              aria-label={t('api.tests.type')}
              className={`${inputClass} w-44`}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`api.tests.types.${type}`)}
                </option>
              ))}
            </select>
            {HAS_TARGET.has(assertion.type) && (
              <input
                value={assertion.target}
                onChange={(event) => updateAssertion(assertion.id, { target: event.target.value })}
                placeholder={assertion.type.startsWith('json') ? t('api.tests.jsonPath') : t('api.tests.headerName')}
                aria-label={assertion.type.startsWith('json') ? t('api.tests.jsonPath') : t('api.tests.headerName')}
                className={`${inputClass} flex-1 font-mono`}
              />
            )}
            {HAS_VALUE.has(assertion.type) && (
              <input
                value={assertion.value}
                onChange={(event) => updateAssertion(assertion.id, { value: event.target.value })}
                placeholder={t('api.tests.expected')}
                aria-label={t('api.tests.expected')}
                className={`${inputClass} flex-1 font-mono`}
              />
            )}
            {!HAS_TARGET.has(assertion.type) && !HAS_VALUE.has(assertion.type) && <div className="flex-1" />}
            <button
              type="button"
              onClick={() => onAssertionsChange(assertions.filter((item) => item.id !== assertion.id))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">{t('api.tests.captures')}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onCapturesChange([...captures, { id: crypto.randomUUID(), enabled: true, variable: '', path: '' }])
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('api.tests.addCapture')}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{t('api.tests.capturesHint')}</p>
        {captures.map((capture) => (
          <div key={capture.id} className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={capture.enabled}
              onChange={(event) => updateCapture(capture.id, { enabled: event.target.checked })}
              aria-label={t('api.tests.enabled')}
            />
            <input
              value={capture.variable}
              onChange={(event) => updateCapture(capture.id, { variable: event.target.value })}
              placeholder={t('api.variables.name')}
              aria-label={t('api.variables.name')}
              className={`${inputClass} w-44 font-mono`}
            />
            <span className="text-xs text-muted-foreground">←</span>
            <input
              value={capture.path}
              onChange={(event) => updateCapture(capture.id, { path: event.target.value })}
              placeholder={t('api.tests.jsonPath')}
              aria-label={t('api.tests.jsonPath')}
              className={`${inputClass} flex-1 font-mono`}
            />
            <button
              type="button"
              onClick={() => onCapturesChange(captures.filter((item) => item.id !== capture.id))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};
