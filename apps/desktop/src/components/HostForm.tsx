/**
 * HostForm Component
 *
 * Modal form for adding/editing SSH hosts
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppSelect,
  Button,
  FormField,
  FormInput,
  Modal,
  SegmentedChoice,
  type AppSelectOption,
} from '@ownshell/ui';
import { useHostStore } from '../stores/useHostStore';
import { HostsTable, KeysTable } from '@ownshell/core';
import { v4 as uuidv4 } from 'uuid';

interface HostFormProps {
  isOpen: boolean;
  onClose: () => void;
  host?: HostsTable; // If provided, edit mode; otherwise, create mode
  defaultConnectionType?: 'ssh' | 'sftp_only'; // Pre-select connection type (v1.16.0)
}

interface FormData {
  label: string;
  hostname: string;
  port: string;
  username: string;
  auth_type: 'password' | 'key';
  password: string;
  connection_type: 'ssh' | 'sftp_only';
}

interface FormErrors extends Partial<FormData> {
  jumpHost?: string;
}

export const HostForm: React.FC<HostFormProps> = ({
  isOpen,
  onClose,
  host,
  defaultConnectionType,
}) => {
  const { t } = useTranslation();
  const { createHost, updateHost, loadHosts, isLoading, hosts } = useHostStore();
  const isEditMode = !!host;

  const [formData, setFormData] = useState<FormData>({
    label: '',
    hostname: '',
    port: '22',
    username: '',
    auth_type: 'password',
    password: '',
    connection_type: 'ssh',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [availableKeys, setAvailableKeys] = useState<KeysTable[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [selectedJumpHostId, setSelectedJumpHostId] = useState<string>('');
  const [jumpHostError, setJumpHostError] = useState<string>('');
  const [isResettingHostKey, setIsResettingHostKey] = useState(false);
  // Read the fingerprint from the DB: the main process stores it during a connect, so the
  // host prop from the store can be stale (a changed key would then show no reset button).
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState<string | null>(null);
  useEffect(() => {
    if (!host?.id) return;
    let active = true;
    void window.electronAPI.hosts
      .getById(host.id)
      .then((fresh: HostsTable | undefined) => active && setHostKeyFingerprint(fresh?.host_key_fingerprint ?? null))
      .catch(() => active && setHostKeyFingerprint(host.host_key_fingerprint ?? null));
    return () => {
      active = false;
    };
  }, [host?.id, host?.host_key_fingerprint]);

  const handleResetHostKey = async () => {
    if (!host) return;
    setIsResettingHostKey(true);
    try {
      await window.electronAPI.hosts.resetHostKey(host.id);
      setHostKeyFingerprint(null);
      await loadHosts();
    } finally {
      setIsResettingHostKey(false);
    }
  };

  // Get hosts that can be used as jump hosts (exclude self and hosts that would create cycles)
  const availableJumpHosts = hosts.filter((h) => {
    // Can't use self as jump host
    if (host && h.id === host.id) return false;
    return true;
  });
  const keyOptions: AppSelectOption[] = availableKeys.map((key) => ({
    value: key.id,
    label: `${key.label} (${key.type.toUpperCase()})`,
  }));
  const jumpHostOptions: AppSelectOption[] = [
    { value: '', label: t('hosts.direct') },
    ...availableJumpHosts.map((h) => ({
      value: h.id,
      label: `${h.label} (${h.hostname})`,
    })),
  ];

  // Load available keys
  useEffect(() => {
    if (isOpen) {
      window.electronAPI.keys.getAll().then(setAvailableKeys);
    }
  }, [isOpen]);

  // Validate jump host chain when selection changes
  useEffect(() => {
    const validateJumpHost = async () => {
      if (!selectedJumpHostId) {
        setJumpHostError('');
        return;
      }

      try {
        const result = await window.electronAPI.hosts.validateJumpChain(
          host?.id || null,
          selectedJumpHostId
        );
        if (!result.valid) {
          setJumpHostError(result.error || 'Invalid jump host configuration');
        } else {
          setJumpHostError('');
        }
      } catch (error) {
        console.error('Failed to validate jump chain:', error);
        setJumpHostError('Failed to validate jump host');
      }
    };

    validateJumpHost();
  }, [selectedJumpHostId, host?.id]);

  // Populate form when modal opens or host changes
  // Using a ref to track previous isOpen state to detect modal opening
  const prevIsOpenRef = React.useRef(false);

  useEffect(() => {
    // Only reset form when modal is opening (transition from closed to open)
    const isOpening = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (!isOpen) return; // Don't do anything when modal is closed

    if (host) {
      // Edit mode: populate with existing host data
      setFormData({
        label: host.label,
        hostname: host.hostname,
        port: host.port.toString(),
        username: host.username,
        auth_type: host.auth_type as 'password' | 'key',
        password: '', // Don't populate password for security
        connection_type: (host.connection_type as 'ssh' | 'sftp_only') || 'ssh',
      });
      setSelectedKeyId(host.key_id || '');
      setSelectedJumpHostId(host.jump_host_id || '');
    } else if (isOpening) {
      // Create mode: reset form with defaultConnectionType
      // Only reset when modal is actually opening, not on every render
      console.log('[HostForm] Creating new host with connection_type:', defaultConnectionType);
      setFormData({
        label: '',
        hostname: '',
        port: '22',
        username: '',
        auth_type: 'password',
        password: '',
        connection_type: defaultConnectionType || 'ssh',
      });
      setSelectedKeyId('');
      setSelectedJumpHostId('');
    }
    setErrors({});
    setJumpHostError('');
  }, [host, isOpen, defaultConnectionType]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.label.trim()) {
      newErrors.label = t('hosts.labelRequired');
    }

    if (!formData.hostname.trim()) {
      newErrors.hostname = t('hosts.hostnameRequired');
    }

    if (!formData.username.trim()) {
      newErrors.username = t('hosts.usernameRequired');
    }

    const portNum = parseInt(formData.port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      newErrors.port = t('hosts.portInvalid');
    }

    if (formData.auth_type === 'password' && !isEditMode && !formData.password) {
      newErrors.password = t('hosts.passwordRequired');
    }

    if (formData.auth_type === 'key' && !selectedKeyId) {
      newErrors.password = t('hosts.keyRequired');
    }

    // Check for jump host cycle error
    if (jumpHostError) {
      newErrors.jumpHost = jumpHostError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (isEditMode && host) {
        // Update existing host
        const updateData: any = {
          label: formData.label,
          hostname: formData.hostname,
          port: parseInt(formData.port),
          username: formData.username,
          auth_type: formData.auth_type,
          key_id: formData.auth_type === 'key' ? selectedKeyId : null,
          jump_host_id: selectedJumpHostId || null,
          connection_type: formData.connection_type,
          updated_at: Date.now(),
        };

        // Only update password if provided
        if (formData.auth_type === 'password' && formData.password) {
          const encrypted = await window.electronAPI.crypto.encryptData(formData.password);
          updateData.password_encrypted = encrypted;
        }

        await updateHost(host.id, updateData);
      } else {
        // Create new host
        const encrypted =
          formData.auth_type === 'password'
            ? await window.electronAPI.crypto.encryptData(formData.password)
            : undefined;

        console.log('[HostForm] Creating host with connection_type:', formData.connection_type);

        const newHostPayload: Record<string, unknown> = {
          id: uuidv4(),
          label: formData.label,
          hostname: formData.hostname,
          port: parseInt(formData.port),
          username: formData.username,
          auth_type: formData.auth_type,
          key_id: formData.auth_type === 'key' ? selectedKeyId : null,
          jump_host_id: selectedJumpHostId || null,
          connection_type: formData.connection_type,
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        if (encrypted) {
          newHostPayload.password_encrypted = encrypted;
        }

        await createHost(newHostPayload);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save host:', error);
      setErrors({ label: t('hosts.saveFailed') });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? t('hosts.editTitle') : t('hosts.addTitle')}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('hosts.label')} error={errors.label}>
          <FormInput
            placeholder={t('hosts.labelPlaceholder')}
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            error={errors.label}
            autoFocus
          />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FormField label={t('hosts.address')} error={errors.hostname}>
              <FormInput
                placeholder={t('hosts.addressPlaceholder')}
                value={formData.hostname}
                onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                error={errors.hostname}
              />
            </FormField>
          </div>
          <div>
            <FormField label={t('hosts.port')} error={errors.port}>
              <FormInput
                type="number"
                placeholder="22"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                error={errors.port}
              />
            </FormField>
          </div>
        </div>

        {/* Connection Type (v1.16.0) */}
        <fieldset>
          <legend className="block text-sm font-medium text-foreground mb-2">
            {t('hosts.connectionType', 'Connection Type')}
          </legend>
          <SegmentedChoice
            name="connection_type"
            value={formData.connection_type}
            onChange={(connection_type) => setFormData({ ...formData, connection_type })}
            options={[
              { value: 'ssh', label: t('hosts.connectionSSH', 'SSH + SFTP') },
              { value: 'sftp_only', label: t('hosts.connectionSFTPOnly', 'SFTP Only') },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {formData.connection_type === 'sftp_only'
              ? t('hosts.sftpOnlyHelp', 'File transfers only, no terminal access')
              : t('hosts.sshHelp', 'Full terminal and file transfer access')}
          </p>
        </fieldset>

        <FormField label={t('hosts.username')} error={errors.username}>
          <FormInput
            placeholder={t('hosts.usernamePlaceholder')}
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            error={errors.username}
          />
        </FormField>

        <fieldset>
          <legend className="block text-sm font-medium text-foreground mb-2">
            {t('hosts.authMethod')}
          </legend>
          <SegmentedChoice
            name="auth_type"
            value={formData.auth_type}
            onChange={(auth_type) => setFormData({ ...formData, auth_type })}
            options={[
              { value: 'password', label: t('hosts.password') },
              { value: 'key', label: t('hosts.key') },
            ]}
          />
        </fieldset>

        {formData.auth_type === 'password' && (
          <FormField
            label={t('hosts.password')}
            error={errors.password}
            hint={isEditMode ? t('hosts.passwordKeepCurrent') : undefined}
          >
            <FormInput
              type="password"
              placeholder={
                isEditMode ? t('hosts.passwordKeepCurrent') : t('hosts.passwordPlaceholder')
              }
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={errors.password}
            />
          </FormField>
        )}

        {formData.auth_type === 'key' && (
          <div>
            <label
              htmlFor="ssh-key-select"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {t('hosts.key')}
            </label>
            <AppSelect
              id="ssh-key-select"
              value={selectedKeyId}
              onChange={setSelectedKeyId}
              options={keyOptions}
              placeholder={t('hosts.keySelect')}
              error={!!errors.password}
              disabled={availableKeys.length === 0}
            />
            {availableKeys.length === 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">{t('hosts.noKeysImported')}</p>
            )}
          </div>
        )}

        {/* Jump Host (Bastion/Gateway) */}
        <div>
          <label
            htmlFor="jump-host-select"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {t('hosts.jumpHost')}
          </label>
          <AppSelect
            id="jump-host-select"
            value={selectedJumpHostId}
            onChange={setSelectedJumpHostId}
            options={jumpHostOptions}
            placeholder={t('hosts.direct')}
            error={!!(jumpHostError || errors.jumpHost)}
          />
          {(jumpHostError || errors.jumpHost) && (
            <p className="mt-1.5 text-xs text-destructive">{jumpHostError || errors.jumpHost}</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{t('hosts.jumpHostHelp')}</p>
        </div>

        {isEditMode && hostKeyFingerprint && (
          <div>
            <span className="block text-sm font-medium text-foreground mb-1.5">
              {t('hosts.hostKey')}
            </span>
            <div className="flex items-center gap-3">
              <code
                className="flex-1 truncate text-xs text-muted-foreground"
                title={hostKeyFingerprint}
              >
                {hostKeyFingerprint}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleResetHostKey}
                isLoading={isResettingHostKey}
                disabled={isResettingHostKey}
              >
                {t('hosts.resetHostKey')}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t('hosts.resetHostKeyHelp')}</p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            disabled={isLoading}
            className="flex-1"
          >
            {isEditMode ? t('hosts.save') : t('hosts.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
