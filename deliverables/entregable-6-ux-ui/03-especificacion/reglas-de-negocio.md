# Reglas de negocio — Conecta Emprende AI

Reglas funcionales extraídas del código real del MVP. Fuentes: `src/domain/*`, `src/lib/*`, `src/stores/*`, `prisma/schema.prisma`, `README.md`, `docs/*`.

---

## 1. Confianza y reputación

- El **Trust Score** es `/100` y combina actividad completada dentro de la plataforma, reseñas verificadas y nivel del perfil. Las conversaciones externas no suman.
- **Evidencia insuficiente:** con menos de **3 trabajos bilaterales** el proveedor no muestra calificación pública; aparece badge «N trabajo(s) · Evidencia insuficiente» (`TrustScoreBadge`).
- **Tramos del score:** `≥80` confianza alta · `≥60` media · resto base (colores `badge-trust-high/med/base`).
- **Señal del perfil:** `score ≥ 80` y `≥1 catálogo activo` ⇒ «Perfil comercial sólido»; si no, «Perfil en construcción».
- **Medallas:** se ganan con acciones verificadas (responder en la app, completar trabajos con confirmación bilateral, mantener catálogo actualizado). Recibir medallas requiere reglas públicas en `/trust`.
- **Anti-inflación:** los aportes por actividad tienen límites; la antigüedad pesa (ninguna cuenta nueva llega a confianza alta de un día para otro).
- **Verificación** separada de la reputación: `UNVERIFIED` (sin verificar) → `PHONE` (teléfono verificado) → `COMPLETE` (perfil verificado).

## 2. Solicitudes de cotización — modelo de 3 ejes

Cada hilo (`QuoteThread`) se describe con tres ejes ortogonales en lugar de un estado lineal:

- **Eje 1 — Fase (workflow_phase):** `OPEN` → `COMPLETION_PENDING` → `CLOSED`.
- **Eje 2 — Resultado de cierre (closure_outcome):** `BILATERAL` · `CANCELLED_BY_REQUESTER` · `CANCELLED_BY_PROVIDER` · `CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT` · `MODERATION_CLOSURE` · cierres unilaterales por timeout (72 h): `REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE` / `PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE`.
- **Eje 3 — Moderación (moderation_state):** `CLEAN` / `FLAGGED` / `RESTRICTED`.

Flujo operativo:
- El cliente abre la solicitud (fase `OPEN`). Conversación asíncrona.
- El proveedor **envía cotización** (precio + entrega) → mensaje de sistema «📋 Cotización enviada…».
- El cliente **acepta** cotización (`POST /api/quotes/:id/accept-quotation`) → mensaje «✅ El cliente aceptó la cotización…». Puede seguir negociando si no coincide.
- **Confirmación bilateral:** cualquiera de las partes confirma finalización (`PATCH /api/quotes/:id/complete`, rol `REQUESTER`/`PROVIDER`) → fase `COMPLETION_PENDING` con `completionDeadline` = **72 h**.
- Cron (`node-cron`, cada 10 min) cierra threads vencidos determinando el outcome. Endpoint manual de respaldo: `POST /api/admin/resolve-expired-quotes`.
- Una solicitud **solo se completa** cuando cliente y proveedor confirman (o el timeout resuelve unilateralmente).
- El campo `status` (String) se mantiene como capa de compatibilidad para la UI y se migra con `tsx scripts/migrate_quote_status_to_3axis.ts`.

## 3. Reseñas

- Una reseña **solo se desbloquea con finalización bilateral** (`CLOSED` + `BILATERAL`).
- **Una reseña por solicitud**, una sola vez.
- El formulario pide puntaje 1–5 (calidad, tiempo de respuesta, cumplimiento, comunicación, valor) y comentario ≥10 caracteres.
- Las reseñas muestran el sello «Trabajo confirmado por ambas partes» y alimentan el Trust Score.

## 4. Ciclo de vida del proveedor

- Estados: `DRAFT` (borrador, no visible) → `ACTIVE` → `SUSPENDED` / `BANNED` / `INACTIVE`.
- **Publicación** (DRAFT → ACTIVE) requiere: frase corta ≥10, descripción ≥40, y ≥1 catálogo activo.
- **Recibir solicitudes:** depende del estado (helpers `canReceiveRequests` / `isLifecycleBlockingStatus`). `BANNED`/`SUSPENDED` bloquean nuevas solicitudes; en algunos estados restringidos aún puede recibir (banner aclara).
- **Catálogo bloqueado** para `SUSPENDED`/`BANNED`/`INACTIVE` (no se pueden mutar ofertas).
- El perfil público muestra banner con heading, motivo, vigencia y si aún puede recibir solicitudes.

## 5. Reportes y moderación (admin)

- Reportes desde perfil (motivo + descripción ≥10) o desde una conversación.
- **Sin sanciones automáticas:** todo pasa a revisión humana.
- Flujo admin: `OPEN` → `UNDER_REVIEW` → `DISMISSED` | `ESCALATED` | `ACTION_TAKEN`.
- Super admin puede: Inactivar · Suspender (razón obligatoria, fecha opcional) · Restringir · Reactivar · Banear.
- Auditoría de acciones con actor (email/userId) y razón (requiere `SUPER_ADMIN`).

## 6. Búsqueda en lenguaje natural (IA)

- Consulta debounced (400 ms); con ≥2 caracteres llama a extracción de intención (ciudad, categoría) + ranking por confianza/ubicación/precio/disponibilidad.
- Las inferencias (ciudad/categoría) se muestran como **chips corregibles** y los filtros manuales tienen prioridad.
- **Errores:** clasificación de errores Gemini (503/429/499) → fallback a búsqueda por keywords + mensaje con `Retry-After`.
- Prompt y cache LRU en `src/lib/ai/*`.

## 7. Formalización (fuera del MVP)

- La plataforma **no promete** trámites, validación MIPYME ni integración gubernamental. La página `/formalization` es roadmap explícito.
- El producto actual cubre: búsqueda, perfiles, catálogo, solicitudes, chat, reseñas verificadas, confianza y revisión administrativa.

## 8. Accesibilidad (requisito de paleta del hackathon)

- Objetivo **WCAG 2.1 AA**: contraste 4.5:1 para texto, foco visible, navegación por teclado, controles etiquetados, estados que no dependen solo del color, movimiento reducido, adaptable móvil/escritorio.
- Paleta actual del MVP: primario `#001F3F`, secundario `#C0C0C0`, terciario `#004080`, neutro `#F5F5F5`, superficie `#fbfbfb`, error `oklch(52% .16 28)`. Texto principal `#001F3F` sobre fondo `#F5F5F5`: ratio alto (cumple AA); CTA blanco `#F5F5F5` sobre `#004080`: ratio alto. Verificar siempre combinaciones grises/intermedias al generar mockups.