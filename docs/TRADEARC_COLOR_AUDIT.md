# Auditoría de color, TradeArc

Fecha de actualización: 2026-09-04

## Objetivo

Eliminar familias cromáticas heredadas que no pertenecían a TradeArc y dejar una sola fuente de verdad para colores de interfaz.

## Fuente de verdad

Los tokens se centralizan en `src/index.css` y siguen el manual de identidad:

| Rol | Valor |
| --- | --- |
| Primario | `#1A3C6E` |
| Cian de énfasis y foco | `#00D4FF` |
| Texto principal | `#333333` |
| Fondo neutro | `#F8F9FA` |
| Superficie y texto sobre estados | `#FFFFFF` |
| Dorado TradeArc | `#F9ECD9` |
| Éxito | `#1B6E3A` |
| Advertencia | `#8A5A00` |
| Error | `#B42318` |

Las sombras, bordes y textos secundarios usan transparencia de azul TradeArc o gris Pizarra. No añaden un color base nuevo.

## Mapeo aplicado

| Antes | Ahora | Uso resultante |
| --- | --- | --- |
| `#001F3F`, `#003366`, `#004080`, azules Tailwind | `#1A3C6E` | Navegación, enlaces, iconos, acciones y mapas. |
| Azul oscuro no definido en el manual | `#0D1E38` | Se eliminó y se sustituyó por `#1A3C6E`, el azul primario oficial. |
| Azules de foco heredados | `#00D4FF` | Foco de campos, selección y énfasis. |
| `#F5F5F5`, `#fbfbfb`, grises Tailwind | `#F8F9FA` | Fondos, paneles y estados neutros. |
| `#C0C0C0`, `#CBD5E1`, grises de borde | `rgba(26, 60, 110, 0.18)` | Bordes y separadores. |
| `#5f6f7f`, `#64748B`, Slate y Gray | `#333333` con transparencia | Texto secundario y controles inactivos. |
| Violetas, índigos, rosas y turquesas heredados | Azul TradeArc o Cian TradeArc | Avatares, categorías y elementos de interfaz. |
| Verdes heredados | `#1B6E3A` | Estados de éxito. |
| Rojos heredados | `#B42318` | Riesgo, error y acciones destructivas. |
| Naranjas, amarillos y ámbar heredados | `#8A5A00` | Advertencias semánticas. |
| Fondos dorados con varias tonalidades | `#F9ECD9` | Se consolidaron en el único dorado oficial para medallas, advertencias suaves y superficies de énfasis documentadas abajo. |
| Logotipo multicolor de Google | `#1A3C6E` monocromo | Evita introducir colores ajenos en el botón de acceso. |

## Archivos cubiertos

- `src/index.css`: tokens globales, componentes compartidos y estilos heredados.
- `src/pages/ProviderPage.css`, `src/pages/QuotesPage.css` y `src/components/map/ProviderMap.css`: páginas y mapa.
- `src/pages/ProfilePage.tsx`, `src/pages/QuotesPage.tsx`, `src/components/layout/DashboardLayout.tsx` y `src/pages/RequestPages.tsx`: utilidades de color Tailwind convertidas a la paleta.
- `src/components/map/ProviderMap.tsx`: categorías, calificaciones y cobertura del mapa.
- `src/lib/chat-helpers.ts`: gradientes de avatar limitados a colores TradeArc y estados funcionales.
- `src/pages/LoginPage.tsx` y `src/pages/RegisterPage.tsx`: icono de acceso de Google en versión monocroma azul.

## Inventario real del dorado `#F9ECD9`

El dorado no es exclusivo de las medallas. `#F9ECD9` es el único dorado permitido, pero se aplica en varias superficies que necesitan una señal cálida de reconocimiento, advertencia suave o progreso. En todos los casos se evita crear variantes de amarillo, ámbar u oro.

| Archivo | Componente o estado | Aplicación |
| --- | --- | --- |
| `src/index.css` | `.unavailable`, `.unavailable-icon` | Aviso de funcionalidad fuera del alcance del MVP y su ícono. |
| `src/index.css` | `.formal-in_progress`, `.status-in_conversation` | Estados heredados de formalización y conversación en progreso. |
| `src/index.css` | `.provider-status-banner.suspended`, `.provider-status-chip.suspended` | Perfil o proveedor suspendido, como advertencia de estado. |
| `src/index.css` | `.intent-summary[data-confidence="media"]` | Confianza media en el resumen de intención de búsqueda. |
| `src/index.css` | `.password-strength-fair`, `.password-strength-good` | Nivel intermedio y bueno del indicador de fortaleza de contraseña. |
| `src/index.css` | `.provider-cover .eyebrow`, `.benefit-panel svg` | Acentos de marca en portada de proveedor y panel de beneficios. |
| `src/index.css` | `.provider-map-dot`, touchpoint seleccionado | Punto de ubicación y borde de selección en el mapa. |
| `src/index.css` | `.conversation-avatar`, `.system-message`, `.quote-composer`, `.rating` | Avatar de conversación, mensajes del sistema, módulo de cotización y estrellas de calificación. |
| `src/pages/ProviderPage.css` | `.medal-badge.tone-amber`, `.medal-badge.tone-yellow` | Medallas con tono cálido. |
| `src/pages/ProfilePage.tsx` | Botón de mejora de biografía | Acción de mejora asistida, con texto azul TradeArc sobre fondo dorado. |
| `src/lib/chat-helpers.ts` | Paleta de avatares generados | El dorado participa como color de entrada de un gradiente de avatar, junto con colores oficiales. |

## Aplicación de los demás colores oficiales

| Token | Lugares principales donde se aplica |
| --- | --- |
| `#1A3C6E` Primario | Encabezado, navegación, botones principales, enlaces, títulos, mapas, controles activos y acciones de acceso. Se usa también como color base en avatares y gradientes. |
| `#00D4FF` Cian | Foco de campos, selección, marcadores de énfasis, íconos del menú de sesión, indicadores de red y estados interactivos sobre fondos azules. |
| `#333333` Texto | Texto principal, títulos de contenido y controles sobre fondos claros. |
| `#F8F9FA` Fondo neutro | Fondo global, paneles neutros, estados sin selección y superficies de baja intensidad. |
| `#FFFFFF` Superficie o texto | Tarjetas, formularios y texto sobre encabezados, botones y estados con fondo de color. |
| `#1B6E3A` Éxito | Estados completados, verificación y señales positivas. |
| `#8A5A00` Advertencia | Texto y símbolos de advertencia sobre fondos dorados, estados pendientes y señales de riesgo moderado. |
| `#B42318` Error | Riesgo, validaciones inválidas, reportes, acciones destructivas y contador de pendientes. |
| Transparencias derivadas | Bordes, separadores, sombras, overlays y anillos de foco derivados del azul primario o del fondo neutro, sin introducir colores nuevos. |

## Regla de interpretación

El token dorado describe el fondo o acento cálido, no el significado único de “medalla”. El significado depende del componente: reconocimiento en medallas, advertencia suave en estados suspendidos o pendientes, énfasis de confianza media, progreso intermedio y acciones destacadas. La documentación anterior fue imprecisa al llamarlo exclusivo de medallas; esta versión corrige esa contradicción.

## Validación

La auditoría eliminó los valores `oklch(...)` heredados y las utilidades Tailwind de color ajenas a la marca de los archivos de interfaz. Los colores restantes son valores oficiales, blanco permitido o transparencias derivadas de un color oficial.
