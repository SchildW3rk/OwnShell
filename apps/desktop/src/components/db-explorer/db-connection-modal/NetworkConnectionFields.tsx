import React from 'react';
import { Button, Input } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import {
  applyParsedConnectionUri,
  parseDatabaseConnectionUri,
} from './connection-uri';
import type { DBConnectionFormData } from './types';

interface NetworkConnectionFieldsProps {
  formData: DBConnectionFormData;
  showDatabaseName: boolean;
  showUsername: boolean;
  onChange: (formData: DBConnectionFormData) => void;
}

export const NetworkConnectionFields: React.FC<NetworkConnectionFieldsProps> = ({
  formData,
  showDatabaseName,
  showUsername,
  onChange,
}) => {
  const { t } = useTranslation();

  const applyConnectionUri = (value = formData.connectionUri) => {
    const parsed = parseDatabaseConnectionUri(value);
    if (!parsed) return;

    onChange(applyParsedConnectionUri(formData, parsed));
  };

  return (
    <>
      <div>
        <label
          htmlFor="db-connection-uri"
          className="block text-sm font-medium text-foreground mb-1"
        >
          {t('database.connectionUri', 'Connection URI')}
        </label>
        <div className="flex gap-2">
          <Input
            id="db-connection-uri"
            value={formData.connectionUri}
            onChange={(e) => onChange({ ...formData, connectionUri: e.target.value })}
            onBlur={() => applyConnectionUri()}
            onPaste={(event) => {
              const value = event.clipboardData.getData('text');
              window.setTimeout(() => applyConnectionUri(value), 0);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => applyConnectionUri()}
            disabled={!formData.connectionUri.trim()}
            className="shrink-0"
          >
            {t('database.applyUri', 'Apply')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label htmlFor="db-host" className="block text-sm font-medium text-foreground mb-1">
            {t('database.host', 'Host')} *
          </label>
          <Input
            id="db-host"
            value={formData.host}
            onChange={(e) => onChange({ ...formData, host: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="db-port" className="block text-sm font-medium text-foreground mb-1">
            {t('database.port', 'Port')} *
          </label>
          <Input
            id="db-port"
            type="number"
            value={formData.port}
            onChange={(e) => onChange({ ...formData, port: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      {showDatabaseName && (
        <div>
          <label htmlFor="db-database" className="block text-sm font-medium text-foreground mb-1">
            {t('database.databaseName', 'Database Name')}
          </label>
          <Input
            id="db-database"
            value={formData.database}
            onChange={(e) => onChange({ ...formData, database: e.target.value })}
          />
        </div>
      )}

      <div className={showUsername ? 'grid grid-cols-2 gap-3' : ''}>
        {showUsername && (
          <div>
            <label htmlFor="db-username" className="block text-sm font-medium text-foreground mb-1">
              {t('database.username', 'Username')}
            </label>
            <Input
              id="db-username"
              value={formData.username}
              onChange={(e) => onChange({ ...formData, username: e.target.value })}
            />
          </div>
        )}
        <div>
          <label htmlFor="db-password" className="block text-sm font-medium text-foreground mb-1">
            {t('database.password', 'Password')}
          </label>
          <Input
            id="db-password"
            type="password"
            value={formData.password}
            onChange={(e) => onChange({ ...formData, password: e.target.value })}
          />
        </div>
      </div>
    </>
  );
};
