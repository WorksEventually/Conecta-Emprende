# Entregable 6 — Experiencia de Usuario (UX) e Interfaz (UI)

**Proyecto:** Conecta Emprende AI · **Hackathon:** Ciudades Creativas y Tecnológicas · **Categoría:** Avanzado
**Rama base del MVP:** `test` (`99929d9`) · **Fecha:** septiembre 2026

> 🙋 Nota de contexto: el equipo construyó el MVP antes que los wireframes, así que este entregable se hizo **al revés**: cada pantalla se extrajo del código real del MVP para que la especificación y los wireframes reflejen exactamente lo que existe (y lo que no). Cuando el Sprint 4 de frontend aterrice, se debe revalidar esta base (ver `04-guia-adaptacion-sprint4.md`).

---

## 📁 Qué contiene esta carpeta

| # | Carpeta / archivo | Contenido | Cumple requisito del reto |
|---|---|---|---|
| 1 | `01-sitemap-y-flujos/sitemap.md` | Mapa de todas las pantallas, rutas, tipos (pública/protegida) y navegación | Arquitectura de información |
| 2 | `01-sitemap-y-flujos/flujos-por-rol.md` | Flujos UX por rol: solicitante, proveedor, doble rol, visitante | Arquitectura de información |
| 3 | `02-wireframes-baja-fidelidad/wireframes.html` | Wireframes en baja/media fidelidad (escala de grises, anotados) de cada pantalla | **Wireframes avanzados** |
| 4 | `03-especificacion/pantallas.md` | Especificación por pantalla: propósito, elementos, estados (vacío / carga / error / bloqueado por MVP) | Documentación de UI |
| 5 | `03-especificacion/reglas-de-negocio.md` | Reglas del dominio extraídas del código (confianza, cotización 3 ejes, reseña, verificación, reportes) | Especificación funcional |
| 6 | `03-especificacion/checklist-de-validacion.md` | Recorrido guiado para validar la funcionalidad del producto (equivale al flujo de demostración del README) | **Validación de funcionalidad** |
| 7 | `04-guia-adaptacion-sprint4.md` | Qué es estable vs. cambiante frente al Sprint 4 y plan de regeneración de los mockups de alta fidelidad | Plan de adaptación |

## 🎯 Cómo se entrega ante el reto

- **Wireframes avanzados (baja/media fidelidad):** `02-wireframes-baja-fidelidad/wireframes.html` — sí, se entrega.
- **Mockups de alta fidelidad navegables:** *pendiente deliberado* — se generar fuera del riesgo del Sprint 4 de frontend (ver `04-guia-adaptacion-sprint4.md`). El reto admite "Figma o cualquier otra herramienta interactiva que permita validar la funcionalidad": el MVP funcionando en `localhost:3000` ya valida la funcionalidad y esta especificación permite regenerar los mockups 1:1 cuando el frontend se estabilice.

## 🧠 Principios base (de `PRODUCT.md` / `DESIGN.md` del repo)

1. La confianza se demuestra con evidencia, no con decoración.
2. Cada pantalla conduce a una acción real o explica honestamente por qué algo no está disponible.
3. La búsqueda natural se siente sencilla, pero sus inferencias deben ser visibles y corregibles.
4. La identidad local vive en los datos (ciudades, lenguaje, negocios verdaderos), no en folklor superficial.
5. La formalización legal queda como roadmap futuro; el MVP activo no promete trámites.