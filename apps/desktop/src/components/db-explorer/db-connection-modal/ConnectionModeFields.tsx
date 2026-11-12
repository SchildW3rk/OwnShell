import React from 'react';
import { Globe, Home } from 'lucide-react';
import { AppSelect, SegmentedChoice } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';

import type { DBConnectionFormData, HostOption } from './types';

interface ConnectionModeFieldsProps {
  formData: DBConnectionFormData;
  hosts?: HostOption[];
  isSSHMode: boolean;
  onChange: (formData: DBConnectionFormData) => void;
}

export const ConnectionModeFields: React.FC<ConnectionModeFieldsProps> = ({
  formData,
  hosts,
  isSSHMode,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="border-t border-border pt-4">
      <span className="block text-sm font-medium text-foreground mb-2">
        {t('database.connectionMode', 'Connection Mode')}
      </span>
      <SegmentedChoice
        name="connectionMode"
        value={formData.connectionMode}
        onChange={(connectionMode) => onChange({ ...formData, connectionMode })}
        fullWidth
        className="mb-3"
        itemClassName="h-11"
        options={[
          {
            value: 'local',
            label: t('database.modeLocal', 'Local'),
            icon: <Home className="h-4 w-4" />,
          },
          {
            value: 'ssh',
            label: t('database.modeSSH', 'via SSH'),
            icon: <Globe className="h-4 w-4" />,
          },
        ]}
      />
      <p className="text-xs text-muted-foreground mb-3">
        {formData.connectionMode === 'local'
          ? t('database.modeLocalHint', 'Direct connection to localhost or network database')
          : t('database.modeSSHHint', 'Connect through an SSH tunnel to a remote database')}
      </p>

      {isSSHMode && (
        <div>
          <label htmlFor="sshHostSelect" className="block text-sm font-medium text-foreground mb-1">
            {t('database.sshHost', 'SSH Host')} *
          </label>
          <AppSelect
            id="sshHostSelect"
            value={formData.sshHostId}
            onChange={(sshHostId) => onChange({ ...formData, sshHostId })}
            options={[
              { value: '', label: t('database.selectSSHHost', 'Select SSH host...') },
              ...(hosts || []).map((host) => ({
                value: host.id,
                label: `${host.label}${host.hostname ? ` (${host.hostname})` : ''}`,
              })),
            ]}
            placeholder={t('database.selectSSHHost', 'Select SSH host...')}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              'database.sshHostHint',
              'The database connection will be tunneled through this SSH host'
            )}
          </p>
        </div>
      )}
    </div>
  );
};
