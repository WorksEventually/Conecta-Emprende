import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock3, Flag, RotateCcw, ShieldAlert, AlertCircle } from "lucide-react";
import { adminApi, type AdminRiskReport, type AdminRiskReportStatus, type ModerationAuditLog } from "../api/adminApi";
import { EmptyState, PageHeader } from "../components/mvp/Ui";
import { useAuthStore } from "../stores/auth-store";
import { getProviderStatusLabel } from "../lib/identity";

const reportLabels: Record<AdminRiskReportStatus, string> = {
  OPEN: "Abierto",
  UNDER_REVIEW: "En revisión",
  DISMISSED: "Descartado",
  ESCALATED: "Escalado",
  ACTION_TAKEN: "Acción tomada",
};

const statusOptions: Array<AdminRiskReportStatus | ""> = ["", "OPEN", "UNDER_REVIEW", "ESCALATED", "DISMISSED", "ACTION_TAKEN"];

export default function AdminReportsPage() {
  const { user } = useAuthStore();
  const roles = new Set([user?.role, ...(user?.roleLabels ?? [])].filter(Boolean));
  const canReview = roles.has("ADMIN") || roles.has("ADMIN_REVIEWER") || roles.has("SUPER_ADMIN");
  const isSuperAdmin = roles.has("SUPER_ADMIN");
  const isDemoAdminSession = !!user && (user.email.endsWith("@demo.test") || user.id.includes("_demo"));

  const [filter, setFilter] = useState<AdminRiskReportStatus | "">("OPEN");
  const [reports, setReports] = useState<AdminRiskReport[]>([]);
  const [auditLog, setAuditLog] = useState<ModerationAuditLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [suspendedUntil, setSuspendedUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => reports.find(report => report.id === selectedId) ?? reports[0] ?? null, [reports, selectedId]);

  async function load() {
    if (!canReview) return;
    if (isDemoAdminSession) {
      setReports([]);
      setAuditLog([]);
      setSelectedId(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextReports = await adminApi.getRiskReports(filter || undefined);
      setReports(nextReports);
      setSelectedId(current => current && nextReports.some(report => report.id === current) ? current : nextReports[0]?.id ?? null);
      if (isSuperAdmin) {
        setAuditLog(await adminApi.getAuditLog());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, canReview, isSuperAdmin, isDemoAdminSession]);

  async function updateReport(status: AdminRiskReportStatus) {
    if (!selected) return;
    setError(null);
    try {
      await adminApi.updateRiskReportStatus(selected.id, { status, reviewerNotes: note, reason });
      setNote("");
      setReason("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function escalateReport() {
    if (!selected) return;
    setError(null);
    try {
      await adminApi.escalateRiskReport(selected.id, note || reason);
      setNote("");
      setReason("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moderateProvider(action: "suspend" | "restrict" | "inactivate" | "ban" | "reactivate") {
    if (!selected) return;
    setError(null);
    try {
      if (action === "suspend") await adminApi.suspendProvider(selected.provider.id, { reason, suspendedUntil: suspendedUntil || undefined });
      if (action === "restrict") await adminApi.restrictProvider(selected.provider.id, { reason, suspendedUntil: suspendedUntil || undefined });
      if (action === "inactivate") await adminApi.inactivateProvider(selected.provider.id, reason);
      if (action === "ban") await adminApi.banProvider(selected.provider.id, reason);
      if (action === "reactivate") await adminApi.reactivateProvider(selected.provider.id, reason);
      await adminApi.updateRiskReportStatus(selected.id, { status: "ACTION_TAKEN", reason: reason || "Acción de moderación aplicada" });
      setReason("");
      setSuspendedUntil("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!canReview) {
    return (
      <div className="content-page">
        <EmptyState icon={<ShieldAlert />} title="No autorizado">
          Tu cuenta no tiene permisos para revisar reportes.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="content-page">
      <PageHeader
        eyebrow={isSuperAdmin ? "Super administración" : "Admin reviewer"}
        title="Revisión de reportes"
        description="Los reportes muestran evidencia agregada y sanitizada. Las sanciones requieren razón y quedan auditadas."
        actions={
          <label>
            Estado
            <select value={filter} onChange={event => setFilter(event.target.value as AdminRiskReportStatus | "")}>
              {statusOptions.map(value => (
                <option value={value} key={value || "all"}>{value ? reportLabels[value] : "Todos"}</option>
              ))}
            </select>
          </label>
        }
      />

      {error && <p className="field-error" role="alert">{error}</p>}

      {isDemoAdminSession && (
        <section className="admin-demo-notice">
          <strong>El perfil del panel dev es solo visual.</strong>
          <p>
            Para probar reportes, sanciones y auditoría con permisos reales, iniciá sesión con
            <code>superadmin@conecta.test</code> o <code>admin@conecta.test</code>. Contraseña: <code>Conecta123!</code>.
          </p>
        </section>
      )}

      {isDemoAdminSession ? (
        <EmptyState icon={<ShieldAlert />} title="Usá una cuenta admin real para probar este módulo">
          El backend no acepta permisos simulados del dev switcher para acciones administrativas.
        </EmptyState>
      ) : loading ? (
        <EmptyState title="Cargando reportes">Consultando reportes desde la base de datos.</EmptyState>
      ) : reports.length === 0 ? (
        <EmptyState icon={<Flag />} title="No hay reportes en este estado">
          Cambiá el filtro para revisar otros casos.
        </EmptyState>
      ) : (
        <div className="admin-review-layout">
          <section className="admin-report-list" aria-label="Reportes">
            {reports.map(report => (
              <button
                key={report.id}
                className={report.id === selected?.id ? "active" : ""}
                onClick={() => setSelectedId(report.id)}
              >
                <span>{reportLabels[report.status]}</span>
                <strong className="text-truncate" title={report.provider.displayName}>{report.provider.displayName}</strong>
                <small>Riesgo {Math.round(report.riskScore)} · {new Date(report.generatedAt).toLocaleDateString("es-NI")}</small>
              </button>
            ))}
          </section>

          {selected && (
            <main className="admin-report-detail">
              <section className="content-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">{reportLabels[selected.status]}</span>
                    <h2 className="text-truncate" title={selected.provider.displayName}>{selected.provider.displayName}</h2>
                  </div>
                  <span className={`provider-status-chip ${selected.provider.status.toLowerCase()}`}>
                    {getProviderStatusLabel(selected.provider.status)}
                  </span>
                </div>
                <p className="form-note">
                  Evidencia segura: métricas agregadas de riesgo, sin contenido privado de conversaciones.
                </p>
                <div className="business-metrics">
                  <div><strong>{Math.round(selected.riskScore)}</strong><span>Riesgo</span></div>
                   <div><strong>{selected.signals.suspiciousCyclesCount}</strong><span>Ciclos sospechosos</span></div>
                   <div><strong>{selected.signals.avgMessagesPerRequest ?? "N/D"}</strong><span>Mensajes por solicitud</span></div>
                   <div><strong>{selected.signals.newAccountsPercentage ?? "N/D"}</strong><span>Cuentas nuevas</span></div>
                </div>
                <p>{selected.recommendedAction || "Revisión manual recomendada."}</p>
                {selected.reviewerNotes && <p className="reviewer-note"><strong>Notas previas:</strong> {selected.reviewerNotes}</p>}
              </section>

              <section className="content-section">
                <h2>Acciones de revisión</h2>
                <label>
                  Nota interna o razón
                  <textarea value={note} onChange={event => setNote(event.target.value)} rows={4} maxLength={1000} placeholder="Resumen seguro para auditoría, sin chats privados." />
                </label>
                <div className="report-actions">
                  <button className="button secondary" onClick={() => updateReport("UNDER_REVIEW")}><Clock3 /> En revisión</button>
                  <button className="button secondary" onClick={() => updateReport("DISMISSED")}><CheckCircle2 /> Descartar</button>
                  <button className="button primary" onClick={escalateReport}><AlertTriangle /> Escalar</button>
                </div>
              </section>

              {canReview && !isSuperAdmin && (
                <section className="content-section">
                  <h2>Acciones de revisión</h2>
                  <div className="report-actions">
                    <button className="button secondary" type="button" onClick={() => moderateProvider("inactivate")}><Clock3 /> Inactivar</button>
                  </div>
                </section>
              )}

              {isSuperAdmin && (
                <section className="content-section">
                  <h2>Acciones de super administración</h2>
                  <form className="admin-moderation-form" onSubmit={event => { event.preventDefault(); moderateProvider("suspend"); }}>
                    <label>
                      Razón obligatoria
                      <textarea required value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={500} />
                    </label>
                    <label>
                      Suspender hasta (opcional)
                      <input type="date" value={suspendedUntil} onChange={event => setSuspendedUntil(event.target.value)} />
                    </label>
                    <div className="report-actions">
                      <button className="button secondary"><AlertTriangle /> Suspender</button>
                      <button className="button secondary" type="button" onClick={() => moderateProvider("restrict")}><AlertCircle /> Restringir</button>
                      <button className="button secondary" type="button" onClick={() => moderateProvider("reactivate")}><RotateCcw /> Reactivar</button>
                      <button className="button primary danger" type="button" onClick={() => moderateProvider("ban")}><Ban /> Banear</button>
                    </div>
                  </form>
                </section>
              )}
            </main>
          )}

          {isSuperAdmin && (
            <aside className="content-section admin-audit-panel">
              <h2>Auditoría reciente</h2>
              {auditLog.slice(0, 8).map(log => (
                <article key={log.id}>
                  <strong>{log.action}</strong>
                  <span>{log.actor?.email || log.actorUserId}</span>
                  <small>{new Date(log.createdAt).toLocaleString("es-NI")} · {log.reason}</small>
                </article>
              ))}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
