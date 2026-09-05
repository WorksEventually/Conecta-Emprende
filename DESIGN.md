# TradeArc Design System

## Dirección

Interfaz de producto clara, confiable y práctica para emprendedores, MIPYMES y proveedores de Nicaragua. La identidad local se expresa mediante lenguaje y datos reales, no mediante colores decorativos fuera de la marca.

## Paleta oficial

- Azul TradeArc, primario: `#1A3C6E`
- Cian TradeArc, acento y foco: `#00D4FF`
- Gris Pizarra, texto principal: `#333333`
- Neutro Claro, fondo: `#F8F9FA`
- Blanco, texto sobre estados y superficies: `#FFFFFF`
- Dorado TradeArc: `#F9ECD9`, único dorado permitido para medallas, advertencias suaves, progreso intermedio y acentos de énfasis documentados en la auditoría de color.

### Estados interactivos

- Hover primario: `#132D52`
- Activo primario: `#1A3C6E` (el manual no define una variante azul más oscura)
- Hover de cian: `#00BFEE`

### Estados funcionales

- Éxito: `#1B6E3A`
- Advertencia: `#8A5A00`
- Riesgo o error: `#B42318`
- Información: `#1A3C6E`

Las transparencias para bordes, sombras y superficies parten únicamente de estos colores. No se introducen nuevas familias cromáticas.

## Gradientes oficiales

- Azul a cian: `linear-gradient(135deg, #1A3C6E 0%, #00D4FF 100%)`
- Azul profundo: `linear-gradient(180deg, #1A3C6E 0%, #00005A 100%)`
- Cian suave: `linear-gradient(90deg, #00D4FF 0%, #F8F9FA 100%)`
- Neutro a azul: `linear-gradient(180deg, #F8F9FA 0%, #E2E8F0 100%)`

## Tipografía y componentes

La tipografía primaria es `Inter`, con pesos `400` Regular, `500` Medium, `600` SemiBold y `700` Bold. La tipografía técnica es `JetBrains Mono`, con pesos `500` y `700`, para IDs, puntuaciones, métricas, timestamps y reportes internos. La implementación carga ambas familias y conserva los fallbacks autorizados por el manual: `Roboto`/`Open Sans` para UI y `Source Code Pro` para datos técnicos.

La jerarquía implementada sigue el manual de identidad:

- H1: `32px`, `1.2`, Inter Bold.
- H2 y títulos de sección/tarjeta: `24px`, `1.3`, Inter SemiBold.
- Cuerpo y descripciones: `16px`, `1.5`, Inter Regular.
- Botones y etiquetas de acción: `16px`, Inter SemiBold.
- Labels de formularios: `13px`, Inter Medium.
- Captions y texto complementario: `12px`, Inter Regular.
- Datos técnicos: `14px`, `1.35`, JetBrains Mono Medium.

Los tokens viven en `src/index.css` como `--tradearc-font-*`, `--tradearc-type-*` y `--tradearc-leading-*`. Los botones, entradas, tarjetas y modales usan radio de `8px`. Los estados siempre combinan color, icono y texto; nunca dependen solo del color.
