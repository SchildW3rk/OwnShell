import React from 'react';
import { AppSelect } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import { DB_TYPE_LABELS, DB_TYPES } from './constants';
import type { DBType } from './types';

interface DatabaseTypeSelectorProps {
  value: DBType;
  onChange: (type: DBType) => void;
}

export const DatabaseTypeSelector: React.FC<DatabaseTypeSelectorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div>
      <span className="block text-sm font-medium text-foreground mb-1">
        {t('database.type', 'Database Type')} *
      </span>
      <AppSelect
        id="database-type"
        value={value}
        onChange={(nextValue) => onChange(nextValue as DBType)}
        options={DB_TYPES.map((type) => ({
          value: type,
          label: DB_TYPE_LABELS[type],
        }))}
        placeholder={t('database.type', 'Database Type')}
      />
    </div>
  );
};
