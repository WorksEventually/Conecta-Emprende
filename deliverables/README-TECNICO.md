# TradeArc — README Técnico

Documentación técnica de la plataforma TradeArc (repositorio `Conecta-Emprende`): marketplace de confianza comercial que conecta personas emprendedoras, trabajadoras independientes, MIPYMES y proveedores de Nicaragua.

El documento describe la arquitectura, las dependencias, las variables de entorno, la estructura modular, los scripts y la API. Refleja el estado de la rama `test` tras el merge de Sprint 8 (Trust Score v2).

---

## Tabla de contenido

1. [Arquitectura](#1-arquitectura)
2. [Dependencias](#2-dependencias)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Puesta en marcha](#4-puesta-en-marcha)
5. [Estructura modular](#5-estructura-modular)
6. [Modelo de datos](#6-modelo-de-datos)
7. [Autenticación y autorización](#7-autenticación-y-autorización)
8. [Capas transversales](#8-capas-transversales)
9. [Trust Score v2](#9-trust-score-v2)
10. [Integración de IA](#10-integración-de-ia)
11. [Scripts](#11-scripts)
12. [API: ejemplos de endpoints](#12-api-ejemplos-de-endpoints)
13. [Referencia completa de endpoints](#13-referencia-completa-de-endpoints)

---

## 1. Arquitectura

TradeArc es una aplicación monolítica de un solo proceso. Un servidor Express sirve la API bajo `/api/` y monta Vite como middleware para la aplicación React. En desarrollo Vite corre en modo HMR; en producción se sirve el build estático desde `dist/`.

```
┌──────────────────────────────────────────────────────────────┐
│  Navegador                                                   │
│  React 19 + React Router 7 + Zustand + Leaflet               │
└────────────────────────┬─────────────────────────────────────┘
                         │  HTTP / cookies httpOnly
┌────────────────────────▼─────────────────────────────────────┐
│  server.ts — Express 4                                       │
│  ├─ Vite middleware (dev: HMR · prod: dist estático)         │
│  ├─ authenticate · requireSuperAdmin · idempotencyMiddleware  │
│  ├─ Validación Zod (src/lib/api-schema.ts)                   │
│  └─ node-cron: resolución de cierres vencidos (cada 10 min)   │
└────────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼──────┐ ┌───────▼──────┐ ┌───────▼──────────┐
│ Servicios    │ │ Dominio puro │ │ Gemini API       │
│ src/lib/*    │ │ src/domain/* │ │ intención, bio,  │
│ (Prisma)     │ │ (sin I/O)    │ │ borradores       │
└───────┬──────┘ └──────────────┘ └──────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────┐
│  PostgreSQL + Prisma 5.22                                    │
│  37 modelos · 23 migraciones · snapshots append-only          │
└──────────────────────────────────────────────────────────────┘
```

### Decisiones de arquitectura

**Un solo proceso, un solo despliegue.** Express sirve API y frontend. Evita CORS, simplifica el despliegue y permite compartir tipos TypeScript entre cliente y servidor sin paquetes intermedios.

**Dominio separado de infraestructura.** `src/domain/` contiene funciones puras sin acceso a base de datos: cálculo de Trust Score, reglas de elegibilidad de reseñas, scoring de riesgo. Esto permite testearlas sin levantar PostgreSQL — el suite `test:trust-v2` corre 13 casos en milisegundos porque no toca I/O.

**Estado de solicitudes en tres ejes.** En lugar de un único campo `status` con quince valores, `QuoteThread` modela el ciclo de vida en ejes independientes:

| Eje | Enum | Responde a |
|---|---|---|
| `workflow_phase` | `WorkflowPhase` | ¿En qué punto del flujo está? |
| `closure_outcome` | `ClosureOutcome` | ¿Cómo terminó? |
| `moderation_state` | `ModerationState` | ¿Hay intervención de moderación? |

El campo `status` original permanece marcado como deprecado por compatibilidad con el frontend legacy. Las tres dimensiones son ortogonales: una solicitud puede estar `CLOSED` + `BILATERAL` + `FLAGGED` simultáneamente, y cada eje se consulta sin ambigüedad.

**Eventos de reputación como fuente de verdad.** El Trust Score no se calcula sobre agregados mutables. Cada hecho que afecta la reputación se registra como `ReputationEvent` inmutable con su `algorithmVersion`. Los scores se derivan de esos eventos, lo que permite reconstruir cualquier score de forma determinista (`npm run rebuild:trust-scores`) e invalidar evidencia individual sin recalcular a mano.

**Snapshots append-only.** Cada recálculo escribe un `TrustScoreSnapshot` con el desglose y los topes aplicados. Nunca se sobrescriben: son el registro auditable de por qué un proveedor tuvo cierto score en cierto momento.

### Capas y flujo de una petición

```
Petición  →  authenticate  →  Zod  →  servicio (src/lib)  →  dominio (src/domain)  →  Prisma
Respuesta ←──────────────── { success, data } | { success, error } ────────────────────────┘
```

Las rutas de `server.ts` no contienen lógica de negocio: validan, delegan a un servicio y formatean la respuesta. Los servicios orquestan Prisma y llaman al dominio puro para los cálculos.

---

## 2. Dependencias

### Stack principal

| Capa | Tecnología | Versión |
|---|---|---|
| Framework frontend | React + React DOM | 19.0.1 |
| Enrutado | react-router-dom | 7.15.1 |
| Estado global | Zustand | 5.0.13 |
| Datos remotos | @tanstack/react-query | 5.100.11 |
| Estilos | Tailwind CSS + @tailwindcss/vite | 4.1.14 |
| Iconos | lucide-react | 0.546.0 |
| Animación | motion | 12.40.0 |
| Mapas | leaflet + react-leaflet + markercluster | 1.9.4 / 5.0.0 |
| Build | Vite | 6.2.3 |
| Servidor | Express | 4.21.2 |
| ORM | Prisma + @prisma/client | 5.22.0 |
| Validación | Zod | 4.4.3 |
| Auth | jsonwebtoken + bcryptjs + cookie-parser | 9.0.2 / 2.4.3 |
| Tareas programadas | node-cron | 4.6.0 |
| IA | @google/genai | 1.29.0 |
| Fechas | date-fns | 4.2.1 |
| Lenguaje | TypeScript | ~5.8.2 |
| Ejecución TS | tsx | 4.21.0 |
| Bundle servidor | esbuild | 0.25.0 |

### Restricciones de dependencias

Estas reglas son deliberadas y están documentadas en `AGENTS.md`:

- **Mapas: solo Leaflet + OpenStreetMap.** No Google Maps (requiere API key y facturación), no tiles de CARTO. Los tiles vienen de `tile.openstreetmap.org`.
- **Iconos: solo `lucide-react`.** Un único set para mantener consistencia visual.
- **Validación: Zod en todo payload entrante de `/api/`.** Sin excepciones.
- **Estilos: Tailwind como motor único.** Los tokens de marca viven en `src/index.css`.

No hay dependencias de servicios de pago. La aplicación corre completa con PostgreSQL local; la única integración externa es Gemini, y degrada a heurística local si no hay clave.

---

## 3. Variables de entorno

Copiar `.env.example` a `.env` y completar. El archivo `.env` está en `.gitignore`.

### Base de datos

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL que consume Prisma. |
| `POSTGRES_DB` | Solo Docker | Nombre de la base que crea `docker-compose`. |
| `POSTGRES_USER` | Solo Docker | Usuario que crea `docker-compose`. |
| `POSTGRES_PASSWORD` | Solo Docker | Contraseña que crea `docker-compose`. |
| `POSTGRES_PORT` | Solo Docker | Puerto publicado por el contenedor. Por defecto `5432`. |

### Autenticación

| Variable | Obligatoria | Descripción |
|---|---|---|
| `JWT_SECRET` | Sí | Secreto de firma del access token. Mínimo 32 caracteres. |
| `JWT_REFRESH_SECRET` | Sí | Secreto de firma del refresh token. Debe ser distinto de `JWT_SECRET`. |
| `ACCESS_TOKEN_EXPIRY` | No | Vigencia del access token. Por defecto `15m` en desarrollo, `1h` en producción. |
| `REFRESH_TOKEN_EXPIRY` | No | Vigencia del refresh token. Por defecto `7d`. |

Generar secretos con `openssl rand -base64 64`. Nunca reutilizar el mismo valor para ambos: si el secreto de acceso se filtra, un refresh token firmado con la misma clave permitiría reemitir sesiones indefinidamente.

### OAuth Google

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GOOGLE_CLIENT_ID` | No | Client ID de OAuth. Sin él, el login con Google queda deshabilitado. |
| `GOOGLE_CLIENT_SECRET` | No | Client Secret de OAuth. |

La URI de redirección autorizada en Google Cloud Console debe coincidir exactamente con `${APP_URL}/api/auth/google/callback`.

### Aplicación

| Variable | Obligatoria | Descripción |
|---|---|---|
| `APP_URL` | Sí | URL base pública. Se usa para construir el callback de OAuth. |
| `NODE_ENV` | No | `development` o `production`. Controla HMR, endurecimiento de cookies y vigencia de tokens. |
| `APP_PORT` | No | Puerto de escucha. Por defecto `3000`. |
| `VITE_ENABLE_DEMO_PROFILE_SWITCHER` | No | Conmutador manual de perfiles para desarrollo. **Mantener en `false` en producción.** |

### IA

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GEMINI_API_KEY` | No | Clave de Gemini para extracción de intención, mejora de biografías y borradores. Sin ella el sistema degrada a heurística local por palabras clave. |

### Notas de seguridad

`NODE_ENV=production` endurece el comportamiento de las cookies: `secure: true` (solo HTTPS) y `sameSite: "strict"` en lugar de `"lax"`. Desplegar sin esta variable deja las cookies de sesión transmisibles por HTTP.

`VITE_ENABLE_DEMO_PROFILE_SWITCHER` expone un selector de perfiles en el cliente. En producción permitiría suplantar perfiles.

---

## 4. Puesta en marcha

### Con Docker

```bash
cp .env.example .env          # completar JWT_SECRET y JWT_REFRESH_SECRET
docker compose up -d          # levanta PostgreSQL y la app
```

### Local

```bash
cp .env.example .env
npm install
npx prisma migrate deploy     # aplica las 23 migraciones
npx prisma generate           # genera el client tipado
npm run db:seed               # datos de demostración
npm run dev                   # http://localhost:3000
```

`npx prisma generate` no es opcional. El Prisma Client se genera desde el schema hacia `node_modules`, y un client desactualizado produce docenas de errores de tipo que no corresponden a fallas reales del código. Regenerar después de cada `git pull` que toque `prisma/schema.prisma`.

### Producción

```bash
npm run build                 # vite build + esbuild del servidor a dist/server.cjs
npm run start                 # fuerza NODE_ENV=production
```

---

## 5. Estructura modular

```
Conecta-Emprende/
├── server.ts                 # API completa y arranque del servidor (~96 KB)
├── prisma/
│   ├── schema.prisma         # 37 modelos, 12 enums
│   ├── migrations/           # 23 migraciones aditivas
│   └── seed.ts               # datos de demostración
├── scripts/                  # tests y utilidades de mantenimiento
├── deliverables/             # documentación de entregables
└── src/
    ├── main.tsx              # punto de entrada React
    ├── App.tsx               # árbol de rutas
    ├── index.css             # tokens de marca TradeArc
    ├── api/                  # clientes HTTP tipados
    ├── auth/                 # perfiles de demostración
    ├── components/           # componentes React
    ├── domain/               # lógica pura sin I/O
    ├── hooks/                # hooks reutilizables
    ├── lib/                  # servicios de acceso a datos
    ├── pages/                # vistas enrutadas
    ├── stores/               # estado global Zustand
    └── types/                # declaraciones TypeScript
```

### `src/domain/` — lógica pura

Sin dependencias de Prisma, red ni entorno. Recibe datos, devuelve datos. Es la capa testeable sin infraestructura.

| Archivo | Responsabilidad |
|---|---|
| `rating/calculateTrustScoreV2.ts` | Cálculo normativo del Trust Score: ocho componentes, siete topes independientes, umbral de evidencia. |
| `rating/calculateAverageRating.ts` | Promedio bayesiano de calificaciones. |
| `requests/reviewRules.ts` | Elegibilidad y ventana de edición de reseñas. |
| `risk/calculateRiskScore.ts` | Scoring de riesgo para telemetría de moderación. |

### `src/lib/` — servicios

Orquestan Prisma y coordinan el dominio.

| Archivo | Responsabilidad |
|---|---|
| `db.ts` | Instancia singleton de Prisma Client. |
| `auth.ts` | Hash bcrypt, firma y verificación JWT, gestión de cookies. |
| `api-schema.ts` | 23 esquemas Zod de validación de entrada. |
| `providers-service.ts` | Búsqueda, perfil completo y datos de mapa de proveedores. |
| `quotes-service.ts` | Ciclo de vida de solicitudes: creación, cierre, confirmación bilateral. |
| `trust-score-service.ts` | Recálculo, persistencia y snapshot del Trust Score. |
| `reputation-events-service.ts` | Registro y ponderación de evidencia de reputación. |
| `request-events-service.ts` | Bitácora de eventos de solicitud. |
| `risk-telemetry-service.ts` | Análisis de riesgo y generación de reportes. |
| `catalog-service.ts` | Catálogo de ofertas de proveedores. |
| `content-validation.ts` | Validación de contenido de texto libre. |
| `identity.ts` | Resolución de identidad y perfiles. |
| `serialization.ts` | Exportación de snapshots del marketplace. |
| `logger.ts` | Logger estructurado. |
| `chat-helpers.ts` | Utilidades de hilos de conversación. |
| `utils.ts` | Helpers compartidos. |
| `cron/resolve-expired-quotes.ts` | Resolución de cierres vencidos por timeout. |
| `ai/` | Integración con Gemini. Ver [sección 10](#10-integración-de-ia). |

### `src/pages/` — vistas

| Archivo | Rutas |
|---|---|
| `HomePage.tsx` | `/` |
| `SearchPage.tsx` | `/search` (alias `/buscar`) |
| `ProviderPage.tsx` | `/providers/:providerId`, `/proveedor/:id` |
| `OfferPages.tsx` | `/providers/:providerId/products/:productId` |
| `LoginPage.tsx` / `RegisterPage.tsx` | `/auth/login`, `/auth/register` |
| `AuthPages.tsx` | Vistas auxiliares de autenticación |
| `RequestPages.tsx` | `/requests`, `/requests/sent`, `/requests/received`, `/requests/new`, `/requests/:requestId` |
| `ChatPage.tsx` | `/requests/:requestId/chat` |
| `QuotesPage.tsx` | Listado de cotizaciones |
| `AccountPages.tsx` | `/me`, `/profile/me`, `/settings/security` |
| `MyProfileDashboardPage.tsx` | `/provider/me` |
| `EditPublicProfilePage.tsx` | `/me/profile/edit` |
| `ProfilePage.tsx` | Perfil de usuario |
| `FormalizationPage.tsx` | `/formalization` |
| `AdminReportsPage.tsx` | `/admin/reports`, `/admin/risk-reports` |
| `AdminThreadEventsPage.tsx` | `/admin/threads/:id/events` |
| `UnavailablePage.tsx` | `/serialization` y funciones no disponibles |

Las rutas protegidas se envuelven en `ProtectedRoute`. Las rutas legacy `/dashboard/*` redirigen a sus equivalentes actuales.

### `src/components/`

| Carpeta | Contenido |
|---|---|
| `ui/` | Primitivas: `Button`, `Input`, `Select`, `TextArea`, `Skeleton`, `LoadingSpinner`, `ErrorBanner`, `ConfirmDialog`, `DashboardCard`, `SearchFilterBar`, `PasswordStrength`, `BrandMark`. |
| `auth/` | `AuthBoundary`, `ProtectedRoute`. |
| `layout/` | `RootLayout`, `DashboardLayout`. |
| `map/` | `MvpProviderMap` (mapa principal con clustering y vista previa), `ProviderMap`. |
| `provider/` | `TrustScoreBadge`. |
| `mvp/` | `Ui.tsx`: vocabulario visual de confianza, verificación y estados. |
| `dev/` | `DemoProfileSwitcher`, solo desarrollo. |

### `src/stores/` — Zustand

| Store | Estado |
|---|---|
| `auth-store.ts` | Sesión activa. Sin persistencia deliberada. |
| `providers-store.ts` | Resultados de búsqueda y proveedor seleccionado. |
| `quotes-store.ts` | Solicitudes y cotizaciones. |
| `search-store.ts` | Filtros e intención de búsqueda. |
| `toast-store.ts` | Notificaciones. |
| `mvp-store.ts` | Store persistente de demostración. |

### `src/api/` — clientes HTTP

`http.ts` centraliza `fetch` con manejo de errores y credenciales. `adminApi.ts`, `profileApi.ts`, `ratingApi.ts` y `requestApi.ts` exponen funciones tipadas por dominio.

---

## 6. Modelo de datos

37 modelos Prisma agrupados por dominio.

### Identidad y sesión

`User`, `RoleAssignment`, `RefreshToken`, `Account`, `Session`, `EmailVerificationToken`, `PasswordResetToken`

Una cuenta no tiene un tipo exclusivo. `RoleAssignment` guarda permisos transversales, de modo que una misma persona puede ser solicitante y proveedora sin duplicar cuentas.

### Geografía y taxonomía

`Department`, `City`, `Category`

### Proveedores

`Provider`, `ProviderCategory`, `ProviderBusinessHour`, `ProviderDeliveryOption`, `ProviderPhoto`, `ProviderMedal`, `ProviderMetrics`

`ProviderMetrics` mantiene los agregados vigentes, incluida la separación entre `trustScore` (interno, auditoría) y `publicTrustScore` (expuesto).

### Reputación

`TrustScore`, `TrustScoreSnapshot`, `Review`, `ReviewHistory`, `ReviewAnalysis`, `ReputationEvent`

### Moderación

`RiskReport`, `ModerationAuditLog`

### Catálogo

`CatalogItem`, `CatalogItemCategory`, `CatalogItemMetrics`, `CatalogItemPhoto`, `EquipmentDetail`

### Solicitudes

`QuoteThread`, `QuoteOffer`, `QuoteMessage`, `RequestEvent`, `ProviderPrivateFeedback`, `ProviderPrivateFeedbackHistory`

### Formalización

`FormalizationChecklist`, `FormalizationStep`

La formalización legal es roadmap. El MVP registra progreso pero no promete trámites ni validación MIPYME.

### Enums

**`Role`** — `USER`, `PROVIDER`, `ADMIN`, `ADMIN_REVIEWER`, `SUPER_ADMIN`

**`ProviderStatus`** — `DRAFT`, `ACTIVE`, `INACTIVE`, `TEMPORARILY_RESTRICTED`, `SUSPENDED`, `BANNED`

**`WorkflowPhase`** — `OPEN`, `COMPLETION_PENDING`, `CLOSED`

**`ClosureOutcome`**

| Valor | Significado |
|---|---|
| `BILATERAL` | Ambas partes confirmaron dentro de 72 h. |
| `REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE` | Cliente confirmó, proveedor no respondió. |
| `PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE` | Proveedor confirmó, cliente no respondió. |
| `CANCELLED_BY_REQUESTER` | Cancelación del cliente. |
| `CANCELLED_BY_PROVIDER` | Cancelación del proveedor sin interacción previa. |
| `CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT` | Cancelación tras interacción; habilita reseña con peso 0.5. |
| `DECLINED_BY_PROVIDER` | Rechazo antes de interactuar. |
| `EXPIRED_NO_PROVIDER_RESPONSE` | Nadie respondió. |
| `MODERATION_CLOSURE` | Cierre por moderación. |
| `CLOSED_BY_ADMIN` | Cierre administrativo. |
| `ACCOUNT_DEACTIVATED` | Cuenta desactivada durante la interacción. |

**`ModerationState`** — `CLEAN`, `FLAGGED`, `RESTRICTED`

**`EvidenceType`** — `BILATERAL_COMPLETION`, `UNILATERAL_REVIEW_QUALIFIED`, `UNILATERAL_REVIEW_UNQUALIFIED`, `CONTACT_CONFIRMATION`, `PENALTY_SUSPICIOUS_ACTIVITY`, `PENALTY_POLICY_VIOLATION`

**`RequestEventType`** — `REQUEST_CREATED`, `PROVIDER_RESPONDED`, `QUOTE_ACCEPTED`, `COMPLETION_REQUESTED`, `COMPLETION_CONFIRMED`, `COMPLETION_TIMEOUT`, `COMPLETION_NOT_ACCEPTED`, `COMPLETION_REQUEST_WITHDRAWN`, `CANCELLED_BY_REQUESTER`, `CANCELLED_BY_PROVIDER`, `REQUEST_DECLINED`, `REQUEST_EXPIRED`, `MODERATION_FLAG`, `MODERATION_CLOSURE`, `REOPENED`, `MESSAGE_SENT`, `DEADLINE_EXTENDED`, `ADMIN_OVERRIDE`

**`Availability`** — `DISPONIBLE`, `OCUPADO`, `BAJO_PEDIDO`, `NO_DISPONIBLE_TEMPORALMENTE`

**`FormalizationStatus`** — `INFORMAL`, `EN_PROCESO`, `MIPYME_FORMAL`, `DOCUMENTOS_PENDIENTES`

**`LegacyCity`** — `MANAGUA`, `LEON`, `GRANADA`, `MASAYA`, `ESTELI`, `MATAGALPA`, `BLUEFIELDS`, `JUIGALPA`, `NAGAROTE`, `SAN_JUAN_DE_ORIENTE`

---

## 7. Autenticación y autorización

### Mecanismo

Autenticación por JWT en cookies `httpOnly`. El token nunca se expone a JavaScript del cliente, lo que elimina el vector de robo por XSS que tendría `localStorage`.

| Aspecto | Implementación |
|---|---|
| Hash de contraseña | bcrypt (`bcryptjs`) |
| Access token | JWT firmado con `JWT_SECRET`. 15 min en desarrollo, 1 h en producción. |
| Refresh token | JWT firmado con `JWT_REFRESH_SECRET`. 7 días. Persistido en `RefreshToken`. |
| Transporte | Cookies `httpOnly` |
| `secure` | `true` cuando `NODE_ENV=production` |
| `sameSite` | `strict` en producción, `lax` en desarrollo |
| OAuth | Google, con cookie de estado de 10 min contra CSRF |

Implementación en `src/lib/auth.ts`. Documentación adicional en `AUTH.md`.

### Middleware de autorización

Definidos en `server.ts`:

| Middleware | Línea | Comportamiento |
|---|---|---|
| `authenticate` | 163 | Lee `access_token` de cookies y lo verifica. `401` si falta o expiró. Adjunta el payload a `req.user`. |
| `requireAdminReviewerOrSuperAdmin` | 269 | Exige rol `ADMIN_REVIEWER` o `SUPER_ADMIN`. |
| `requireSuperAdmin` | 278 | Exige rol `SUPER_ADMIN`. |

La separación entre revisor y superadministrador es intencional: un revisor gestiona reportes de riesgo y consulta bitácoras, pero no puede suspender, banear ni reactivar proveedores. Esas acciones quedan reservadas a `SUPER_ADMIN`.

Ser proveedor no otorga permisos administrativos. `PROVIDER` es un perfil comercial, no un rol de moderación.

---

## 8. Capas transversales

### Validación

Todo payload entrante se valida con Zod antes de tocar la base de datos. Los 23 esquemas viven en `src/lib/api-schema.ts` y siguen la convención `<dominio><Acción>Schema`.

### Idempotencia

`idempotencyMiddleware` (`server.ts:197`) protege operaciones no repetibles. El cliente envía una cabecera `Idempotency-Key`; si la misma clave llega de nuevo, se devuelve la respuesta cacheada sin re-ejecutar la operación. TTL de 24 h, limpieza cada hora.

Aplicado a `POST /api/quotes`, `PATCH /api/quotes/:id/complete` y `POST /api/reviews`: crear una solicitud duplicada, cerrar dos veces un trabajo o publicar la misma reseña por un doble clic tendría consecuencias sobre la reputación.

El almacén es un `Map` en memoria. Con múltiples instancias del proceso, cada una tendría su propio cache y la garantía se rompería. Para escalar horizontalmente habría que moverlo a Redis o a una tabla.

### Concurrencia

`QuoteThread` tiene un campo `version` para bloqueo optimista. Dos partes confirmando el cierre simultáneamente no pueden pisarse: la segunda escritura detecta la versión desactualizada. Validado por `scripts/test_concurrency.ts`.

### Tareas programadas

`node-cron` ejecuta `resolveExpiredQuotes` cada 10 minutos (`server.ts:2654`). Resuelve solicitudes cuyo plazo de confirmación de 72 h venció, asignando el `ClosureOutcome` correspondiente según quién confirmó. También existe disparo manual vía `POST /api/admin/resolve-expired-quotes`.

### Bitácoras

`RequestEvent` registra el ciclo de vida de cada solicitud. `ModerationAuditLog` registra toda acción administrativa. `TrustScoreSnapshot` conserva el historial de cálculos. Las tres son append-only.

### Logging

Logger estructurado en `src/lib/logger.ts`, instanciado con `createLogger`.

### Formato de respuesta

Todas las respuestas de `/api/` siguen la misma forma:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": "Mensaje comprensible para la persona usuaria" }
```

Los mensajes de error se redactan para quien usa la aplicación, no para quien la depura.

---

## 9. Trust Score v2

Sistema de confianza basado en evidencia verificable. Implementación en `src/domain/rating/calculateTrustScoreV2.ts`. Versión del algoritmo: `trust-v2.0.0`.

### Componentes

| Componente | Rango |
|---|---|
| Perfil completo | 0–5 |
| Confirmación de contacto | 0–5 |
| Comportamiento de respuesta | 0–10 |
| Historial de cierres | 0–30 |
| Calidad de reseñas | 0–25 |
| Diversidad de solicitantes | 0–10 |
| Madurez del proveedor | 0–10 |
| Fiabilidad operativa | 0–5 |

### Umbral mínimo de evidencia

Con menos de tres cierres bilaterales, `publicScore` es `null` y `evidenceLevel` es `INSUFFICIENT_EVIDENCE`. El score interno se calcula y almacena para auditoría, pero no se expone.

La interfaz muestra "Evidencia insuficiente" en lugar de un `0`. Un cero comunicaría desconfianza; la ausencia de evidencia no es evidencia negativa, y presentarla como tal castiga injustamente a quien recién empieza.

### Topes independientes

```
final_score = min(
  max(0, raw_trust_score - confirmed_risk_penalty),
  completion_cap, diversity_cap, provider_age_cap,
  review_evidence_cap, confirmation_rate_cap,
  recency_cap, moderation_cap
)
```

Cada tope limita el score por una dimensión distinta de evidencia. Un proveedor con perfil impecable pero un solo cliente no puede alcanzar puntuación alta: el tope de diversidad lo impide. Esto hace costoso inflar el score artificialmente.

### Suavizado de la tasa de respuesta

```
smoothed_response_rate = (responded_eligible_requests + 4) / (eligible_inbound_requests + 5)
```

Evita que una sola solicitud respondida produzca un 100 % de tasa de respuesta.

### Ponderación decreciente por solicitante

| Cierre con el mismo solicitante | Peso |
|---|---|
| 1.° | 1.0 |
| 2.° | 0.5 |
| 3.° y siguientes | 0.2 |
| Tope acumulado | 2.0 |

Repetir trabajos con el mismo cliente aporta cada vez menos. Sin esto, dos cuentas coordinadas podrían generar reputación ilimitada entre sí.

### Filtros de diversidad

Se excluyen del cálculo de diversidad los solicitantes sin correo verificado, con menos de 14 días de antigüedad al momento del cierre, la persona dueña del propio perfil, las cuentas marcadas como sintéticas (`User.isSynthetic`) y aquellas con colusión confirmada (`User.collusionConfirmed`).

### Moderación

| Situación | Efecto |
|---|---|
| Reporte de alto riesgo abierto, en revisión o escalado | `growthHold` activo |
| Manipulación confirmada moderada | Tope de 60 |
| Manipulación confirmada grave | Tope de 40 |
| Proveedor baneado | Tope de 0 |
| Proveedor suspendido | `publicScoreFrozen`, score público congelado |

Los reportes algorítmicos sin revisión humana no generan penalización pública. Una señal automática no confirmada no debería dañar la reputación de nadie.

### Reconstrucción determinista

```bash
npm run rebuild:trust-scores                          # recalcula todos los proveedores
npm run rebuild:trust-scores -- --dry-run             # inspecciona alcance sin escribir
npm run rebuild:trust-scores -- --version=trust-v2.0.0 # valida la versión esperada
```

Itera proveedores, filtra eventos por `algorithmVersion`, excluye evidencia invalidada, recalcula desde los eventos de reputación y genera snapshots append-only.

> **Nota operativa.** La migración `20260906090000_sprint8_trust_score_storage` hace un backfill copiando `trustScore` (interno, algoritmo anterior) a `publicTrustScore` para proveedores con tres o más cierres bilaterales. Es un valor de transición. Ejecutar `npm run rebuild:trust-scores` después de aplicar las migraciones para que los scores públicos correspondan a la fórmula v2.

---

## 10. Integración de IA

Gemini se usa para tres funciones, todas con degradación local. Cliente: `@google/genai`. Modelo: `gemini-3.1-flash-lite`.

| Archivo | Función |
|---|---|
| `src/lib/ai/extract-intent.ts` | Convierte lenguaje natural en filtros estructurados de búsqueda. |
| `src/lib/ai/rank-providers.ts` | Ordena resultados por relevancia. |
| `src/lib/ai/enhance-bio.ts` | Sugiere mejoras a la biografía del proveedor. |
| `src/lib/ai/quote-draft.ts` | Redacta un borrador de solicitud de cotización. |
| `src/lib/ai/category-mapping.ts` | Normaliza categorías y ciudades a los enums del dominio. |
| `src/lib/ai/classify-error.ts` | Clasifica errores de la API para decidir la estrategia de degradación. |

### Degradación

Sin `GEMINI_API_KEY`, `getAi()` devuelve `null` y las funciones caen a heurística local por palabras clave. El sistema queda plenamente funcional; la búsqueda natural pierde precisión pero no deja de operar.

`classifyGeminiError` distingue el tipo de fallo para actuar en consecuencia:

| Situación | Comportamiento |
|---|---|
| `429` límite de cuota | Advertencia con `retryAfterMs`, se usa el fallback |
| `503` / `5xx` | Degradación silenciosa |
| Error inesperado | Se registra el error y se usa el fallback |

Ningún fallo de IA propaga un error a la persona usuaria.

### Caché de intención

`Map` en memoria, TTL de 60 s, máximo 100 entradas. Las claves se normalizan en minúsculas y sin acentos, de modo que "Managua" y "managua" comparten entrada.

### Inferencias visibles y corregibles

Las inferencias de la búsqueda natural se muestran como filtros editables. Quien busca puede ver qué entendió el sistema y corregirlo — la interfaz no oculta la interpretación detrás de resultados sin explicación.

---

## 11. Scripts

### Desarrollo y build

| Script | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR en el puerto 3000. |
| `npm run build` | `vite build` + bundle del servidor con esbuild a `dist/server.cjs`. |
| `npm run start` | Arranca el build con `NODE_ENV=production`. |
| `npm run preview` | Alias de `start`. |
| `npm run lint` | `tsc --noEmit`. Verificación de tipos sin emitir. |
| `npm run clean` | Elimina `dist` y `server.js`. |
| `npm run db:seed` | Datos de demostración. |

### Tests

| Script | Valida |
|---|---|
| `npm test` | Runner completo. Ejecuta las cinco suites del cuadro siguiente. |
| `npm run test:unit` | `test:trust-v2` + `test:risk-telemetry`. |
| `npm run test:e2e` | `test:sprint-e2e` + `test:risk-integration`. |
| `npm run test:trust-v2` | 13 casos del cálculo de Trust Score v2. Sin base de datos. |
| `npm run test:risk-telemetry` | Scoring de riesgo. |
| `npm run test:admin-permissions` | Matriz de permisos administrativos. |
| `npm run test:sprint-e2e` | Flujo extremo a extremo de Trust Score v2. |
| `npm run test:risk-integration` | Integración de moderación y riesgo. |
| `npm run test:sprint8-trust` | Contrato de Sprint 8: persistencia, snapshots y no filtración de `internalScore`. |
| `npm run test:sprint6` | Máquina de estados de solicitudes. |
| `npm run test:sprint6-e2e` | Flujos completos de cierre. |
| `npm run test:sprint7-reviews` | Elegibilidad de reseñas. |
| `npm run test:sprint7-feedback` | Retroalimentación privada. |
| `npm run test:sprint7-e2e` | Flujo completo de reseñas. |
| `npm run test:request-events` | Bitácora de eventos de solicitud. |
| `npm run test:reputation-events` | Eventos y ponderación de reputación. |
| `npm run test:concurrency` | Bloqueo optimista por `version`. |

`npm test` corre estas cinco suites en modo fail-safe, continuando ante fallos para reportar el panorama completo:

| Suite | Categoría |
|---|---|
| Trust Score v2 | unit |
| Risk Telemetry | unit |
| Admin Permissions | smoke |
| Sprint 2 E2E | e2e |
| Risk Integration | e2e |

Solo `test:trust-v2` y `test:risk-telemetry` corren sin PostgreSQL. Las suites e2e y de contrato requieren base de datos poblada y, algunas, el servidor levantado.

### Mantenimiento

| Script | Acción |
|---|---|
| `npm run rebuild:trust-scores` | Reconstrucción determinista de scores. Admite `--dry-run` y `--version=`. |
| `scripts/backfill_reputation_events.ts` | Backfill de eventos de reputación. |
| `scripts/backfill_request_events.ts` | Backfill de eventos de solicitud. |
| `scripts/migrate_quote_status_to_3axis.ts` | Migración del `status` legacy al modelo de tres ejes. |
| `scripts/cleanup_legacy_quote_status.ts` | Limpieza posterior a la migración. |

---

## 12. API: ejemplos de endpoints

Base: `http://localhost:3000`. Autenticación por cookies `httpOnly`; con `curl` usar `-c`/`-b` para persistirlas.

### Registro

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "maria@ejemplo.ni",
    "password": "ContraseñaSegura123",
    "name": "María Gutiérrez"
  }'
```

```json
{
  "success": true,
  "data": {
    "user": { "id": "clx1a2b3c4d5", "email": "maria@ejemplo.ni", "name": "María Gutiérrez", "role": "USER" }
  }
}
```

Los tokens llegan como cookies `httpOnly`; no aparecen en el cuerpo.

### Inicio de sesión

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "maria@ejemplo.ni", "password": "ContraseñaSegura123" }'
```

### Sesión activa

```bash
curl http://localhost:3000/api/auth/me -b cookies.txt
```

```json
{
  "success": true,
  "data": {
    "user": { "id": "clx1a2b3c4d5", "email": "maria@ejemplo.ni", "role": "USER" },
    "permissions": ["REQUESTER"]
  }
}
```

### Búsqueda con filtros

```bash
curl "http://localhost:3000/api/providers/search?city=MANAGUA&category=carpinteria&availability=DISPONIBLE"
```

```json
{
  "success": true,
  "data": [
    {
      "id": "clp9x8y7z6",
      "displayName": "Carpintería Los Robles",
      "slug": "carpinteria-los-robles",
      "city": "MANAGUA",
      "category": "Carpintería",
      "verified": true,
      "verificationLevel": "COMPLETE",
      "formalizationStatus": "EN_PROCESO",
      "trustScore": 84,
      "evidenceLevel": "OK",
      "bilateralCompletions": 7,
      "responseTimeHrs": 3,
      "completedRequests": 12,
      "photos": ["https://..."]
    }
  ]
}
```

Cuando `evidenceLevel` es `INSUFFICIENT_EVIDENCE`, `trustScore` viene en `null`. El cliente debe mostrar "Evidencia insuficiente", nunca `0`.

### Búsqueda en lenguaje natural

```bash
curl -X POST http://localhost:3000/api/providers/ai-search \
  -H "Content-Type: application/json" \
  -d '{ "query": "necesito alguien que me haga un mueble de madera en Managua para la próxima semana" }'
```

```json
{
  "success": true,
  "data": {
    "intent": {
      "category": "Carpintería",
      "city": "MANAGUA",
      "urgency": "SEMANA",
      "keywords": ["mueble", "madera"]
    },
    "providers": [ ]
  }
}
```

`intent` se devuelve para que la interfaz muestre lo inferido como filtros corregibles. Sin `GEMINI_API_KEY` el campo se llena por heurística local.

### Confianza pública de un proveedor

```bash
curl http://localhost:3000/api/providers/carpinteria-los-robles/trust-score
```

Con evidencia suficiente:

```json
{
  "success": true,
  "data": {
    "trustScore": 84,
    "publicScore": 84,
    "evidenceLevel": "OK",
    "bilateralCompletions": 5,
    "algorithmVersion": "trust-v2.0.0",
    "publicScoreFrozen": false,
    "growthHold": false
  }
}
```

Sin evidencia suficiente:

```json
{
  "success": true,
  "data": {
    "trustScore": null,
    "publicScore": null,
    "evidenceLevel": "INSUFFICIENT_EVIDENCE",
    "bilateralCompletions": 2,
    "algorithmVersion": "trust-v2.0.0",
    "publicScoreFrozen": false,
    "growthHold": false
  }
}
```

El endpoint nunca expone `internalScore`. Está cubierto por aserción explícita en `scripts/test_sprint8_trust_contract.ts`.

Acepta `id` o `slug` en el mismo parámetro de ruta.

### Crear una solicitud de cotización

```bash
curl -X POST http://localhost:3000/api/quotes \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7f3a9c21-4e8b-4d1a-9c73-2b5e8f1a6d94" \
  -b cookies.txt \
  -d '{
    "providerId": "clp9x8y7z6",
    "subject": "Mueble de madera para sala",
    "message": "Necesito un mueble de 1.80 m de ancho para la sala, en madera de pino.",
    "neededBy": "2026-09-20"
  }'
```

```json
{
  "success": true,
  "data": {
    "id": "clq5m4n3b2",
    "workflow_phase": "OPEN",
    "closure_outcome": null,
    "moderation_state": "CLEAN",
    "version": 1,
    "createdAt": "2026-09-06T14:22:31.000Z"
  }
}
```

La cabecera `Idempotency-Key` es opcional pero recomendada. Repetir la petición con la misma clave devuelve la respuesta original sin crear una segunda solicitud.

### Enviar un mensaje

```bash
curl -X POST http://localhost:3000/api/quotes/clq5m4n3b2/messages \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{ "text": "¿Podría darme un precio estimado?" }'
```

### Confirmar cierre

```bash
curl -X PATCH http://localhost:3000/api/quotes/clq5m4n3b2/complete \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 2c8d1f4a-6b3e-4a92-8d17-5f2e9c4b7a31" \
  -b cookies.txt \
  -d '{ "version": 1 }'
```

Primera confirmación:

```json
{
  "success": true,
  "data": {
    "id": "clq5m4n3b2",
    "workflow_phase": "COMPLETION_PENDING",
    "closure_outcome": null,
    "completionDeadline": "2026-09-09T14:22:31.000Z",
    "version": 2
  }
}
```

Confirmación de la contraparte dentro de las 72 h:

```json
{
  "success": true,
  "data": {
    "id": "clq5m4n3b2",
    "workflow_phase": "CLOSED",
    "closure_outcome": "BILATERAL",
    "completedAt": "2026-09-06T18:45:02.000Z",
    "version": 3
  }
}
```

`version` implementa bloqueo optimista. Enviar una versión desactualizada produce conflicto en lugar de sobrescribir. Si nadie confirma en 72 h, el cron asigna el `ClosureOutcome` unilateral correspondiente.

### Elegibilidad para reseñar

```bash
curl http://localhost:3000/api/quotes/clq5m4n3b2/review-eligibility -b cookies.txt
```

```json
{
  "success": true,
  "data": {
    "eligible": true,
    "weight": 1.0,
    "reason": null,
    "editableUntil": "2026-09-13T18:45:02.000Z"
  }
}
```

Peso `1.0` para cierres bilaterales, `0.5` para reseñas unilaterales cualificadas. `eligible: false` viene acompañado de `reason` explicando por qué.

### Publicar una reseña

```bash
curl -X POST http://localhost:3000/api/reviews \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d" \
  -b cookies.txt \
  -d '{
    "requestId": "clq5m4n3b2",
    "rating": 5,
    "comment": "Trabajo puntual y bien acabado. El mueble quedó como lo acordamos."
  }'
```

Requiere una solicitud cerrada y elegibilidad vigente. Publicar dispara el recálculo del Trust Score del proveedor y genera un `TrustScoreSnapshot`.

### Suspender un proveedor

```bash
curl -X POST http://localhost:3000/api/admin/providers/clp9x8y7z6/suspend \
  -H "Content-Type: application/json" \
  -b cookies-admin.txt \
  -d '{
    "reason": "Reporte de riesgo confirmado tras revisión humana",
    "suspendedUntil": "2026-10-06"
  }'
```

Exige `SUPER_ADMIN`. Registra en `ModerationAuditLog` y activa `publicScoreFrozen`: el score público deja de actualizarse mientras la suspensión está vigente.

### Bitácora de una solicitud

```bash
curl http://localhost:3000/api/admin/threads/clq5m4n3b2/events -b cookies-admin.txt
```

```json
{
  "success": true,
  "data": [
    { "type": "REQUEST_CREATED",       "actorId": "clx1a2b3c4d5", "createdAt": "2026-09-06T14:22:31.000Z" },
    { "type": "PROVIDER_RESPONDED",    "actorId": "clu7v6w5x4",   "createdAt": "2026-09-06T15:10:44.000Z" },
    { "type": "QUOTE_ACCEPTED",        "actorId": "clx1a2b3c4d5", "createdAt": "2026-09-06T16:02:18.000Z" },
    { "type": "COMPLETION_REQUESTED",  "actorId": "clx1a2b3c4d5", "createdAt": "2026-09-06T18:30:00.000Z" },
    { "type": "COMPLETION_CONFIRMED",  "actorId": "clu7v6w5x4",   "createdAt": "2026-09-06T18:45:02.000Z" }
  ]
}
```

Accesible a `ADMIN_REVIEWER` y `SUPER_ADMIN`.

### Estado del servicio

```bash
curl http://localhost:3000/api/health
```

---

## 13. Referencia completa de endpoints

Todas las rutas devuelven `{ success, data }` o `{ success, error }`.

### Autenticación

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Registro con correo y contraseña. |
| `POST` | `/api/auth/login` | — | Inicio de sesión. Emite cookies. |
| `POST` | `/api/auth/logout` | — | Cierre de sesión. Limpia cookies. |
| `POST` | `/api/auth/refresh` | — | Renueva el access token con el refresh token. |
| `GET` | `/api/auth/me` | Sí | Sesión y permisos vigentes. |
| `GET` | `/api/auth/google` | — | Inicia OAuth con Google. |
| `GET` | `/api/auth/google/callback` | — | Callback de OAuth. |

### Sistema

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | — | Estado del servicio. |

### Proveedores

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/providers/search` | — | Búsqueda con filtros estructurados. |
| `POST` | `/api/providers/ai-search` | — | Búsqueda en lenguaje natural. |
| `GET` | `/api/providers/:id` | — | Perfil público. Acepta `id` o `slug`. |
| `GET` | `/api/providers/:id/trust-score` | — | Confianza pública. Nunca expone el score interno. |
| `POST` | `/api/providers` | Sí | Crea perfil de proveedor. |
| `PUT` | `/api/providers/:id` | Sí | Actualiza perfil propio. |
| `POST` | `/api/providers/:id/publish` | Sí | Publica el perfil. Fija `activatedAt`. |
| `POST` | `/api/providers/enhance-bio` | — | Sugerencia de biografía por IA. |

### Catálogo

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/catalog-items/:id` | — | Detalle de oferta. |
| `POST` | `/api/catalog-items` | Sí | Crea oferta. |
| `PUT` | `/api/catalog-items/:id` | Sí | Actualiza oferta. |
| `DELETE` | `/api/catalog-items/:id` | Sí | Elimina oferta. |

### Solicitudes y cotizaciones

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/quotes` | Sí | Solicitudes de la persona autenticada. |
| `GET` | `/api/quotes/:id` | Sí | Detalle de solicitud. |
| `POST` | `/api/quotes/draft` | Sí | Borrador asistido por IA. |
| `POST` | `/api/quotes` | Sí | Crea solicitud. Idempotente. |
| `PUT` | `/api/quotes/:id` | Sí | Actualiza cotización. |
| `POST` | `/api/quotes/:id/messages` | Sí | Envía mensaje al hilo. |
| `POST` | `/api/quotes/:id/accept-quotation` | Sí | El cliente acepta el precio ofertado. |
| `PATCH` | `/api/quotes/:id/complete` | Sí | Confirma cierre. Idempotente. |
| `POST` | `/api/quotes/:id/reject-completion` | Sí | Rechaza el cierre propuesto. |
| `POST` | `/api/quotes/:id/withdraw-completion` | Sí | Retira la propia solicitud de cierre. |
| `POST` | `/api/quotes/:id/decline` | Sí | El proveedor rechaza la solicitud. |

### Reseñas y retroalimentación

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/providers/:id/reviews` | — | Reseñas verificadas de un proveedor. |
| `GET` | `/api/quotes/:id/review-eligibility` | Sí | Elegibilidad, peso y ventana de edición. |
| `POST` | `/api/reviews` | Sí | Publica reseña. Idempotente. |
| `PATCH` | `/api/reviews/:id` | Sí | Edita reseña dentro de la ventana permitida. |
| `POST` | `/api/quotes/:id/private-feedback` | Sí | Retroalimentación privada al proveedor. |
| `GET` | `/api/quotes/:id/private-feedback` | Sí | Consulta la retroalimentación privada. |

### Formalización

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/providers/:id/formalization` | — | Checklist de formalización. |
| `PUT` | `/api/providers/:id/formalization` | Sí | Actualiza progreso. No concede estado MIPYME. |

### Moderación — revisor o superadministrador

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/risk-reports` | Lista reportes de riesgo. |
| `GET` | `/api/admin/risk-reports/:id` | Detalle de reporte. |
| `PATCH` | `/api/admin/risk-reports/:id/status` | Cambia el estado del reporte. |
| `POST` | `/api/admin/risk-reports/:id/escalate` | Escala el reporte. |
| `POST` | `/api/admin/providers/:providerId/inactivate` | Inactiva un proveedor. |
| `GET` | `/api/admin/threads/:id/events` | Bitácora de eventos de una solicitud. |
| `POST` | `/api/admin/threads/:id/commercial-interaction` | Marca interacción comercial verificada. |

### Moderación — solo superadministrador

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/admin/providers/:providerId/suspend` | Suspende. Congela el score público. |
| `POST` | `/api/admin/providers/:providerId/ban` | Banea. Aplica tope de score 0. |
| `POST` | `/api/admin/providers/:providerId/restrict` | Restringe temporalmente. |
| `POST` | `/api/admin/providers/:providerId/reactivate` | Reactiva un perfil. |
| `GET` | `/api/admin/audit-log` | Bitácora global de moderación. |
| `POST` | `/api/admin/resolve-expired-quotes` | Dispara manualmente la resolución de cierres vencidos. |

---

## Documentos relacionados

| Documento | Contenido |
|---|---|
| `ARCHITECTURE.md` | Arquitectura original y decisiones históricas. |
| `AUTH.md` | Detalle del sistema de autenticación. |
| `DESIGN.md` | Sistema de diseño: paleta, tipografía, componentes. |
| `PRODUCT.md` | Propósito, personas usuarias y principios de diseño. |
| `AGENTS.md` | Reglas de negocio y convenciones técnicas. |
| `GIT_WORKFLOW.md` | Flujo de ramas y convenciones de commit. |
| `constraints.md` | Restricciones del proyecto. |

## Accesibilidad

Objetivo WCAG 2.1 AA: contraste suficiente, foco visible, navegación por teclado, controles etiquetados, estados que no dependen solo del color, movimiento reducido y estructura adaptable a móvil y escritorio.

Los estados combinan siempre color, icono y texto. Nunca color por sí solo.

La validación completa de conformidad requiere pruebas manuales con tecnologías asistivas y revisión por especialistas en accesibilidad; lo documentado aquí son los criterios de implementación adoptados, no una certificación.
