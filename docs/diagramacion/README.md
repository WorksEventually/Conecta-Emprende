# Diagramación de base de datos y UML

Los cuatro entregables de modelado del proyecto, derivados del código real del MVP: `prisma/schema.prisma`, `server.ts`, `src/lib` y `src/domain`.

## Entregables

| # | Entregable | Archivo | Vistas |
|---|---|---|---|
| 1 | ER normalizado en 3FN | [`er-relacional.html`](./er-relacional.html) | 7 |
| 2 | UML de casos de uso | [`uml-casos-de-uso.html`](./uml-casos-de-uso.html) | 5 |
| 3 | UML de clases | [`uml-clases.html`](./uml-clases.html) | 5 |
| 4 | UML de actividades | [`uml-actividades.html`](./uml-actividades.html) | 5 |

Entrada principal: [`index.html`](./index.html)

### Publicado

- Portal: https://workseventually.github.io/Conecta-Emprende/diagramacion/
- ER: https://workseventually.github.io/Conecta-Emprende/diagramacion/er-relacional.html
- Casos de uso: https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-casos-de-uso.html
- Clases: https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-clases.html
- Actividades: https://workseventually.github.io/Conecta-Emprende/diagramacion/uml-actividades.html

## Contenido por entregable

**ER relacional.** Vista global de las 40 tablas más seis vistas modulares con todos los atributos: identidad y acceso, ubicación y categorías, proveedor, catálogo, solicitudes y ledger de eventos, confianza y moderación. Incluye claves `PK`/`FK`/`UK`, cardinalidades, acciones referenciales y las columnas `LEGACY` y `DERIVADO` señaladas explícitamente.

**Casos de uso.** 63 casos agrupados en 7 paquetes, con 6 actores humanos y 3 sistemas externos. Incluye la jerarquía de generalización de actores, que refleja la herencia de permisos real del backend, y las relaciones «include» y «extend».

**Clases.** Modelo de dominio de identidad y oferta, núcleo transaccional de solicitudes y reputación, las 10 enumeraciones, la capa de servicios con sus estereotipos y la arquitectura en capas.

**Actividades.** Ciclo de vida de la solicitud con calles por actor, máquina de estados de los 3 ejes, vencimiento automático de 72 horas, flujo de reseña con recálculo de confianza y alta con publicación de perfil.

## Publicación automática

El workflow [`deploy-diagramacion-pages.yml`](../../.github/workflows/deploy-diagramacion-pages.yml) empaqueta `docs/` y publica el sitio en cada cambio de la rama `test`.

Configuración manual necesaria una sola vez en GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Notas técnicas

Cada visor es un archivo HTML autónomo, sin dependencias locales, para que funcione igual abierto desde el disco o desde GitHub Pages. Los diagramas se declaran en bloques `<script type="text/plain">` y se renderizan con Mermaid 11 cargado desde CDN, así que la primera carga necesita conexión a internet. Si el render falla, el visor muestra el error en pantalla en lugar de quedarse en blanco.

Los 22 diagramas fueron validados con el parser de Mermaid antes de publicarse.

## Fuente de verdad

- `prisma/schema.prisma` y `prisma/migrations/`
- `server.ts`, `src/lib/quotes-service.ts`, `src/domain/requests/reviewRules.ts`, `src/lib/cron/resolve-expired-quotes.ts`
- [Análisis de normalización 1FN a BCNF](../../deliverables/entregable-diagramacion-bd-y-uml/01-er-normalizado-3fn.md)

El esquema contiene **40 tablas y 10 enumeraciones**, incluidas `RiskSignalEvidence` y `ModerationActionApproval` del circuito de riesgo del Sprint 9. Estos diagramas documentan el sistema existente; no crean ni modifican la base de datos.
