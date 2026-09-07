import { Link } from "react-router-dom";
import { ArrowLeft, Search, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "../components/mvp/Ui";

export default function FormalizationPage() {
  return (
    <div className="content-page">
      <Link className="back-link" to="/me">
        <ArrowLeft /> Volver a mi perfil
      </Link>
      <PageHeader
        eyebrow="Roadmap futuro"
        title="Formalización legal no forma parte del MVP activo"
        description="TradeArc se concentra ahora en búsqueda, perfiles públicos, catálogo, solicitudes, chat, reseñas verificadas, confianza y revisión administrativa."
      />

      <div className="profile-dashboard">
        <main>
          <section className="dashboard-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Alcance actual</span>
                <h2>Qué sí podés validar hoy</h2>
              </div>
              <ShieldCheck />
            </div>
            <div className="profile-checklist">
              <div className="done"><ShieldCheck /> Perfil público y señales de confianza</div>
              <div className="done"><ShieldCheck /> Catálogo de productos y servicios</div>
              <div className="done"><ShieldCheck /> Solicitudes, chat y cotización</div>
              <div className="done"><ShieldCheck /> Reseñas verificadas y reportes con revisión humana</div>
            </div>
            <div className="card-actions">
              <Link className="button primary" to="/search">
                <Search /> Buscar proveedores
              </Link>
              <Link className="button secondary" to="/me">
                Ir a mi perfil
              </Link>
            </div>
          </section>
        </main>

        <aside>
          <section className="content-section">
            <h2><Sparkles /> Nota de producto</h2>
            <p>
              El acompañamiento para trámites, documentos o estado MIPYME queda como una línea futura.
              No se muestra como verificación activa, filtro público ni promesa de integración gubernamental.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
