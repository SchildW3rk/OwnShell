import React from 'react';
import type { RequestBodyType } from '@ownshell/core';
import { cn } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { BODY_TYPES } from './body-types';

interface BodyTypeSelectorProps {
  value: RequestBodyType;
  onChange: (type: RequestBodyType) => void;
}

export const BodyTypeSelector: React.FC<BodyTypeSelectorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-secondary/50">
      {BODY_TYPES.map((type) => (
        <button
          key={type.value}
          type="button"
          onClick={() => onChange(type.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            value === type.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          {t(`api.body.types.${type.value}`, type.label)}
        </button>
      ))}
    </div>
  );
};
