# Flujos UX por rol — Conecta Emprende AI

Diagramas de flujo en formato secuencial (MVP <> flujo de demostración). Los números entre `[ ]` refieren a las pantallas del `sitemap.md`.

Convención de estados de solicitud usada en este documento:
- **Fase (workflow_phase):** `OPEN` → `COMPLETION_PENDING` → `CLOSED`
- **Resultado de cierre (closure_outcome):** `BILATERAL`, `CANCELLED_BY_REQUESTER`, `CANCELLED_BY_PROVIDER`, `CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT`, `MODERATION_CLOSURE`, cierres por timeout unilateral (72 h)
- **Moderación:** `CLEAN` / `FLAGGED` / `RESTRICTED`

---

## 1. Flujo del SOLICITANTE (persona que contrata)

```
Crear cuenta [6] ─ o ─ Iniciar sesión [5]
  → Búsqueda en lenguaje natural [2]  (ej. "empagues ecológicos en León baratos")
  → Revisión de resultados: tarjetas de proveedor (confianza, verificación, disponibilidad) + mapa
  → (opcional) Perfil público del proveedor [3] — revisar catálogo, medallas, reseñas verificadas
  → (opcional) Detalle de una oferta [4] — consultar por ese producto específico
  → Nueva solicitud de cotización [7]: título, descripción (≥20 car.), fecha, presupuesto, ciudad, canal
  → Chat + acuerdo [10]:
       · conversación bilateral asíncrona
       · proveedor envía cotización (precio + entrega) → mensaje de sistema en el hilo
       · solicitante acepta con "👍 De acuerdo con este precio" (o sigue negociando)
       · al terminar el trabajo, confirmación bilateral:
            Cliente confirma  →  queda COMPLETION_PENDING  →  proveedor confirma  →  CLOSED / BILATERAL
            (si el proveedor no confirma en 72 h, el sistema cierra unilateralmente)
       · reseña desbloqueada SOLO con cierre BILATERAL [10 / 9]
  → (opcional) Reportar conversación (revisión humana, sin sanción automática)
  → Seguimiento desde Mis solicitudes [8] y Mi perfil → Conversaciones [11/12]
```

## 2. Flujo del PROVEEDOR (persona que ofrece)

```
Crear cuenta [6] / Iniciar sesión [5]
  → Crear perfil proveedor desde Mi perfil (variante solicitante) [12] o directo en [13]
  → Editar perfil público [13]:
        nombre, frase corta (≥10 car.), ciudad, categoría, área de servicio, rango de precio,
        disponibilidad, respuesta estimada (h), descripción (≥40 car.), avatar/portada
  → Checklist de publicación: frase + descripción + ≥1 catálogo activo →"Publicar perfil" (DRAFT → ACTIVE)
  → Administrar catálogo [14]: crear producto/servicio (Producto, Servicio, Equipo, Alquiler,
        Reparación, Capacitación, Insumo, Materia prima), activar/desactivar, archivar, precio en C$
  → Aparecer en búsqueda y mapa de [2]
  → Recibir solicitudes en Conversaciones [8]/[10]:
        · contestar al cliente
        · enviar cotización (precio + entrega) desde el panel del chat [10]
        · confirmar finalización bilateral (misma mecánica 72 h del lado del cliente)
        · recibir reseña verificada cuando el trabajo se cierra BILATERAL
  → Crecer confianza / medallas (score, ≥3 trabajos bilaterales para mostrar calificación pública)
```

## 3. Flujo DOBLE ROL (solicitante + proveedor, cuenta de negocio)

Cuenta normal (solicitante) que además activa un perfil proveedor: puede comprar y vender. El panel `/me` muestra ambas caras (actividad comercial + catálogo + confianza del negocio). No hay mezcla de identidad: la sesión es una sola cuenta `REQUESTER` + `PROVIDER`.

## 4. Flujo VISITANTE (sin sesión)

```
Inicio [1] → Buscar [2] → Perfil proveedor [3] → Oferta [4] → Confianza [15]
  → al intentar "Solicitar cotización" → redirect a Iniciar sesión [5] (ProtectedRoute)
```

## 5. Flujo ADMIN (referencia, fuera de alcance de esta entrega parcial)

```
Reporte (desde perfil [3] o chat [10]) → Revisión humana en [17]
  → Descartar | En revisión | Escalar → Super admin: Inactivar, Suspender (con razón), Restringir, Reactivar, Banear
  → Auditoría de acciones (log) · sin sanción automática
```

## 6. Estados de borde relevantes a validar

| Estatus | Comportamiento |
|---|---|
| Proveedor `BANNED` / `SUSPENDED` | Banner de estado en perfil [3]; botón "Solicitar cotización" deshabilitado con explicación; catálogo no editable |
| Proveedor `DRAFT` | Solo visible para su dueño; panel [13] muestra checklist de publicación |
| Sin proveedores para la búsqueda | Estado vacío con guía de acción (cambiar ciudad/categoría/precio) |
| Funciones fuera de MVP | Tarjeta informativa "No disponible para el MVP" (ej. importar/exportar [ruta /serialization], 2FA en [16], compartir, contacto externo) |
| Búsqueda IA caída (503/429/499) | Fallback a búsqueda por keywords + mensaje de error con reintento |
| Sesión vencida (30 min inactividad) | Cierre de sesión / re-login |