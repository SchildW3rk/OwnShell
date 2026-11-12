import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';

import { SidebarItem, SidebarSection } from '../../components/sidebar';

export interface SecuritySidebarSectionProps {
  showVault: boolean;
  onOpenVault: () => void;
}

export const SecuritySidebarSection: React.FC<SecuritySidebarSectionProps> = ({
  showVault,
  onOpenVault,
}) => {
  const { t } = useTranslation();

  return (
    <SidebarSection title={t('sidebar.security', 'Security')}>
      <SidebarItem
        label={t('sidebar.vault', 'Vault')}
        icon={<Shield className="w-4 h-4" />}
        isActive={showVault}
        onClick={onOpenVault}
      />
    </SidebarSection>
  );
};
