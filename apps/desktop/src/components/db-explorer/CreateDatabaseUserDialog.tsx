import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal } from '@ownshell/ui';
import { Loader2, UserPlus } from 'lucide-react';
import type {
  CreateDatabaseUserOptions,
  DatabaseUserAccessLevel,
} from '../../hooks/db-explorer/useDBDDLMutations';

interface CreateDatabaseUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (username: string, options: CreateDatabaseUserOptions) => void;
  isLoading?: boolean;
  dbType: 'postgres' | 'mysql' | 'mongodb' | 'redis';
  databaseName?: string | null;
  schemaName?: string;
}

export const CreateDatabaseUserDialog: React.FC<CreateDatabaseUserDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  dbType,
  databaseName,
  schemaName,
}) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('%');
  const [accessLevel, setAccessLevel] = useState<DatabaseUserAccessLevel>('readWrite');

  const maxUsernameLength = dbType === 'mysql' ? 32 : dbType === 'postgres' ? 63 : 128;
  const trimmedUsername = username.trim();
  const trimmedHost = host.trim();
  const targetLabel =
    dbType === 'redis' ? t('db.redisAclTarget', 'Redis ACL') : databaseName || '-';
  const schemaLabel = dbType === 'postgres' ? ` / ${schemaName || 'public'}` : '';
  const isUsernameValid =
    trimmedUsername.length > 0 &&
    trimmedUsername.length <= maxUsernameLength &&
    /^[a-zA-Z0-9_.@-]+$/.test(trimmedUsername);
  const isPasswordValid = password.length >= 8 && password.length <= 10 * 1024;
  const isHostValid = dbType !== 'mysql' || (trimmedHost.length > 0 && trimmedHost.length <= 255);

  const usernameError =
    username.length > 0 && !isUsernameValid
      ? t(
          'db.userNameError',
          'Use letters, numbers, underscore, hyphen, dot or @ only. Max {{max}} characters.',
          { max: maxUsernameLength }
        )
      : undefined;
  const passwordError =
    password.length > 0 && !isPasswordValid
      ? t('db.passwordMinError', 'Password must be at least 8 characters')
      : undefined;
  const hostError =
    dbType === 'mysql' && host.length > 0 && !isHostValid
      ? t('db.hostError', 'Host must be 1-255 characters')
      : undefined;

  const resetAndClose = () => {
    setUsername('');
    setPassword('');
    setHost('%');
    setAccessLevel('readWrite');
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isUsernameValid || !isPasswordValid || !isHostValid) {
      return;
    }

    onConfirm(trimmedUsername, {
      password,
      host: dbType === 'mysql' ? trimmedHost : undefined,
      database: dbType === 'redis' ? undefined : databaseName || undefined,
      schema: dbType === 'postgres' ? schemaName || 'public' : undefined,
      accessLevel,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title={t('db.createUser', 'Create User')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="db-user-name" className="mb-1 block text-sm font-medium text-foreground">
            {t('db.databaseUserName', 'User Name')} *
          </label>
          <Input
            id="db-user-name"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="app_user"
            autoFocus
            required
            className={usernameError ? 'border-destructive' : ''}
          />
          {usernameError && <p className="mt-1 text-xs text-destructive">{usernameError}</p>}
        </div>

        <div>
          <label
            htmlFor="db-user-password"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t('db.userPassword', 'Password')} *
          </label>
          <Input
            id="db-user-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            className={passwordError ? 'border-destructive' : ''}
          />
          {passwordError && <p className="mt-1 text-xs text-destructive">{passwordError}</p>}
        </div>

        {dbType === 'mysql' && (
          <div>
            <label
              htmlFor="db-user-host"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              {t('db.mysqlHost', 'Host')} *
            </label>
            <Input
              id="db-user-host"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="%"
              required
              className={hostError ? 'border-destructive' : ''}
            />
            {hostError ? (
              <p className="mt-1 text-xs text-destructive">{hostError}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('db.mysqlHostHint', '% allows remote access; localhost limits access locally.')}
              </p>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="db-user-access"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t('db.accessLevel', 'Access Level')}
          </label>
          <select
            id="db-user-access"
            value={accessLevel}
            onChange={(event) => setAccessLevel(event.target.value as DatabaseUserAccessLevel)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="login">{t('db.accessLoginOnly', 'Login only')}</option>
            <option value="read">{t('db.accessReadOnly', 'Read only')}</option>
            <option value="readWrite">{t('db.accessReadWrite', 'Read/write data')}</option>
            <option value="admin">{t('db.accessAdmin', 'Database admin')}</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('db.createUserContext', 'Target: {{database}}{{schema}}', {
              database: targetLabel,
              schema: schemaLabel,
            })}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!isUsernameValid || !isPasswordValid || !isHostValid || isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            {isLoading ? t('common.creating', 'Creating...') : t('common.create', 'Create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
