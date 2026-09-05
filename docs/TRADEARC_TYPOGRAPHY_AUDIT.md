# Auditoría tipográfica de TradeArc

Fecha: 4 de septiembre de 2026
Fuente de verdad: `Manual de Identidad.pptx (2).pdf`, páginas 11–12.

## Resultado

La aplicación usa ahora una sola familia para la interfaz y una familia diferenciada para información técnica:

| Rol | Familia | Peso | Tamaño / interlineado |
| --- | --- | --- | --- |
| H1 / título de pantalla | Inter | 700 | 32px / 1.2 |
| H2 / sección / tarjeta | Inter | 600 | 24px / 1.3 |
| Cuerpo / descripción | Inter | 400 | 16px / 1.5 |
| Botón / acción | Inter | 600 | 16px |
| Label de formulario | Inter | 500 | 13px / 1.35 |
| Caption / texto complementario | Inter | 400 | 12px / 1.35 |
| ID, score, métrica, timestamp | JetBrains Mono | 500 | 14px / 1.35 |

## Hallazgos corregidos

1. `Inter` estaba declarada en varios estilos, pero no se cargaba de forma explícita. `index.html` ahora carga Inter en 400/500/600/700 y JetBrains Mono en 500/700.
2. Se eliminó `Space Grotesk` de mapas, perfiles, cotizaciones y estados de chat. Esos componentes heredan `var(--tradearc-font-ui)`.
3. Se eliminó `Courier New` del registro de eventos y se sustituyó por `var(--tradearc-font-technical)`.
4. Se reemplazaron familias hardcodeadas repetidas en `ProviderMap.css`, `ProviderPage.css` y `QuotesPage.css` por tokens centralizados.
5. Los pesos heredados `650`, `750`, `800`, `850` y `900` se normalizaron a los pesos oficiales de Inter: `600` o `700` según su función.
6. Los encabezados, párrafos, botones, labels, captions y datos técnicos tienen una capa global de aplicación para evitar que clases antiguas de páginas vuelvan a romper la jerarquía.

## Áreas revisadas

- Shell, navegación, menú de cuenta y estados de sesión.
- Inicio, búsqueda, filtros, resultados y mapa.
- Perfil público, edición de perfil y panel del proveedor.
- Solicitudes, cotizaciones, chat y mensajes del sistema.
- Formalización, reseñas, reportes administrativos y eventos.
- Componentes reutilizables de botones, inputs, selects, textareas, tarjetas y banners.
- Clases Tailwind presentes en `DashboardLayout.tsx`, `ProfilePage.tsx` y `QuotesPage.tsx`; la capa tipográfica global mantiene su herencia en estos componentes.

## Tokens y fallbacks

Los tokens se encuentran en `src/index.css`:

- `--tradearc-font-ui`: `Inter`, `Roboto`, `Open Sans`, `sans-serif`.
- `--tradearc-font-technical`: `JetBrains Mono`, `Source Code Pro`, `monospace`.
- `--tradearc-type-*`, `--tradearc-leading-*` y `--tradearc-font-weight-*` para la jerarquía completa.

Los fallbacks no sustituyen la fuente oficial cuando está disponible; únicamente mantienen legibilidad si la descarga de fuentes externas falla.
