# Pruebas del sistema

Aplicación en español para documentar errores, cambios y consultas. Frontend estático para GitHub Pages; backend Google Apps Script; reportes en Sheets y capturas privadas en Drive. No requiere una cuenta de Google para los usuarios: se entra con una contraseña compartida.

## Qué permite

- Reportar tipo, sección, pasos, resultado esperado y real, impacto y dispositivo/navegador.
- Pegar una captura con Ctrl+V / ⌘V o cargar PNG, JPG o WebP de hasta 3 MB.
- Revisar todos los reportes tras introducir la contraseña.
- Marcar «Revisado» y «Solucionado» y añadir notas con fecha, sin editar los pasos ni resultados originales.
- Avisar de reportes nuevos a los destinatarios configurados de forma privada. El correo contiene un enlace y datos generales; nunca la contraseña ni el contenido completo de las notas.

## Configurar Google

1. En https://script.google.com crea un proyecto independiente.
2. Copia `backend/Code.gs` en el archivo `Code.gs`.
3. En Configuración del proyecto, activa la visualización de `appsscript.json` y copia el manifiesto de `backend/appsscript.json`. La zona horaria es Europe/Madrid.
4. Ejecuta `setup` y autoriza el acceso a Sheets, Drive, los activadores y el envío de correo. Crea una hoja de reportes, las pestañas `Followup` y `Notifications` y una carpeta privada de capturas. Repetir `setup` reutiliza estos recursos.
5. En **Configuración del proyecto → Propiedades del script**, añade:

| Propiedad | Valor |
| --- | --- |
| `REVIEW_PASSWORD` | Tu contraseña de entre 16 y 200 caracteres. No la pongas en el código, GitHub ni este documento. |
| `ALLOWED_ORIGIN` | `https://malaspulgastours.github.io` (sin ruta ni barra final). |
| `NOTIFY_EMAILS` | Correos de los destinatarios autorizados, separados por comas. Nunca se publican en GitHub. |
| `APP_URL` | `https://malaspulgastours.github.io/Testing/` |

`SPREADSHEET_ID` y `FOLDER_ID` los crea `setup`. No publiques sus valores ni compartas la hoja o carpeta con los visitantes. Las personas que conozcan la contraseña pueden crear reportes, leerlos y añadir seguimiento; no hay identificación individual de los programadores.

6. **Implementar → Nueva implementación → Aplicación web**: ejecutar como **Yo**, acceso **Cualquier persona**. Copia la URL terminada en `/exec`, no `/dev`. Algunas organizaciones impiden el acceso anónimo; compruébalo desde una ventana sin sesión.
7. Pega esa URL en `config.js`, en `endpoint`. `config.js` solo contiene configuración pública.
8. Al cambiar el backend, guarda el proyecto y actualiza la implementación a una **nueva versión**. La URL `/exec` debe mantenerse.

## Publicar en GitHub Pages

Sube el contenido del proyecto a la raíz del repositorio `MalaspulgasTours/Testing`.

Opción sencilla: **Settings → Pages → Deploy from a branch → main → /(root) → Save**. El archivo `.nojekyll` permite servir los archivos estáticos directamente. La URL será la que GitHub confirme en esa pantalla.


## Contraseña y seguridad

El acceso se comprueba en Google en cada operación. La contraseña se usa solo al entrar y no se guarda en el navegador. Google entrega una sesión firmada que dura siete días. «Recordar en este navegador» la conserva al cerrar y volver a abrir el navegador; si lo desmarcas, solo se conserva en la pestaña y resiste sus recargas. «Cerrar sesión» elimina el acceso guardado y borra de pantalla los reportes cargados. Cambiar la contraseña invalida también las sesiones anteriores. Cambia `REVIEW_PASSWORD` para revocar la anterior; no requiere republicar GitHub.

GitHub Pages publica el código y la pantalla de acceso. Los reportes y las imágenes se obtienen del backend solo tras verificar la contraseña. Ocultar una sección en el navegador no se considera una protección; la comprobación real está en Apps Script.

Los archivos de Drive conservan los permisos de su carpeta. Usa una carpeta privada nueva, como la que crea `setup`; no actives «Cualquier persona con el enlace». Las capturas se entregan a través del backend y no necesitan compartir Drive.

Se validan campos y tamaños, formatos y firmas de imágenes; se bloquean SVG y fórmulas en los textos enviados a Sheets. Los identificadores de solicitud evitan duplicar un reporte o una nota cuando se reintenta el envío. El origen configurado limita el destino de las respuestas, pero un cliente externo puede falsificar el campo `origin`: la contraseña es la barrera de acceso.

Límites incluidos: 1.000 solicitudes diarias, 200 reportes diarios, 200 seguimientos por reporte y 20 reportes por página. No sustituyen un cortafuegos: un endpoint Apps Script públicamente accesible puede sufrir agotamiento de cuota. No compartas la contraseña fuera del equipo.

Turnstile es opcional. Para activarlo, configura su clave pública en `config.js` y sus propiedades privadas `TURNSTILE_SECRET` y `TURNSTILE_HOSTNAME` en Google. Se valida el token en el servidor, incluida la acción `feedback` y el hostname. No basta con mostrar el widget.

## Avisos por correo

`setup` instala un activador que ejecuta `deliverNotifications` aproximadamente cada cinco minutos. Google puede retrasar activadores. Cada reporte se añade a `Notifications`; la función envía hasta diez avisos por ejecución y reintenta los fallos hasta tres veces. Si se agota la cuota de destinatarios de Google, espera a disponer de cuota. Revisa `SentAt`, `Attempts` y `Error` en la pestaña para diagnosticar incidencias. Para reintentar un fallo ya agotado, el propietario puede corregir el problema y poner `Attempts` en 0.

Los destinatarios están fijados en las propiedades privadas del backend. Los visitantes no pueden cambiarlos. La autorización de correo debe realizarla la cuenta propietaria del script. Una interrupción de Google justo después del envío y antes de registrar la confirmación podría generar un aviso duplicado al reintentar.

## Pruebas

Con Node.js 24:

```text
node --test tests/backend.test.cjs
node --check app.js
node --check config.js
```

Las pruebas simulan Sheets, Drive y MailApp: no envían correos reales. Cubren permisos, validación, deduplicación, seguimiento sin modificar el reporte, cola de correo y fallos. No sustituyen una prueba real de la implementación de Google.

Comprobación final manual:

1. Abre GitHub Pages sin iniciar sesión en Google; prueba contraseña incorrecta y correcta.
2. Envía un reporte con captura pegada y otro con archivo cargado. Comprueba una sola fila y un archivo privado por envío.
3. Abre «Revisión del equipo», visualiza la captura, marca ambas casillas y añade una nota. Comprueba que los pasos y resultados originales no cambian.
5. Comprueba el correo y la cola; prueba fallos de red sin borrar el formulario.
6. Cierra sesión y comprueba que la lista vuelve a requerir contraseña.

## Transporte entre GitHub y Google

Se envía un formulario POST a un iframe. Google devuelve una confirmación con `postMessage`; se comprueba un nonce aleatorio por solicitud y el origen HTTPS `*.googleusercontent.com`. No se usa un envío `no-cors` que indique éxito sin confirmar que el reporte se ha guardado. Si no llega respuesta en 60 segundos, la app conserva el formulario y el identificador de solicitud para reintentar durante esa sesión. No se guardan capturas ni contraseñas en almacenamiento local; únicamente la sesión firmada si eliges recordar el acceso.

Documentación oficial: [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [validación Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).


## Edición exclusiva de la propietaria

Configura `OWNER_PASSWORD` en las propiedades privadas del script: entre 16 y 200 caracteres, distinta de `REVIEW_PASSWORD`. Se utiliza solo al iniciar sesión y no se guarda en el navegador. Google emite una sesión firmada con rol de propietaria. «Editar reporte» y «Editar título» solo aparecen para ese rol y el servidor lo comprueba en cada guardado. La contraseña del equipo inicia una sesión sin permiso de edición. «Cerrar sesión / cambiar acceso» está disponible en todas las pestañas. Si falta, la edición permanece bloqueada. El equipo conserva sus casillas y notas. Los cambios de contenido conservan referencia, fecha original, título y seguimiento; las capturas sustituidas se conservan en la carpeta privada para permitir recuperación.
