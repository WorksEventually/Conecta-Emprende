# Instrucciones de Agente (TradeArc)

Este documento define las reglas de negocio y convicciones técnicas para el proyecto "TradeArc".

## Adaptación de Entorno
- El entorno actual utiliza Vite + React + Express (en lugar de Next.js App Router).
- Se mantendrá la misma filosofía (TypeScript, Tailwind, Zod, Prisma, SSR adaptado mediante API Routes de Express).
- Todo el código backend reside en `server.ts` (API bajo el prefijo `/api/`).

## Reglas de Interfaz (UI/UX)
- Idioma principal: Español (Nicaragua).
- Tailwind CSS se usa como motor de estilos principal.
- Usar iconos de `lucide-react`.
- Diseño Responsive: Desktop muestra mapa a la derecha y lista a la izquierda; Mobile apila en pestañas o verticalmente.

## Reglas de Mapas
- Usar SIEMPRE `leaflet` y `react-leaflet`.
- NO usar Google Maps.
- NO usar CARTO tiles. Utilizar `tile.openstreetmap.org`.

## Backend y Prácticas de Código
- Retornar siempre errores comprensibles enfocados en el usuario final.
- Zod se utilizará para validar cualquier payload entrante en `/api/`.
