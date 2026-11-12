import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>;
  tabs?: React.ReactNode; // Tabs component rendered below header
  className?: string;
}

/**
 * PageHeader Component
 *
 * Unified header component for consistent page layouts across OwnShell
 * - Icon + Title + Subtitle
 * - Optional breadcrumb navigation
 * - Action buttons slot (right-aligned)
 * - Integrated tabs support
 *
 * @example
 * ```tsx
 * <PageHeader
 *   icon={Shield}
 *   title="Vault"
 *   subtitle="Secure credential management"
 *   actions={<Button>Add New</Button>}
 *   tabs={<Tabs tabs={...} />}
 * />
 * ```
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  actions,
  breadcrumbs,
  tabs,
  className = '',
}) => {
  return (
    <div className={className}>
      {/* Breadcrumbs (if provided) */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 text-sm text-muted-foreground border-b border-border bg-background transition-colors duration-200">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={`breadcrumb-${crumb.label}-${idx}`}>
              {idx > 0 && <span>/</span>}
              {crumb.onClick ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="hover:text-foreground hover:underline transition-colors duration-200"
                >
                  {crumb.label}
                </button>
              ) : (
                <span>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Header with icon, title, subtitle, actions */}
      <div className="border-b border-border bg-background px-6 py-4 transition-colors duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
            <div>
              <h1 className="text-xl font-semibold text-foreground">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>

      {/* Tabs (if provided) */}
      {tabs && <div className="bg-background px-6 transition-colors duration-200">{tabs}</div>}
    </div>
  );
};
