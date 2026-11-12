/**
 * Vault View (v1.19.0 - Compact Layout)
 *
 * Security hub for credential, environment, and SSH key management
 * - Tab 1: Credentials (passwords, logins, URLs)
 * - Tab 2: Environments (ENV variable sets with SFTP deployment)
 * - Tab 3: SSH Keys (imported private keys for authentication)
 */

import React, { useState } from 'react';
import { Key, Settings2, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@ownshell/ui';
import { CredentialsTab } from './CredentialsTab';
import { EnvironmentsTab } from './EnvironmentsTab';
import { SSHKeysTab } from './SSHKeysTab';

type VaultTab = 'credentials' | 'environments' | 'ssh-keys';

export const VaultView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<VaultTab>('credentials');

  return (
    <div className="flex h-full flex-col bg-background transition-colors duration-200">
      {/* Compact Tab Bar (no header/subtitle) */}
      <div className="bg-background px-4">
        <Tabs
          tabs={[
            {
              id: 'credentials',
              label: t('vault.credentials'),
              icon: <Key className="h-4 w-4" />,
            },
            {
              id: 'environments',
              label: t('vault.environments'),
              icon: <Settings2 className="h-4 w-4" />,
            },
            {
              id: 'ssh-keys',
              label: t('settings.sshKeys', 'SSH Keys'),
              icon: <KeyRound className="h-4 w-4" />,
            },
          ]}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as VaultTab)}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'credentials' && <CredentialsTab />}
        {activeTab === 'environments' && <EnvironmentsTab />}
        {activeTab === 'ssh-keys' && <SSHKeysTab />}
      </div>
    </div>
  );
};
