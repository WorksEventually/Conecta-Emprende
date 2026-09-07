# Especificación por pantalla — Conecta Emprende AI

Detalle funcional de cada pantalla, extraído del código real del MVP (rama `test`, `99929d9`). Referencias: `[sitemap.md]` y `[wireframes.html]`.

Convención de estados por pantalla:
- 🟢 **Normal** · ⏳ **Carga** (skeleton/spinner) · 🕳️ **Vacío** · ⚠️ **Error** · 🚫 **Bloqueado por MVP**

---

## 1. Inicio — `/` (pública)

**Propósito:** aterrizar al usuario con la promesa de valor y llevarlo a la búsqueda en lenguaje natural.

- Hero: eyebrow «Hecho para emprender en Nicaragua» + H1 + párrafo + barra de búsqueda + botón «Buscar proveedores».
- Chips de ejemplo (4): Empaques ecológicos en León · Diseño de logos en Managua · Café orgánico en Matagalpa · Camisetas bordadas en Masaya.
- Panel de prueba: 50 proveedores demo / 10 ciudades creativas / 1 flujo completo de confianza.
- Franja inferior: 3 principios (Perfiles verificados · Reseñas con respaldo · Solicitudes dentro de la app).
- **Estados:** 🕳️ búsqueda vacía → error inline «Escribí lo que necesitás para buscar proveedores.» con `role="alert"`. 🚫 sin otros estados.
- **Navegación:** submit → `/search?query=…` · chip → misma ruta · «Explorar ciudades creativas» → `/search`.

## 2. Buscar proveedores — `/search` (pública)

**Propósito:** búsqueda con IA en lenguaje natural + filtros + mapa, con inferencias visibles y corregibles.

- Barra de búsqueda con debounce 400 ms; si ≥2 caracteres llama a la IA (`searchProvidersAI`); si no, lista general.
- Chips de intención inferidos (ciudad/categoría) removibles; filtros: ciudad, categoría, precio (Económico/Intermedio/Premium/Negociable), confianza mínima.
- Resultados: tarjetas con foto/placeholder, categoría, nombre, TrustBadge, descripción corta, city badge, PriceBadge, AvailabilityBadge, VerificationBadge, fila «Recomendado porque…», CTA.
- Mapa Leaflet sincronizado (hover/click ↔ lista); en móvil toggle lista/mapa.
- **Estados:** ⏳ skeleton (`SkeletonRows`). 🕳️ «No encontramos proveedores exactos — Probá con otra ciudad, categoría o rango de precio.» ⚠️ IA caída (503/429) → fallback keywords + error con reintento. 🚫 proveedor SUSPENDED/BANNED → botón deshabilitado con etiqueta.
- **Reglas por tarjeta:** si es tu perfil → «Editar mi perfil»; si no → «Solicitar cotización».

## 3. Perfil público del proveedor — `/providers/:providerId` (pública)

**Propósito:** ser la ficha de confianza del negocio: identidad, catálogo, reseñas verificadas y señales.

- Cover con gradiente + foto; back link; eyebrow categoría; H1; tagline; meta (ubicación, disponibilidad, tiempo de respuesta).
- Badges: TrustBadge, VerificationBadge, señal de perfil («Perfil comercial sólido» / «Perfil en construcción»).
- Banner de estado si SUSPENDED/BANNED (heading, motivo, vigencia, y si aún puede recibir solicitudes).
- Tabs catálogo: Todos · Productos · Servicios · Paquetes · Portafolio (solo ítems DISPONIBLE).
- Reseñas: estrellas + comentario + sello «Trabajo confirmado por ambas partes»; vacío con guía.
- Sidebar: confianza (score/100 + métricas), medallas, señales, acciones (Guardar · Editar (dueño) · Compartir 🚫MVP · Reportar).
- **Estados:** ⏳ skeleton. 🕳️ perfil no existe → «Perfil no encontrado». ⚠️ reporte modal (motivo + descripción ≥10, nota «sin sanciones automáticas»). 🚫 compartir deshabilitado.

## 4. Detalle de oferta — `/providers/:providerId/products/:productId` (pública)

**Propósito:** mostrar una oferta del catálogo con precio en C$, entrega y disponibilidad.

- Imagen, eyebrow (tipo · categoría), H1, descripción, hechos (Precio / Entrega / Disponibilidad), resumen del proveedor + TrustBadge, CTA «Consultar por este producto».
- Type map (8): Producto · Servicio · Equipo · Alquiler · Reparación · Capacitación · Insumo · Materia prima.
- **Estados:** 👍 si proveedor SUSPENDED/BANNED → CTA deshabilitado con banner; si es tu oferta → «Editar oferta».

## 5. Iniciar sesión — `/auth/login` (pública, sin layout)

**Propósito:** acceso con Google OAuth o email/contraseña.

- Brand, H2, banner de error (login o OAuth), botón «Continuar con Google» (requiere `GOOGLE_CLIENT_ID`; sin config → 503), email, contraseña (mostrar/ocultar), «Recordarme», submit, enlace a registro.
- **Estados:** ⚠️ credenciales inválidas (banner). 🚫 Google sin variables → mensaje de error.

## 6. Crear cuenta — `/auth/register` (pública, sin layout)

**Propósito:** alta de cuenta con validación de contraseña robusta.

- Nombre, email, contraseña con 4 reglas (≥8, mayúscula, número, especial) → medidor «débil / casi ahí / ¡segura!».
- Términos y privacidad (links), switch a login.
- **Estados:** ⚠️ error de registro (banner). Ya logueado → redirige.

## 7. Nueva solicitud de cotización — `/requests/new?providerId=…&productId=…` (protegida)

**Propósito:** abrir una conversación con un proveedor específico (o por oferta).

- Back al perfil; H1 «Cotizá con {proveedor}»; formulario: título (req.), descripción (≥20), fecha deseada, presupuesto, ciudad (10), canal (solo plataforma).
- Nota: «Mantener la conversación acá permite confirmar el trabajo y desbloquear una reseña verificada».
- **Estados:** ╬ sin `providerId` → «Elegí un proveedor primero». ⚠️ errores por campo. 🚫 proveedor SUSPENDED → botón deshabilitado «Proveedor no disponible».
- Éxito → navega a `/requests/:threadId/chat`.

## 8. Mis solicitudes — `/requests` (protegida)

**Propósito:** bandeja única de hilos con filtros por estado.

- Tabs: Activas (`OPEN`, `IN_CONVERSATION`) · No leídas · Completadas (`COMPLETED`) · Cerradas (`CANCELLED`, `CLOSED_*`).
- Filas: badge de estado, asunto, proveedor, último mensaje.
- **Estados:** ⏳ carga. 🕳️ vacío → guía a buscar proveedores.

## 9. Detalle de solicitud — `/requests/:requestId` (protegida)

**Propósito:** resumen del acuerdo + timeline + reseña cuando aplica.

- Header con estado + CTA «Abrir conversación»; sección necesidad compartida; resumen de conversación; timeline de 5 pasos; participantes.
- Si `COMPLETED` → formulario de reseña (1–5 estrellas + comentario ≥10) «Publicar reseña».
- Acciones de confirmación: «Confirmar como cliente» / «Confirmar como proveedor» / «Cerrar mi parte».
- **Estados:** ⏳ sin thread → «Cargando…». 🚫 reseña solo con cierre BILATERAL.

## 10. Chat + acuerdo — `/requests/:requestId/chat` (protegida)

**Propósito:** conversación comercial + cotización + confirmación bilateral + desbloqueo de reseña. Núcleo del MVP.

- Lista lateral de hilos (buscable); hilo con mensajes de cliente/proveedor y de sistema.
- Panel de «Solicitud vinculada»: asunto, descripción, proveedor, estado, cotización, entrega + botón «👍 De acuerdo con este precio» (cliente, si hay cotización sin aceptar).
- Fase del acuerdo: banner OPEN (negociación) → COMPLETION_PENDING (⏰ plazo 72 h) → CLOSED (✓ mensaje de outcome).
- Confirmación bilateral: check cliente/proveedor + botones según rol; «Cerrar mi parte».
- Panel proveedor: enviar cotización (precio + entrega → mensaje de sistema); respuestas rápidas por rol; reportar conversación (modal).
- **Estados:** 🚫 input deshabilitado cuando `CLOSED`. ⏳ carga de hilos. 🕳️ sin hilo seleccionado → «Tus Cotizaciones» + guía.

## 11. Mi perfil — panel PROVEEDOR — `/me` (protegida)

**Propósito:** centro de gestión del negocio (visibilidad, catálogo, conversaciones, confianza).

- Resumen de cuenta (monograma, nombre, email, badges); previsualización del perfil; fortaleza del perfil (% + checklist 8 ítems); productos y servicios (Activos/Inactivos/Más consultado); conversaciones (Activas/Completadas/Total + recientes); sidebar de confianza/medallas y calidad del perfil.
- 🚫 tarjeta «Importar y exportar no disponible para el MVP».

## 12. Mi perfil — panel SOLICITANTE — `/me` (protegida)

**Propósito:** seguimiento de solicitudes y puerta de entrada para vender.

- Resumen de cuenta «Solicitante»; actividad como solicitante (métricas + recientes); panel de upgrade «Creá un perfil proveedor cuando estés listo» → `/me/profile/edit`; estado de cuenta.

## 13. Editar perfil público — `/me/profile/edit` (protegida)

**Propósito:** crear/editar el perfil proveedor y publicarlo (DRAFT → ACTIVE).

- Campos: nombre público*, frase corta*, ciudad, categoría*, área, rango, disponibilidad, respuesta (h), contacto (solo plataforma), descripción* (≥40), avatar, portada.
- Panel «Publicar perfil» (si DRAFT): checklist frase ≥10 ✓ / descripción ≥40 ✓ / ≥1 catálogo activo ✓ → botón «Publicar».
- **Estados:** ⚠️ validación por campo. 🚫 proveedor SUSPENDED/BANNED no puede guardar/publicar. 🕳️ sin negocio → crea.

## 14. Administrar catálogo — `/me/products` (protegida)

**Propósito:** alta/baja de ofertas y control de disponibilidad.

- Filtros (Todos/Activos/Inactivos + tipos); ofertas con precio C$; toggle DISPONIBLE↔BAJO_PEDIDO; archivar; editar. Editor con 8 tipos de oferta.
- **Estados:** 🚫 catálogo bloqueado si SUSPENDED/BANNED/INACTIVE (banner).

## 15. Cómo funciona la confianza — `/trust` (pública)

**Propósito:** explicar con transparencia el modelo de confianza.

- 3 pilares (Verificación / Reputación / Antigüedad), medallas y reglas, protecciones del MVP (doble confirmación, reseña única, límites anti-inflación, revisión humana).

## 16. Seguridad de la cuenta — `/settings/security` (protegida)

**Propósito:** mostrar estado de la sesión y protecciones.

- Teléfono verificado; rol y permisos; sesión actual (30 min); «Cerrar otras sesiones». 🚫 2FA no disponible para el MVP.

---

## Fuera de alcance de esta entrega parcial (documentado por completitud)

- **17. Admin / Reportes — `/admin/reports`:** cola de reportes de riesgo; acciones Descartar · En revisión · Escalar · (Super admin) Inactivar · Suspender · Restringir · Reactivar · Banear; auditoría. Requiere roles `ADMIN`, `ADMIN_REVIEWER`, `SUPER_ADMIN`.
- **18. Formalización — `/formalization`:** página de roadmap que aclara que la formalización legal no es parte del MVP activo.
- **Unavailable — `/serialization`:** tarjeta «Importar y exportar no disponible para el MVP».