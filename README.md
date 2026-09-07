# TradeArc · Conecta Emprende

**Directorio comercial verificable para emprendedores, MIPYMES y proveedores de Nicaragua.**
Búsqueda en lenguaje natural, señales de confianza respaldadas por evidencia y solicitudes de cotización con cierre bilateral auditable.

Hackathon Ciudades Creativas y Tecnológicas · Categoría Avanzado · Español (Nicaragua)

---

## Entregables para evaluación

> **Portal de diagramación:** https://workseventually.github.io/Conecta-Emprende/diagramacion/

Los cuatro diagramas exigidos, derivados del código real del MVP y no de un modelo teórico:

| # | Entregable | Vistas | Abrir |
|---|---|---|---|
| 1 | **ER normalizado (3FN)** | 7 | [Diagrama ER](https://workseventually.github.io/Conecta-Emprende/diagramacion/er-relacional.html) |
| 2 | **UML de casos de uso** | 5 | [Casos de uso](https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-casos-de-uso.html) |
| 3 | **UML de clases** | 5 | [Clases](https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-clases.html) |
| 4 | **UML de actividades** | 5 | [Actividades](https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-actividades.html) |

Cada visor tiene pestañas por módulo, zoom y exportación a SVG o PNG.

**Documentación de respaldo**

- [Análisis de normalización 1FN a BCNF](deliverables/entregable-diagramacion-bd-y-uml/01-er-normalizado-3fn.md) — dependencias funcionales, transitivas y derivadas tabla por tabla.
- [Entregable de UX/UI](deliverables/entregable-6-ux-ui/00-indice.md) — sitemap, flujos por rol, wireframes y especificación de pantallas.
- [Notas de diagramación y publicación](docs/diagramacion/README.md)

**Alcance del modelo:** 40 tablas y 10 enumeraciones en PostgreSQL.

---

## Qué resuelve el producto

En Nicaragua la oferta local vive dispersa entre contactos informales, grupos de WhatsApp y directorios sin mantenimiento. El problema no es solo encontrar un proveedor: es **saber si se le puede confiar un trabajo**.

TradeArc convierte una necesidad escrita en lenguaje cotidiano en conexiones útiles, y hace que la confianza sea demostrable:

- **Búsqueda natural.** `Necesito empaques ecológicos en León que sean baratos` se interpreta en filtros visibles y corregibles, no en una caja negra.
- **Confianza con evidencia.** El puntaje de un proveedor solo sube con transacciones reales confirmadas por ambas partes.
- **Reseñas verificables.** No existe reseña sin una solicitud real que la respalde; lo impone la base de datos, no una validación opcional.
- **Cierre bilateral.** Un trabajo se cierra cuando cliente y proveedor lo confirman, con una ventana de 72 horas y desenlaces explícitos cuando alguien no responde.

---

## Instalación

Requisitos: Node.js 20 o superior, PostgreSQL 15 o superior.

```bash
npm install
cp .env.example .env     # configurar DATABASE_URL y secretos
npx prisma migrate deploy
npm run db:seed
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

### Variables de entorno

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL |
| `JWT_SECRET` | Sí | Firma de los tokens de acceso |
| `APP_URL` | Sí | URL base, debe coincidir con el callback de OAuth |
| `GEMINI_API_KEY` | No | Búsqueda natural y redacción asistida |
| `GOOGLE_CLIENT_ID` | No | Inicio de sesión con Google |
| `GOOGLE_CLIENT_SECRET` | No | Inicio de sesión con Google |

Sin `GEMINI_API_KEY` la búsqueda por filtros sigue funcionando. Sin credenciales de Google, `GET /api/auth/google` responde 503 y la interfaz muestra el motivo al usuario en lugar de fallar en silencio.

---

## Recorrido de demostración

1. Buscar `Necesito empaques ecológicos en León que sean baratos` y revisar cómo quedan los filtros inferidos.
2. Abrir un perfil y revisar verificación, confianza pública, medallas y catálogo.
3. Crear una solicitud de cotización desde un ítem del catálogo.
4. Responder como proveedor, enviar una cotización y aceptarla como cliente.
5. Solicitar el cierre desde una parte y confirmarlo desde la otra.
6. Publicar la reseña que el cierre bilateral acaba de habilitar.
7. Enviar un reporte y revisarlo desde Administración.

Cuentas de prueba, todas con la contraseña `Conecta123!`:

| Propósito | Correo |
|---|---|
| Solicitante | `requester@conecta.test` |
| Proveedor activo | `textil@conecta.test` |
| Proveedor suspendido | `cafe@conecta.test` |
| Proveedor baneado | `equipos@conecta.test` |
| Revisor administrativo | `admin@conecta.test` |
| Super administrador | `superadmin@conecta.test` |

---

## Arquitectura

```
Cliente React 19 + Vite  ->  Express (server.ts, /api)  ->  Servicios  ->  Dominio  ->  Prisma  ->  PostgreSQL
                                                                                  \
                                                                                   ->  Gemini (búsqueda y redacción)
```

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Interfaz | React 19, Vite, Tailwind CSS 4, Zustand, TanStack Query | Pantallas y estado de cliente |
| Mapas | Leaflet, react-leaflet, tiles de OpenStreetMap | Ubicación de proveedores |
| API | Express 4, Zod, JWT con cookies HTTP-only | Endpoints bajo `/api/` |
| Dominio | TypeScript puro, sin dependencias de infraestructura | Reglas de reseña, confianza, riesgo y cierre |
| Datos | Prisma 5, PostgreSQL 15 | 40 tablas con restricciones de integridad |
| Automatización | node-cron cada 10 minutos | Resolución de solicitudes vencidas |

Decisiones que sostienen el diseño:

- **La integridad vive en la base de datos.** `UNIQUE (requestId, providerId, reviewerId)` en reseñas y `UNIQUE (requestId, evidenceType)` en evidencia hacen imposible duplicar confianza, incluso con reintentos concurrentes.
- **Ledger de eventos.** Cada transición de una solicitud emite un `RequestEvent` con clave de idempotencia `sha256`, y el estado se puede reconstruir desde el ledger.
- **Bloqueo optimista.** `QuoteThread.version` evita que dos cierres simultáneos se pisen.
- **El score interno nunca sale.** `ProviderMetrics.trustScore` es privado; la API solo expone `publicTrustScore`.

---

## Modelo de 3 ejes para solicitudes

Una solicitud no tiene un estado lineal, tiene tres dimensiones ortogonales:

| Eje | Valores | Qué responde |
|---|---|---|
| `workflow_phase` | `OPEN`, `COMPLETION_PENDING`, `CLOSED` | ¿En qué punto del ciclo está? |
| `closure_outcome` | 11 desenlaces | ¿Por qué terminó? |
| `moderation_state` | `CLEAN`, `FLAGGED`, `RESTRICTED` | ¿Está bajo revisión? |

Separarlos permite distinguir no solo **si** una solicitud terminó, sino **cómo** terminó. De eso depende quién puede dejar reseña y con qué peso:

- Cierre **bilateral** confirmado por ambas partes: reseña con peso **1.0**.
- Cierre **unilateral calificado**, con evidencia de interacción comercial: peso **0.5**.
- Cancelación sin interacción previa: **sin reseña**.

Cuando una parte solicita el cierre se abre una ventana de 72 horas medida con el reloj de la base de datos. Si la contraparte no responde, el cron determina el desenlace. La otra parte puede rechazar el cierre, pero con 24 horas de espera y al menos un mensaje nuevo, para que el rechazo no se use como bloqueo indefinido.

El flujo completo está en el [diagrama de actividades](https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-actividades.html).

---

## Sistema de riesgo

Sprint 9 implementa un circuito determinista y auditable de señales agregadas, reportes administrativos, revisión humana y Trust Score. Un reporte abierto puede detener el crecimiento de reputación, pero ninguna señal aplica sanciones o penalizaciones públicas sin confirmación administrativa.

- Matriz de señales: [`docs/sprint9-risk-signal-matrix.md`](docs/sprint9-risk-signal-matrix.md)
- Guía de pruebas: [`docs/TESTING.md`](docs/TESTING.md)
- Descripción de PR: [`docs/PR_SPRINT_9.md`](docs/PR_SPRINT_9.md)

---

## Verificación

```bash
npm run lint          # tsc --noEmit
npm run build         # build de cliente y servidor
npm test              # suite completa
```

Pruebas por área:

```bash
npm run test:unit                 # confianza v2 y telemetría de riesgo
npm run test:e2e                  # flujos de extremo a extremo
npm run test:sprint6              # máquina de estados de cierre
npm run test:sprint7-reviews      # elegibilidad de reseña
npm run test:concurrency          # cierres simultáneos y bloqueo optimista
npm run test:admin-permissions    # matriz de permisos por rol
```

Detalle en [`docs/TESTING.md`](docs/TESTING.md).

---

## Estructura del repositorio

```
Conecta-Emprende/
├── server.ts                    Backend Express completo
├── prisma/
│   ├── schema.prisma            40 tablas, 10 enums
│   ├── migrations/              Migraciones versionadas
│   └── seed.ts                  Datos de Nicaragua
├── src/
│   ├── domain/                  Reglas puras de negocio
│   ├── lib/                     Servicios y jobs
│   └── ...                      Interfaz React
├── docs/
│   ├── diagramacion/            Portal y visores publicados
│   └── ...                      Auditorías y contratos
├── deliverables/                Entregables del hackathon
└── scripts/                     Pruebas y utilidades
```

---

## Publicación de la documentación

El workflow [`deploy-diagramacion-pages.yml`](.github/workflows/deploy-diagramacion-pages.yml) publica `docs/` en GitHub Pages cada vez que cambia la rama `test`.

Configuración necesaria una sola vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

---

## Accesibilidad

Objetivo WCAG 2.1 AA: contraste suficiente, foco visible, navegación por teclado, controles etiquetados, estados que no dependen solo del color y estructura adaptable a móvil y escritorio. La validación completa requiere pruebas manuales con tecnologías asistivas y revisión experta.

---

## Estado del proyecto

MVP funcional y demostrable de extremo a extremo. Pendientes conocidos y documentados:

- La formalización MIPYME queda como roadmap: el MVP no promete trámites ni integración gubernamental.
- Quedan columnas legacy en `Provider`, `CatalogItem` y `QuoteThread` por compatibilidad con la interfaz; el plan de retiro está en el [análisis de normalización](deliverables/entregable-diagramacion-bd-y-uml/01-er-normalizado-3fn.md).
- Cinco columnas guardan identificadores sin clave foránea declarada, listadas en el mismo documento.
- El cierre administrativo de conversaciones existe en el modelo de datos pero aún no tiene endpoint.

Documentos de referencia: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`AUTH.md`](AUTH.md) · [`DESIGN.md`](DESIGN.md) · [`PRODUCT.md`](PRODUCT.md) · [`docs/TESTING.md`](docs/TESTING.md)
