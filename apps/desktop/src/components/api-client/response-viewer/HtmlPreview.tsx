import React from 'react';
import { useTranslation } from 'react-i18next';

export const HtmlPreview: React.FC<{ html: string }> = ({ html: htmlContent }) => {
  const { t } = useTranslation();

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-shrink-0 px-3 py-2 bg-amber-500/10 border-b border-border">
        <p className="text-xs text-amber-500">
          {t(
            'api.response.previewWarning',
            'Preview is sandboxed. External resources may be blocked.'
          )}
        </p>
      </div>
      <iframe
        title="HTML Preview"
        srcDoc={htmlContent}
        sandbox=""
        className="flex-1 min-h-0 w-full bg-white"
      />
    </div>
  );
};
