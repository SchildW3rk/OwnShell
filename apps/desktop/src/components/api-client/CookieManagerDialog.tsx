import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Modal } from '@ownshell/ui';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

type CookieInfo = Awaited<ReturnType<typeof window.electronAPI.apiClient.cookies.list>>[number];

/** The workspace cookie jar by domain; values are never shown (they are often session secrets). */
export const CookieManagerDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const [cookies, setCookies] = useState<CookieInfo[] | null>(null);

  const load = useCallback(async () => {
    try {
      setCookies(await window.electronAPI.apiClient.cookies.list());
    } catch (error) {
      toast.error(t('api.cookies.loadFailed', { error: error instanceof Error ? error.message : String(error) }));
      setCookies([]);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const byDomain = useMemo(() => {
    const groups = new Map<string, CookieInfo[]>();
    for (const cookie of cookies ?? []) groups.set(cookie.domain, [...(groups.get(cookie.domain) ?? []), cookie]);
    return [...groups.entries()];
  }, [cookies]);

  const remove = async (id: string) => {
    await window.electronAPI.apiClient.cookies.delete(id);
    void load();
  };
  const clearAll = async () => {
    await window.electronAPI.apiClient.cookies.clear();
    void load();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('api.cookies.title')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => void clearAll()} disabled={!cookies?.length}>
            {t('api.cookies.clearAll')}
          </Button>
          <Button type="button" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground mb-3">{t('api.cookies.hint')}</p>
      <div className="max-h-[420px] overflow-auto space-y-4">
        {cookies && cookies.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('api.cookies.empty')}</p>
        )}
        {byDomain.map(([domain, items]) => (
          <section key={domain}>
            <h3 className="text-sm font-medium text-foreground mb-1 font-mono">{domain}</h3>
            <ul className="divide-y divide-border border border-border rounded-md">
              {items.map((cookie) => (
                <li key={cookie.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="font-mono text-foreground truncate">{cookie.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{cookie.path}</span>
                  {cookie.secure === 1 && (
                    <span className="text-[11px] text-muted-foreground border border-border rounded px-1">
                      {t('api.cookies.secure')}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {cookie.expires_at === null
                      ? t('api.cookies.session')
                      : new Date(cookie.expires_at).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(cookie.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    aria-label={t('api.cookies.delete', { name: cookie.name })}
                    title={t('api.cookies.delete', { name: cookie.name })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
};
