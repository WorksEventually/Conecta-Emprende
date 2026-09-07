import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export type DashboardCardStatus = "success" | "warning" | "error" | "info";

interface DashboardCardProps {
  title: ReactNode;
  description?: ReactNode;
  status?: DashboardCardStatus;
  statusLabel?: string;
  children?: ReactNode;
  className?: string;
}

const statusConfig: Record<DashboardCardStatus, { label: string; Icon: typeof CheckCircle2 }> = {
  success: { label: "Completado", Icon: CheckCircle2 },
  warning: { label: "Pendiente", Icon: AlertTriangle },
  error: { label: "Requiere revisión", Icon: XCircle },
  info: { label: "Información", Icon: Info },
};

export function DashboardCard({
  title,
  description,
  status,
  statusLabel,
  children,
  className = "",
}: DashboardCardProps) {
  const config = status ? statusConfig[status] : null;
  const StatusIcon = config?.Icon;

  return (
    <article className={`tradearc-dashboard-card ${className}`.trim()}>
      <header className="tradearc-dashboard-card__header">
        <div>
          <h2 className="tradearc-dashboard-card__title">{title}</h2>
          {description && <p className="tradearc-dashboard-card__description">{description}</p>}
        </div>
        {config && StatusIcon && (
          <span className={`tradearc-status-badge tradearc-status-badge--${status}`}>
            <StatusIcon aria-hidden="true" />
            {statusLabel || config.label}
          </span>
        )}
      </header>
      {children && <div className="tradearc-dashboard-card__content">{children}</div>}
    </article>
  );
}
