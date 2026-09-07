# Checklist de validación — Conecta Emprende AI

Recorrido guiado para validar la **funcionalidad** del producto, mapeado 1:1 con el flujo de demostración del README del MVP. Úsalo como guion de demo y como prueba de aceptación de los wireframes/mockups.

## Cómo preparar

- `npm install` (si es primera vez) y regenerar cliente Prisma: `npx prisma generate`.
- `npm run dev` → `http://localhost:3000`.
- Cuentas demo (contraseña `Conecta123!`): `requester@conecta.test` · `textil@conecta.test` (proveedor activo) · `cafe@conecta.test` (suspendido) · `equipos@conecta.test` (baneado) · `admin@conecta.test` · `superadmin@conecta.test`.
- Para probar perfiles demo: `VITE_ENABLE_DEMO_PROFILE_SWITCHER=true`.

---

## 📍 Paso 1 — Búsqueda en lenguaje natural

| # | Acción | Resultado esperado |
|---|---|---|
| 1.1 | Ir a `/` | Hero con buscador, chips de ejemplo, stats y franja de confianza |
| 1.2 | Escribir "Necesito empaques ecológicos en León que sean baratos" y buscar | Redirige a `/search?query=…`, lista de resultados + mapa |
| 1.3 | Verificar chips de intención | Aparece ciudad (León) y/o categoría (Empaques ecológicos) como chips removibles |
| 1.4 | Remover el chip de ciudad | Los resultados se recalculan sin el filtro de ciudad |
| 1.5 | Probar búsqueda vacía en el hero | Error inline con `role="alert"` |
| 1.6 | Probar un filtro manual (precio/confianza) | Resultados se reordenan/filtran |
| 1.7 | (Si la IA cae) | Fallback a búsqueda por keywords + mensaje de error con reintento |

**Criterio:** la búsqueda natural "se siente sencilla, pero sus inferencias permanecen visibles y corregibles".

## 📍 Paso 2 — Perfil público y señales de confianza

| # | Acción | Resultado esperado |
|---|---|---|
| 2.1 | Abrir un resultado | Cover, badges (confianza, verificación, señal), catálogo, reseñas, sidebar de confianza |
| 2.2 | Revisar tabs del catálogo | Todos / Productos / Servicios / Paquetes / Portafolio (solo activos) |
| 2.3 | Abrir un perfil sin reseñas | Estado vacío "Todavía no hay reseñas verificadas" + guía |
| 2.4 | Abrir `cafe@conecta.test` (suspendido) | Banner de estado con motivo; CTA bloqueado con explicación |
| 2.5 | Abrir `equipos@conecta.test` (baneado) | Badge/estado baneado; no puede recibir solicitudes |
| 2.6 | Probar "Guardar proveedor" | Toggle guardado/no guardado |
| 2.7 | Probar "Reportar perfil" | Modal con motivos + descripción; nota de revisión humana |
| 2.8 | Probar "Compartir" | Deshabilitado con tooltip "No disponible para el MVP" |

**Criterio:** la confianza se demuestra con evidencia visible y la UI explica límites honestamente.

## 📍 Paso 3 — Solicitar cotización

| # | Acción | Resultado esperado |
|---|---|---|
| 3.1 | Desde un perfil → "Chatear y solicitar cotización" | `/requests/new?providerId=…` (pide login si es necesario) |
| 3.2 | Enviar sin título | Error "Escribí un título" |
| 3.3 | Enviar con descripción corta | Error "Contanos un poco más, al menos 20 caracteres" |
| 3.4 | Completar y enviar | Crea hilo y navega a `/requests/:id/chat` |
| 3.5 | Probar `/requests/new` sin `providerId` | Estado vacío "Elegí un proveedor primero" |
| 3.6 | Entrar con proveedor SUSPENDED | Botón deshabilitado "Proveedor no disponible" |

## 📍 Paso 4 — Conversación, cotización y confirmación bilateral

| # | Acción | Resultado esperado |
|---|---|---|
| 4.1 | Enviar mensaje como solicitante y como proveedor (switch de perfil) | Mensajes aparecen con autor/rol correcto |
| 4.2 | Proveedor envía cotización (precio + entrega) | Aparece mensaje de sistema "📋 Cotización enviada…" en el hilo |
| 4.3 | Cliente acepta con "👍 De acuerdo con este precio" | Mensaje "✅ El cliente aceptó la cotización…" |
| 4.4 | Cliente confirma finalización | Banner "Esperando confirmación de la otra parte — Plazo 72 h" |
| 4.5 | Proveedor confirma | Cierre `BILATERAL`; mensaje "Ambas partes confirmaron el trabajo completado"; reseña desbloqueada |
| 4.6 | (Opcional) Probar timeout | Tras 72 h sin confirmación, el cron cierra unilateralmente con el outcome correspondiente |
| 4.7 | Probar "Cerrar mi parte" | Hilo se cierra con `CANCELLED_BY_REQUESTER/PROVIDER` |
| 4.8 | Intentar escribir en un hilo cerrado | Input deshabilitado "Esta cotización ha sido cerrada." |
| 4.9 | Probar "Reportar conversación" | Modal con descripción ≥10 |

**Criterio:** una solicitud solo se completa con doble confirmación; el usuario siempre sabe cuál es la próxima acción.

## 📍 Paso 5 — Reseña verificada

| # | Acción | Resultado esperado |
|---|---|---|
| 5.1 | Con un hilo `CLOSED`/`BILATERAL`, ir al detalle | Formulario de reseña visible |
| 5.2 | Publicar reseña (estrellas + comentario) | Se guarda; aparece en el perfil del proveedor con sello "Trabajo confirmado por ambas partes" |
| 5.3 | Intentar reseñar dos veces la misma solicitud | No permitido (una por solicitud) |

## 📍 Paso 6 — Gestión de perfil y publicación

| # | Acción | Resultado esperado |
|---|---|---|
| 6.1 | Ir a `/me` como proveedor | Panel completo: fortaleza %, catálogo, conversaciones, confianza |
| 6.2 | Entrar a "Editar perfil público" | Formulario con validación; panel de publicación si DRAFT |
| 6.3 | Completar requisitos (frase ≥10, descripción ≥40, ≥1 catálogo activo) | Botón "Publicar perfil" se habilita; al publicar el perfil pasa a visible |
| 6.4 | Revisar el perfil público | El negocio aparece en búsqueda/mapa con las señales actualizadas |
| 6.5 | Como solicitante (sin negocio) | Panel de solicitante con upgrade "Creá un perfil proveedor" |
| 6.6 | Administrar catálogo | Crear oferta (8 tipos), toggle activo/inactivo, archivar |

## 📍 Paso 7 — Confianza y seguridad

| # | Acción | Resultado esperado |
|---|---|---|
| 7.1 | Ir a `/trust` | Explicación de verificación / reputación / antigüedad + protecciones |
| 7.2 | Ir a `/settings/security` | Teléfono, rol, sesión; 2FA marcado como no disponible |
| 7.3 | Cerrar sesión | Vuelve a estado visitante; rutas protegidas redirigen a login |

## 📍 Paso 8 — Accesibilidad (muestreo)

- Navegar por teclado (Tab) con foco visible en los controles principales.
- Verificar contraste de textos (blanco sobre `#004080`, `#001F3F` sobre `#F5F5F5`).
- Probar movimiento reducido si el SO lo soporta.

---

## Registro de validación

| Fecha | Probado por | Resultado | Hallazgos / notas |
|---|---|---|---|
|  |  | ✅ / ❌ |  |