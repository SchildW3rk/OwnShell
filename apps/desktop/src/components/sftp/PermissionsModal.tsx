/**
 * Permissions Modal (CHMOD UI)
 *
 * Allows users to modify file/directory permissions via checkbox UI
 * with real-time octal preview.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppCheckbox, Button } from '@ownshell/ui';
import { SFTPFileEntry } from '@ownshell/core';
import { Shield, Loader2 } from 'lucide-react';

interface PermissionsModalProps {
  file: SFTPFileEntry;
  isOpen: boolean;
  onClose: () => void;
  onSave: (mode: number) => void;
  isPending?: boolean;
}

interface PermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

/**
 * Convert numeric mode to permission sets
 */
function modeToPermissions(mode: number): {
  owner: PermissionSet;
  group: PermissionSet;
  others: PermissionSet;
} {
  // Extract only the permission bits (last 9 bits)
  const perms = mode & 0o777;

  return {
    owner: {
      read: !!(perms & 0o400),
      write: !!(perms & 0o200),
      execute: !!(perms & 0o100),
    },
    group: {
      read: !!(perms & 0o040),
      write: !!(perms & 0o020),
      execute: !!(perms & 0o010),
    },
    others: {
      read: !!(perms & 0o004),
      write: !!(perms & 0o002),
      execute: !!(perms & 0o001),
    },
  };
}

/**
 * Convert permission sets back to numeric mode
 */
function permissionsToMode(perms: {
  owner: PermissionSet;
  group: PermissionSet;
  others: PermissionSet;
}): number {
  let mode = 0;

  if (perms.owner.read) mode |= 0o400;
  if (perms.owner.write) mode |= 0o200;
  if (perms.owner.execute) mode |= 0o100;

  if (perms.group.read) mode |= 0o040;
  if (perms.group.write) mode |= 0o020;
  if (perms.group.execute) mode |= 0o010;

  if (perms.others.read) mode |= 0o004;
  if (perms.others.write) mode |= 0o002;
  if (perms.others.execute) mode |= 0o001;

  return mode;
}

/**
 * Convert mode to octal string (e.g., 755)
 */
function modeToOctal(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  file,
  isOpen,
  onClose,
  onSave,
  isPending = false,
}) => {
  const { t } = useTranslation();

  const [permissions, setPermissions] = useState(() => modeToPermissions(file.mode));

  // Reset permissions when file changes
  useEffect(() => {
    setPermissions(modeToPermissions(file.mode));
  }, [file.mode]);

  if (!isOpen) return null;

  const currentMode = permissionsToMode(permissions);
  const octalString = modeToOctal(currentMode);
  const hasChanges = currentMode !== (file.mode & 0o777);

  const handleToggle = (
    category: 'owner' | 'group' | 'others',
    permission: 'read' | 'write' | 'execute'
  ) => {
    setPermissions((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [permission]: !prev[category][permission],
      },
    }));
  };

  const handleSave = () => {
    onSave(currentMode);
  };

  const PermissionCheckbox: React.FC<{
    checked: boolean;
    onChange: () => void;
    label: string;
    disabled?: boolean;
  }> = ({ checked, onChange, label, disabled }) => (
    <AppCheckbox
      checked={checked}
      onCheckedChange={onChange}
      label={label}
      disabled={disabled}
      className="px-1 py-1"
    />
  );

  const PermissionRow: React.FC<{
    label: string;
    category: 'owner' | 'group' | 'others';
  }> = ({ label, category }) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
      <span className="text-sm font-medium text-foreground w-20">{label}</span>
      <div className="flex items-center gap-6">
        <PermissionCheckbox
          checked={permissions[category].read}
          onChange={() => handleToggle(category, 'read')}
          label={t('permissions.read')}
          disabled={isPending}
        />
        <PermissionCheckbox
          checked={permissions[category].write}
          onChange={() => handleToggle(category, 'write')}
          label={t('permissions.write')}
          disabled={isPending}
        />
        <PermissionCheckbox
          checked={permissions[category].execute}
          onChange={() => handleToggle(category, 'execute')}
          label={t('permissions.execute')}
          disabled={isPending}
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-lg shadow-xl w-[480px] max-w-[90vw]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{t('permissions.title')}</h3>
            <p className="text-sm text-muted-foreground truncate">{file.name}</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Permission Grid */}
          <div className="space-y-1">
            <PermissionRow label={t('permissions.owner')} category="owner" />
            <PermissionRow label={t('permissions.group')} category="group" />
            <PermissionRow label={t('permissions.others')} category="others" />
          </div>

          {/* Octal Preview */}
          <div className="mt-6 p-4 bg-background rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('permissions.octal')}</span>
              <span className="text-2xl font-mono font-bold text-success">{octalString}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {t('permissions.currentPermissions')}:{' '}
              <code className="text-info">{file.permissions}</code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={isPending} className="no-drag">
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
            className="no-drag"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('permissions.apply')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
