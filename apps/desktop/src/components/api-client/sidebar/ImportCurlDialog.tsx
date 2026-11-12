import React, { useState } from 'react';
import { Button, Modal, Textarea } from '@ownshell/ui';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateApiRequest } from '../../../hooks/api/useApiQueries';
import { CurlParseError, parseCurl, type CurlImport } from '../curl-import';

/** Parses a curl command; shows a translated error toast and returns null when it is not usable. */
export function parseCurlWithToast(command: string, t: TFunction): CurlImport | null {
  try {
    return parseCurl(command);
  } catch (error) {
    toast.error(t(`api.curl.errors.${error instanceof CurlParseError ? error.code : 'NOT_CURL'}`));
    return null;
  }
}

/** Non-blocking hints after an import: ignored flags and files that must be selected again. */
export function showCurlImportNotices(result: CurlImport, t: TFunction): void {
  if (result.unsupported.length > 0) {
    toast(t('api.curl.unsupported', { flags: result.unsupported.join(', ') }), { duration: 8000 });
  }
  if (result.files.length > 0) {
    const names = result.files.map((file) => file.split(/[\\/]/).pop() || file).join(', ');
    toast(t('api.curl.reselectFiles', { files: names }), { duration: 8000 });
  }
}

/** Stored columns for an imported request (settings stay default unless the command set them). */
export function curlImportColumns(result: CurlImport) {
  return {
    method: result.method,
    url: result.url,
    params: result.params,
    headers: result.headers,
    body: result.body,
    body_type: result.bodyType,
    raw_content_type: result.rawContentType,
    auth_type: result.authType,
    auth_config: result.authConfig,
    timeout_seconds: result.timeoutSeconds,
    follow_redirects: result.followRedirects === null ? null : result.followRedirects ? (1 as const) : (0 as const),
    verify_tls: result.verifyTls === false ? (0 as const) : null,
  };
}

function requestName(result: CurlImport): string {
  let path = result.url;
  try {
    path = new URL(result.url).pathname;
  } catch {
    // keep the URL text ({{placeholders}})
  }
  return `${result.method} ${path}`.slice(0, 255);
}

interface ImportCurlDialogProps {
  onClose: () => void;
  onImported: (requestId: string) => void;
}

export const ImportCurlDialog: React.FC<ImportCurlDialogProps> = ({ onClose, onImported }) => {
  const { t } = useTranslation();
  const createRequest = useCreateApiRequest();
  const [command, setCommand] = useState('');

  const handleImport = async () => {
    const result = parseCurlWithToast(command, t);
    if (!result) return;
    const created = await createRequest
      .mutateAsync({ name: requestName(result), collection_id: null, ...curlImportColumns(result) })
      .catch(() => null); // the mutation hook shows the error
    if (!created) return;
    showCurlImportNotices(result, t);
    onImported(created.id);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('api.curl.importTitle')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!command.trim() || createRequest.isPending}
          >
            {t('api.curl.import')}
          </Button>
        </>
      }
    >
      <Textarea
        autoFocus
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        placeholder={t('api.curl.importPlaceholder')}
        aria-label={t('api.curl.importTitle')}
        spellCheck={false}
        rows={10}
        className="font-mono text-xs"
      />
    </Modal>
  );
};
