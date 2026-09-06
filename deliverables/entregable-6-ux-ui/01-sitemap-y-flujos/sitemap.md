# Sitemap — Conecta Emprende AI

Mapa completo de pantallas del MVP (según `src/App.tsx` en la rama `test`). Cada pantalla está documentada en detalle en `../03-especificacion/pantallas.md`.

## 1. Tipos de acceso

- **🔓 Pública** — no requiere sesión.
- **🔒 Protegida** — requiere sesión (`ProtectedRoute`). Si no hay sesión, redirige a `/auth/login`.
- **👮 Admin** — solo roles `ADMIN`, `ADMIN_REVIEWER`, `SUPER_ADMIN`. (Fuera del alcance de esta entrega parcial, pero se documenta su existencia por completitud.)

## 2. Mapa de pantallas

| # | Pantalla | Ruta | Acceso | Rol principal | Estado en entrega |
|---|---|---|---|---|---|
| 1 | Inicio (hero + búsqueda) | `/` | 🔓 Pública | Visitante / todos | ✅ Documentada |
| 2 | Buscar proveedores | `/search` | 🔓 Pública | Visitante / Solicitante | ✅ Documentada |
| 3 | Perfil público del proveedor | `/providers/:providerId` | 🔓 Pública | Todos | ✅ Documentada |
| 4 | Detalle de oferta (producto/servicio) | `/providers/:providerId/products/:productId` | 🔓 Pública | Todos | ✅ Documentada |
| 5 | Iniciar sesión | `/auth/login` | 🔓 Pública | — | ✅ Documentada |
| 6 | Crear cuenta | `/auth/register` | 🔓 Pública | — | ✅ Documentada |
| 7 | Nueva solicitud de cotización | `/requests/new` | 🔒 Protegida | Solicitante | ✅ Documentada |
| 8 | Mis solicitudes (bandejas) | `/requests` · `/requests/sent` · `/requests/received` | 🔒 Protegida | Solicitante y Proveedor | ✅ Documentada |
| 9 | Detalle de solicitud | `/requests/:requestId` | 🔒 Protegida | Partes de la solicitud | ✅ Documentada |
| 10 | Chat + acuerdo (cotización/confirmación/reseña) | `/requests/:requestId/chat` | 🔒 Protegida | Partes de la solicitud | ✅ Documentada |
| 11 | Mi perfil (panel) — variante proveedor | `/me` | 🔒 Protegida | Proveedor | ✅ Documentada |
| 12 | Mi perfil (panel) — variante solicitante sin negocio | `/me` | 🔒 Protegida | Solicitante | ✅ Documentada |
| 13 | Editar perfil público (con publicación de borrador) | `/me/profile/edit` | 🔒 Protegida | Proveedor / doble rol | ✅ Documentada |
| 14 | Administrar catálogo (productos y servicios) | `/me/products` · `/me/products/new` · `/me/products/:id/edit` | 🔒 Protegida | Proveedor | ✅ Documentada |
| 15 | Cómo funciona la confianza | `/trust` | 🔓 Pública | Todos | ✅ Documentada |
| 16 | Seguridad de la cuenta | `/settings/security` | 🔒 Protegida | Todos | ✅ Documentada |
| 17 | Reportes / moderación (admin) | `/admin/reports` | 👮 Admin | Admin | ⏸️ Fuera de alcance (entrega 6 parcial) |
| 18 | Formalización legal (roadmap) | `/formalization` | 🔒 Protegida | Todos | 🚧 Roadmap, no es parte del MVP activo |

**Rutas equivalentes/alias:** `/buscar` → `/search` · `/proveedor/:id` → `/providers/:providerId` · `/profile/me`, `/provider/me`, `/provider/create` → `/me` · `/dashboard/perfil`, `/dashboard/cotizaciones`, `/dashboard/formalizacion` → redirects.

## 3. Navegación global (layout raíz)

- **Topbar (escritorio):** marca `Conecta Emprende` + nav: *Inicio, Buscar, Conversaciones, Mi perfil* + menú de cuenta (avatar iniciales → Configuración y seguridad · Reportes si Admin · Cómo funciona la confianza · Cerrar sesión). En móvil, ícono de menú (hamburguesa) con el mismo nav plegable.
- **Badge "no leídas"** en *Conversaciones* (cuenta de hilos abiertos).
- **Toast** global (4 s) para confirmar acciones.
- **Auth del demo:** la app inicia con la cuenta administradora que posee `provider-1` (bootstrap). Se desactiva con `VITE_BOOTSTRAP_ADMIN=false`.

## 4. Jerarquía visual de producto

```
Landing (/)
└─ Buscar (/search) ──► Perfil proveedor (/providers/:id) ──► Oferta (/providers/:id/products/:pid)
│                                                     └──► Nueva solicitud (/requests/new?providerId=…&productId=…)
│                                                                   └──► Chat (/requests/:id/chat) ──► Detalle (/requests/:id)
└─ Auth (/auth/login · /auth/register)
Mí perfil (/me) ──► Editar perfil público (/me/profile/edit)
            └──► Administrar catálogo (/me/products)
            └──► Mis solicitudes (/requests) ──► Chat / Detalle
Confianza (/trust) · Seguridad (/settings/security)
```

## 5. Flujo de demostración oficial (README del repo)

1. Buscar *"Necesito empaques ecológicos en León que sean baratos"*.
2. Abrir un perfil y revisar verificación, confianza, medallas, catálogo y señales.
3. Crear una solicitud de cotización.
4. Responder y confirmar el trabajo desde ambas partes.
5. Publicar una reseña desbloqueada por la finalización bilateral.
6. Editar el perfil público desde *Mi perfil*.
7. Enviar un reporte y revisarlo desde *Administración*.