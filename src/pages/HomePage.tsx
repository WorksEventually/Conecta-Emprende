import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Building2, MapPin, MessageCircle, Search, ShieldCheck } from "lucide-react";

const examples = ["Empaques ecológicos en León", "Diseño de logos en Managua", "Café orgánico en Matagalpa", "Camisetas bordadas en Masaya"];
export default function HomePage() {
  const [query,setQuery] = useState(""); const [error,setError] = useState(""); const navigate = useNavigate();
  const submit = (value=query) => { if (!value.trim()) { setError("Escribí lo que necesitás para buscar proveedores."); return; } navigate(`/search?query=${encodeURIComponent(value.trim())}`); };
  return <div className="home-page">
    <section className="home-hero">
      <div className="home-copy"><span className="eyebrow"><MapPin size={15}/> Hecho para emprender en Nicaragua</span><h1>Encontrá quién puede ayudarte a dar el siguiente paso.</h1><p>Contanos qué necesitás como lo dirías en un mensaje. Ordenamos opciones locales por confianza, ubicación, precio y disponibilidad.</p>
        <form className="hero-search" onSubmit={e=>{e.preventDefault();submit();}}><Search aria-hidden="true"/><input aria-label="¿Qué necesitás?" value={query} onChange={e=>{setQuery(e.target.value);setError("");}} maxLength={240} placeholder="¿Qué necesitás? Escribilo como un mensaje…"/><button>Buscar proveedores <ArrowRight size={18}/></button></form>{error && <p className="field-error" role="alert">{error}</p>}
        <div className="example-chips" aria-label="Ejemplos de búsqueda">{examples.map(item=><button key={item} onClick={()=>{setQuery(item);submit(item);}}>{item}</button>)}</div>
        <Link className="text-link" to="/search"><MapPin size={17}/> Explorar ciudades creativas</Link>
      </div>
      <aside className="home-proof"><div className="network-mark"><Building2/></div><p className="proof-kicker">Red local, decisiones con evidencia</p><h2>Conexiones más claras desde la primera búsqueda.</h2><dl><div><dt>50</dt><dd>proveedores de demostración</dd></div><div><dt>10</dt><dd>ciudades creativas</dd></div><div><dt>1</dt><dd>flujo completo de confianza</dd></div></dl></aside>
    </section>
    <section className="trust-strip" aria-label="Cómo construimos confianza"><div><BadgeCheck/><span><strong>Perfiles verificados</strong>Sabés qué información fue confirmada.</span></div><div><ShieldCheck/><span><strong>Reseñas con respaldo</strong>Solo después de un trabajo confirmado por ambas partes.</span></div><div><MessageCircle/><span><strong>Solicitudes dentro de la app</strong>Chat, cotización y cierre quedan conectados al historial.</span></div></section>
  </div>;
}
