import React from 'react';
import { useTranslation } from 'react-i18next';

export const HeadersTable: React.FC<{ headers: Record<string, string> }> = ({ headers }) => {
  const { t } = useTranslation();
  const entries = Object.entries(headers);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          {t('api.response.noHeaders', 'No response headers')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 sticky top-0">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground border-b border-border">
              {t('api.response.headerName', 'Name')}
            </th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground border-b border-border">
              {t('api.response.headerValue', 'Value')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, value]) => (
            <tr key={name} className="hover:bg-accent/50">
              <td className="px-4 py-2 font-mono text-primary border-b border-border/50">{name}</td>
              <td className="px-4 py-2 font-mono text-foreground border-b border-border/50 break-all">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
