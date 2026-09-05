# TradeArc — Arquitectura Técnica Completa

> Documento de arquitectura original proporcionado por el usuario. Optimizado para: equipo pequeño, presupuesto cero, hackathon de 48h, y contexto nicaragüense.

## 1. Stack Overview

| Capa | Tecnología |
|---|---|
| **Frontend Framework** | React (Vite - Adaptado de Next.js por entorno) |
| **Lenguaje FE/BE** | TypeScript |
| **Styling** | Tailwind CSS + shadcn/ui (conceptos) |
| **State (cliente)** | Zustand |
| **Mapas** | Leaflet + react-leaflet + OpenStreetMap |
| **Backend Framework** | Node.js + Express (Adaptado de Next.js API Routes) |
| **DB / ORM** | PostgreSQL + Prisma + PostGIS |
| **Auth** | (Planeado) |
| **LLM primario** | Groq API (Llama 3.1 70B) / Gemini |

## 2. Frontend
- Zustand para estado global (`useSearchStore`).
- Leaflet para mapas sin API Key.
- Tailwind para utilidades.

## 3. Database (Prisma)
- Proveedores, Usuarios, Cotizaciones, Reviews.
- Soporte para extensiones espaciales (PostGIS).

## 4. AI/LLM Integration
- Extracción de intenciones (Intent Extraction) usando Groq/Gemini con falback a keywords.

## 5. Fases de Desarrollo (Checklist)
1. Setup inicial de entorno, dependencias y arquitectura.
2. Core UI y mapa interactivo (Vista dividida).
3. Backend (Vite + Express) y base de datos (Prisma).
4. Cotizaciones y formalización.
5. Capa AI (Groq/Gemini).

## 6. Arquitectura del MVP conectado

- `src/lib/mvp-data.ts`: contrato de dominio y semillas realistas para 50 proveedores, solicitudes, reseñas y reportes.
- `src/stores/mvp-store.ts`: estado persistente de demostración con reglas de solicitud, confirmación bilateral, reseñas y revisión humana.
- `src/components/mvp/Ui.tsx`: vocabulario visual compartido para confianza, verificación, formalización, estados y limitaciones.
- `src/components/map/MvpProviderMap.tsx`: mapa Leaflet sincronizado con resultados, selección por toque, enfoque programático y vista previa persistente del proveedor.
- `src/pages/*`: verticales de búsqueda, perfil público, cotización, seguimiento, cuenta, formalización, confianza, seguridad y administración.
- `server.ts`: APIs existentes y servidor Vite/Express. Desarrollo usa HMR aunque exista un build previo; producción se activa explícitamente con `NODE_ENV=production`.

## 7. Decisiones y límites

- El flujo crítico usa un store persistente en navegador para que la demo funcione sin PostgreSQL ni servicios externos.
- La extracción de intención tiene fallback local determinista y el ranking aplica 35% confianza, 25% cercanía, 20% precio y 20% disponibilidad.
- Las reseñas requieren solicitud `COMPLETED`, y este estado requiere confirmación de cliente y proveedor.
- Reportes usan `PENDING`, `REVIEWED`, `DISMISSED` y `ESCALATED`; solo una sesión administrativa puede cambiar su estado.
- La siguiente expansión recomendada es mover el mismo contrato a Prisma/PostgreSQL, añadir autenticación real y pruebas de integración de API.

## 8. Checkpoint de endurecimiento (julio de 2026)

- Los selectores de Zustand retornan referencias estables en perfil y catálogo, eliminando el loop de `/me`.
- La participación en solicitudes se deriva del usuario y proveedor actuales. Chat, cotización, cierre, confirmación y reseña vuelven a validar ese rol en el store.
- Las solicitudes validan texto significativo, fecha futura, propiedad, límite de cuenta y duplicados durante diez minutos antes de persistir.
- El progreso de formalización persiste y puede marcar un perfil en proceso, pero nunca concede estado MIPYME formal automáticamente.
- El mapa agrupa resultados por ciudad a escala nacional y revela puntos individuales al acercarse, con estados visibles para carga y fallo de tiles.

## 9. Identidad, perfiles y sesión serializable

- `UserAccount` representa identidad y estado de acceso. No contiene un tipo exclusivo de usuario.
- `ClientProfile` y `ProviderProfile` son perfiles opcionales vinculados por `userId`/`ownerUserId`. Una cuenta puede tener ambos.
- `RoleAssignment` guarda permisos transversales (`REQUESTER`, `PROVIDER`, `ADMIN_REVIEWER`, `SUPER_ADMIN`). Ser proveedor no es un permiso administrativo público.
- `AuthSessionDTO` contiene únicamente la sesión emitida por login: `sessionId`, `userId`, permisos y vencimiento. Vive en `auth-store` sin persistencia.
- `createMarketplaceSnapshot()` exporta identidad y datos comerciales con versión de esquema, pero excluye deliberadamente sesión y usuario actual derivado.
- Mientras se conecta el login real, `/api/auth/session` sin sesión activa activa una cuenta bootstrap administradora que también posee `provider-1`. No existe selector local para elevar permisos.
