# Guía de adaptación — Sprint 4 de frontend

Esta carpeta es la **fase base estable** del Entregable 6. El equipo anunció un Sprint 4 de frontend; esta guía separa lo que se mantiene de lo que habrá que regenerar, y dice exactamente qué revisar cuando aterricen los cambios.

## 1. Qué es ESTABLE (no debería cambiar con un sprint visual)

| Elemento | Por qué aguanta |
|---|---|
| Sitemap y rutas (qué pantallas existen, cómo navegan) | Rutas core (`/`, `/search`, `/providers/:id`, `/requests/*`, `/me*`, `/trust`…) definidas en `src/App.tsx` |
| Flujos por rol (solicitante, proveedor, doble rol) | Son reglas de producto, no de estilo |
| Reglas de negocio (`reglas-de-negocio.md`) | Modelo de 3 ejes, reseñas bilaterales, estados de proveedor, confianza |
| Listado de pantallas y sus estados (`pantallas.md`) | Estructura de información: contenido, orden, estados vacío/error/bloqueado |
| Wireframes de baja/media fidelidad (`wireframes.html`, en gris) | Representan **estructura**, no estilo; sobreviven a cambios de colores/componentes |
| Datos de dominio (ciudades, categorías, tipos de oferta) | Viven en `src/lib/mvp-data.ts` (verificación rápida abajo) |

## 2. Qué CAMBIARÁ con el Sprint 4 (y por tanto queda pendiente)

- **Mockups de alta fidelidad navegables** (colores, tipografía, componentes pulidos, logo, exactitud pixel). No tiene sentido producirlos antes de que el frontend se estabilice.
- Posibles cambios de **componentes UI** (`src/components/ui/*`, `src/components/mvp/Ui.tsx`, estilos en `src/index.css`).
- Posibles cambios de **layout global** (`RootLayout`, topbar/nav) o de **micro-estructura** dentro de pantallas (nuevos banners, botones, etc.).

## 3. Qué revisar cuando arranque/termine el Sprint 4

Recomendación: hacer un quick-port de esta documentación cada vez que se integre algo grande.

### a) Checkpoint técnico rápido
```bash
git fetch origin
git log --oneline origin/main..origin/test -10        # qué se integró
git diff origin/test..HEAD -- src/index.css            # ¿cambió el sistema visual?
git diff origin/test..HEAD -- src/App.tsx              # ¿cambiaron rutas?
git diff origin/test..HEAD -- src/pages/               # ¿cambiaron pantallas?
npx prisma generate && npm run lint                     # asegurar que compile
```

### b) Verificar datos de dominio
```bash
git diff origin/test..HEAD -- src/lib/mvp-data.ts
```
(ciudades creativas, categorías, tipos de oferta, seed de pruebas)

### c) Re-validar cada pantalla
- Abrir la app (`npm run dev`) y recorrer el checklist (`checklist-de-validacion.md`).
- Marcar en `pantallas.md` qué cambió: nuevos campos, nuevos estados, textos, CTA.
- Si cambiaron componentes o colores: actualizar la **paleta** (tabla de tokens) y anotar en `reglas-de-negocio.md` §8 (contraste WCAG AA).

## 4. Regenerar los mockups de alta fidelidad (cuando corresponda)

Cuando el equipo confirme que el frontend nuevo está estable:

1. Releer `src/App.tsx` → verificar rutas nuevas/eliminadas → actualizar `sitemap.md`.
2. Releer cada `src/pages/*.tsx` del alcance → actualizar `pantallas.md`.
3. Releer `src/index.css` + `src/components/*` → extraer **tokens reales** (colores, fuentes, radios, espaciados).
4. Tomar los **SVG del logo real** (carpeta `Logo variants/` y `Diseño Hackaton/` del equipo).
5. Generar el prototipo navegable HTML/CSS replicando **exactamente** el código (mismo orden, textos, jerarquía y estados).
6. Validar con el checklist; exportar capturas por pantalla como material de presentación.

## 5. Regla de oro

> Los **wireframes grises** (estructura) se mantienen; los **mockups** (estilo) se regeneran. Cualquier "no disponible para el MVP" que desaparezca en un sprint debe actualizarse también en este expediente para que el entregable no quede desincronizado con el producto.