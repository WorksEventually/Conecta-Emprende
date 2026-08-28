# Conecta Emprende AI

MVP para conectar personas emprendedoras, MIPYMES y proveedores de Nicaragua mediante búsqueda en lenguaje natural, señales de confianza y solicitudes de cotización verificables.

## Ejecutar

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Verificación

```bash
npm run lint
npm run build
```

## Configurar OAuth Google

El inicio de sesión con Google requiere credenciales propias:

1. Crear un proyecto en [Google Cloud Console](https://console.cloud.google.com).
2. Ir a **APIs y servicios → Pantalla de consentimiento de OAuth**, tipo **Externo**, y completar nombre de la app y correos de contacto.
3. En **Credenciales → Crear credencial → ID de cliente de OAuth**, elegir tipo **Aplicación web**.
4. En **URIs de redirección autorizados** agregar (debe coincidir EXACTO con `${APP_URL}/api/auth/google/callback`):
   ```
   http://localhost:3000/api/auth/google/callback
   ```
5. Copiar el Client ID y Client Secret en `.env`:
   ```env
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   ```

Sin estas variables, `GET /api/auth/google` responde 503 y el botón "Continuar con Google" muestra el error correspondiente al usuario.

## Cuentas seed para pruebas manuales

Todas usan la contraseña `Conecta123!`.

| Propósito | Email |
|---|---|
| Solicitante normal | `requester@conecta.test` |
| Proveedor activo | `textil@conecta.test` |
| Proveedor suspendido | `cafe@conecta.test` |
| Proveedor baneado | `equipos@conecta.test` |
| Admin reviewer | `admin@conecta.test` |
| Super admin | `superadmin@conecta.test` |

Los roles granulares (`REQUESTER`, `PROVIDER`, `ADMIN_REVIEWER`, `SUPER_ADMIN`) y los estados de proveedor (`DRAFT`, `ACTIVE`, `SUSPENDED`, `BANNED`, futuros `INACTIVE`/`TEMPORARILY_RESTRICTED`) estÃ¡n definidos en el contrato de perfiles. Ver `docs/profile-auth-rating-contract.md` y `docs/admin-reviewer-super-admin-statuses.md`.

## Flujo de demostración

1. Buscar `Necesito empaques ecológicos en León que sean baratos`.
2. Abrir un perfil y revisar verificación, confianza, medallas, catálogo y señales comerciales soportadas por el MVP.
3. Crear una solicitud de cotización.
4. Responder y confirmar el trabajo desde ambas partes.
5. Publicar una reseña desbloqueada por la finalización bilateral.
6. Editar el perfil público desde Mi perfil.
7. Enviar un reporte y revisarlo desde Administración.

Los datos de dominio persisten en `localStorage`; la sesión nunca se incluye en esa serialización. Mientras se conecta el login real, la aplicación inicia con la cuenta administradora que también posee `provider-1`.

Para desactivar ese bootstrap al conectar autenticación:

```bash
VITE_BOOTSTRAP_ADMIN=false
```

El middleware de login debe validar la cookie HTTP-only, colocar el `AuthSessionDTO` en `res.locals.authSession` y exponerlo mediante `GET /api/auth/session`.

## Modo manual de pruebas de perfiles

Para probar categorías de perfil localmente sin login real:

```bash
VITE_ENABLE_DEMO_PROFILE_SWITCHER=true
```

Esto muestra un selector flotante de perfiles demo. Es una herramienta temporal de desarrollo; no es autenticación real, no concede permisos reales de administración y debe permanecer desactivada en producción. La checklist está en `docs/manual-profile-test-checklist.md`.
