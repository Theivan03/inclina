# Inclina — guía de compilación y publicación

Un solo código (`www/`) para tres destinos: PWA en tu hosting, Android (Google Play) e iOS (App Store).
Capacitor empaqueta `www/` dentro de las apps nativas; los archivos van dentro de la app, no se cargan
de ninguna web.

Orden recomendado: 1) compilar y probar en tu Android, 2) primera salida real, 3) Google Play, 4) iOS.

---

## 0. Qué hay en el proyecto

```
www/                   la app: index.html (pantallas y estilos), app.js (lógica), lean-core.js (cálculo del
                       ángulo), geo.js (distancias, GPX, trazados), db.js (IndexedDB), platform.js (GPS en
                       segundo plano, sensores nativos, voz, compartir), vendor/ (MapLibre), fuentes e iconos
capacitor.config.json  identificador com.ivancabrera.inclina, nombre Inclina, ajustes de barras y splash
android/               proyecto Android Studio, ya con permisos, iconos, splash y firma preparada
ios/                   proyecto Xcode, ya con permisos (Info.plist), iconos y splash, solo iPhone
assets/                fuentes de los iconos y del splash (1024 px y 2732 px)
tienda/                política de privacidad, fichas de tienda, capturas y gráficos
tools/                 generador de iconos, generador de capturas y test del cálculo
GUIA-PUBLICACION.md    este archivo
```

Comandos (desde la carpeta del proyecto):

| Comando | Qué hace |
|---|---|
| `npm install` | instala Capacitor y plugins (una vez) |
| `npm run sync` | copia `www/` a los proyectos nativos y actualiza plugins. **Después de cada cambio en `www/`.** |
| `npm run android` | abre el proyecto en Android Studio |
| `npm run ios` | abre el proyecto en Xcode (solo en Mac) |
| `npm run serve` | sirve `www/` en http://localhost:8080 para probar en el PC |
| `npm test` | prueba el cálculo del ángulo con una ruta simulada |
| `npm run assets` | regenera iconos y splash si cambias `tools/make-assets.py` |

Requisitos: Node 20 o superior. Android: Android Studio actual (instala el SDK 36 cuando lo pida).
iOS: Mac con Xcode 16 o superior y cuenta en el Apple Developer Program.

---

## 1. Primer arranque

```
unzip inclina-app.zip && cd inclina-app
npm install
npm run sync
```

---

## 2. Android

### 2.1 Probar en tu móvil (sin firmar nada)

1. `npm run android` (o Android Studio → Open → carpeta `android/`). La primera vez Gradle descarga
   dependencias; tarda unos minutos.
2. En el móvil: Ajustes → Información del teléfono → pulsa 7 veces "Número de compilación" →
   Opciones de desarrollador → activa "Depuración USB". Conecta por cable y acepta el aviso.
3. En Android Studio elige tu móvil arriba y pulsa Run (▶). Se instala y abre.
4. Primera prueba: Cero con el móvil quieto → gira el móvil a mano → el ángulo se mueve.
   Luego Iniciar salida: debe pedir permiso de ubicación. Ajustes → Salida simulada para ver
   el flujo completo sin moto.

Para ver la consola de la app (errores JS): Chrome en el PC → `chrome://inspect` → tu dispositivo → Inclina → Inspect.

### 2.2 Clave de firma (una sola vez, guárdala como oro)

En la carpeta `android/`:

```
keytool -genkeypair -v -keystore inclina-release.jks -alias inclina -keyalg RSA -keysize 2048 -validity 10000
```

(`keytool` viene con el JDK que instala Android Studio; en Windows suele estar en
`C:\Program Files\Android\Android Studio\jbr\bin\`.) Te pedirá dos contraseñas y tus datos.

Crea `android/keystore.properties` con:

```
storeFile=inclina-release.jks
storePassword=LA_CONTRASEÑA_DEL_ALMACEN
keyAlias=inclina
keyPassword=LA_CONTRASEÑA_DE_LA_CLAVE
```

Ambos archivos están en `.gitignore`. Haz copia del `.jks` y de las contraseñas en dos sitios.
Con "Firma de apps de Google Play" (activada por defecto al crear la app) Google guarda la clave
definitiva y la tuya es solo la de subida: si la pierdes, se puede restablecer desde Play Console.
Sin ese servicio, perder la clave significa no poder actualizar la app nunca más.

### 2.3 Generar el AAB firmado

Desde `android/`:

```
./gradlew bundleRelease        (Windows: gradlew.bat bundleRelease)
```

Sale en `android/app/build/outputs/bundle/release/app-release.aab`. (Alternativa en Android Studio:
Build → Generate Signed App Bundle / APK → Android App Bundle → elige el `.jks`.)

Para cada subida nueva a Play Console sube `versionCode` en `android/app/build.gradle` (1, 2, 3...)
y, si quieres, `versionName` ("1.0.1"). Google rechaza un AAB con un versionCode ya usado.

### 2.4 Google Play Console (cuenta personal)

1. https://play.google.com/console → crea la cuenta de desarrollador (25 $ una vez). Verificación
   de identidad (DNI y, si te la pide, dirección) antes de poder publicar.
2. Crear app → nombre "Inclina", aplicación, gratuita, idioma predeterminado español (España).
3. **Ficha de Play Store principal**: copia de `tienda/google-play.md`. Sube:
   - icono: `tienda/graficos/icono-512.png`
   - gráfico de portada: `tienda/graficos/portada-1024x500.png`
   - capturas de teléfono: `tienda/capturas/android-*.png` (mínimo 2)
4. **Política → Contenido de la app**: cada apartado está respondido en `tienda/google-play.md`.
   Antes necesitas la política de privacidad en una URL: sube `tienda/privacidad.html` a tu hosting
   (p. ej. `https://tudominio.com/inclina/privacidad.html`) y pon tu correo donde está el marcador.
5. **Prueba interna** (Lanzar → Pruebas → Prueba interna): sube el AAB, añade tu correo como tester,
   acepta el enlace de invitación en el móvil e instala desde Play. Es la forma de comprobar que
   lo que sube Google funciona igual que lo que compilas tú.
6. **Prueba cerrada**: obligatoria para cuentas personales creadas desde noviembre de 2023. Crea
   una lista de 12 testers (correos de Gmail: amigos, compañeros, el club de moteros), súbeles el
   mismo AAB y necesitas que estén apuntados **14 días seguidos**. Ellos solo tienen que aceptar
   la invitación e instalar; no hace falta que la usen. Pasados los 14 días, en el panel aparece
   "Solicitar acceso a producción": un formulario corto sobre qué has probado.
7. **Producción**: cuando te aprueben el acceso, crea una versión de producción con el AAB, países
   (todos o los que quieras) y envía a revisión. La primera revisión puede tardar de 1 a 7 días.

Para actualizar la app publicada: cambia `www/`, `npm run sync`, sube `versionCode`, nuevo AAB,
Producción → Crear versión. Revisión de horas a un par de días.

---

## 2.5 APK sin Android Studio: compilar en GitHub

El proyecto trae `.github/workflows/android-apk.yml`. Con eso, GitHub compila el APK por ti:

1. Crea un repositorio en GitHub (privado vale) y sube la carpeta del proyecto completa
   (sin `node_modules/`; el `.gitignore` ya lo excluye). Desde la carpeta:
   ```
   git init && git add -A && git commit -m "Inclina"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/inclina.git
   git push -u origin main
   ```
2. En GitHub → pestaña **Actions** → "Android APK" → espera unos 5-8 minutos la primera vez.
3. El APK sale en dos sitios: como artefacto de la ejecución (`inclina-debug-apk`, un zip con el
   `.apk` dentro) y en **Releases → latest** como `inclina-debug.apk`, que es lo cómodo: abres esa
   página en el móvil, descargas el APK, lo abres y Android te pide permitir instalar desde Chrome.
4. Cada vez que hagas `git push` se genera un APK nuevo. Para instalarlo encima del anterior no hay
   que desinstalar nada (misma firma de debug del runner... ver nota).

Nota: el APK de debug lo firma GitHub con una clave que cambia entre ejecuciones distintas, así que
Android puede pedir desinstalar la versión anterior antes de instalar una nueva. Si eso molesta, en
`android/keystore.properties` del runner se puede meter tu clave de release como secretos de GitHub;
dímelo y lo añado al workflow.

Este APK es para instalarlo a mano. Para Google Play hace falta el AAB firmado del apartado 2.3.

**Sensores nativos.** La app Android lee el giróscopo y el acelerómetro directamente (plugin
`MotionPlugin.java`, hasta 200 muestras/s), no a través del WebView. En Ajustes → Sensores debe
poner "sensores nativos" y una cifra alta de muestras/s. La PWA sigue usando los del navegador.

**GPS en segundo plano.** Al grabar una ruta, la app arranca un servicio con notificación
(@capacitor-community/background-geolocation) para que el GPS siga aunque se apague la pantalla.
En Android 13+ pide el permiso de notificaciones la primera vez. Si la grabación se corta al
bloquear el móvil, revisa que la app no tenga restringida la batería (Ajustes del sistema → Apps →
Inclina → Batería → Sin restricciones).

**Mapas.** Teselas vectoriales de OpenFreeMap (gratis, sin clave). Las zonas por las que ya has
pasado quedan en caché del navegador/WebView para verlas sin cobertura (no es un mapa offline
completo; eso llegará en la fase 2).

**Ficha de Play Store.** Con la v2 hay que regenerar las capturas (`python3 tools/capturas.py` ya
no vale tal cual: las pantallas han cambiado; hazlas a mano desde el móvil o pídemelas) y revisar
"Seguridad de los datos": la app sigue sin enviar datos, pero ahora usa ubicación en primer plano
con servicio en segundo plano durante la grabación; `tienda/privacidad.html` ya lo refleja.

## 3. iOS (en tu Mac)

### 3.1 Abrir y probar en tu iPhone

1. En el Mac, con Node instalado: `npm install && npm run sync && npm run ios`. Xcode abre
   `ios/App/App.xcodeproj` y resuelve los paquetes (Capacitor 8 usa Swift Package Manager,
   no hace falta CocoaPods).
2. Xcode → selecciona el target "App" → pestaña **Signing & Capabilities** → marca "Automatically
   manage signing" y elige tu Team (tu cuenta del Apple Developer Program, 99 $/año). Xcode registra
   el bundle id `com.ivancabrera.inclina` y crea los perfiles solos.
3. Conecta el iPhone por cable, elígelo como destino y pulsa Run. En el iPhone: Ajustes → General →
   VPN y gestión de dispositivos → confía en tu certificado de desarrollador.
4. Prueba: al pulsar **Cero** iOS pide permiso de "Movimiento y forma física" (tiene que ser desde un
   toque, por eso está ahí); al iniciar salida pide ubicación.

### 3.2 App Store Connect

1. https://appstoreconnect.apple.com → Mis apps → + → Nueva app: iOS, nombre "Inclina" (si está
   cogido, "Inclina: inclinómetro de moto"), idioma principal español, bundle id el que registró
   Xcode, SKU `inclina-ios`.
2. Rellena la ficha con `tienda/app-store.md`: nombre, subtítulo, descripción, palabras clave, URLs,
   categoría, clasificación por edades.
3. **Privacidad de la app** → "No se recogen datos" (justificado en `tienda/app-store.md`).
4. Capturas de 6,7" → `tienda/capturas/ios-*.png` (1290 × 2796).
5. **Información de revisión** → copia las notas en inglés de `tienda/app-store.md`. Son importantes:
   le dicen al revisor cómo ver la app funcionando sin una moto (Ajustes → Salida simulada).

### 3.3 Archivar y subir

1. Xcode: destino "Any iOS Device (arm64)" → Product → Archive.
2. Organizer → Distribute App → App Store Connect → Upload (deja las opciones por defecto).
3. En App Store Connect, pestaña TestFlight: en unos minutos aparece la compilación; instálala en tu
   iPhone con la app TestFlight y pruébala.
4. En la versión 1.0.0 elige esa compilación, guarda y **Enviar para revisión**. Primera revisión:
   normalmente 24-48 h. Si la rechazan por la directriz 4.2 (funcionalidad mínima), responde en el
   Resolution Center con las notas de revisión y una grabación de pantalla de la salida simulada; se
   suele resolver sin cambios.

Para actualizar: cambia `www/`, `npm run sync`, en Xcode sube "Build" (CURRENT_PROJECT_VERSION: 2, 3...)
y "Version" si cambia (MARKETING_VERSION), Archive, Upload, nueva versión en App Store Connect.

---

## 4. PWA (sigue valiendo)

Sube el contenido de `www/` a `https://tudominio.com/inclina/`. Es exactamente la misma app; ahora
con las fuentes incluidas, sin depender de Google Fonts.

---

## 5. Lista de comprobación antes de enviar

- [ ] Política de privacidad publicada en una URL con tu correo (sin el marcador `[tu-correo...]`).
- [ ] Probada una salida real con el móvil en el Quad Lock: lado correcto (si no, Ajustes → Invertir)
      y ángulos razonables.
- [ ] `versionCode` / Build únicos para esta subida.
- [ ] Las capturas se corresponden con la versión que subes. Si quieres regenerarlas con tu hora
      local: `pip install playwright && playwright install chromium && python3 tools/capturas.py`.
- [ ] En Play Console, "Seguridad de los datos" enviado y "Contenido de la app" completo (los
      apartados en rojo bloquean el envío).
- [ ] En App Store Connect, notas de revisión pegadas.

---

## 6. Problemas típicos

- **Gradle no sincroniza / error de JDK**: Android Studio → Settings → Build Tools → Gradle → Gradle JDK:
  elige el "jbr" que trae Android Studio (17 o 21).
- **"Plugin X is not implemented"** en la consola: falta `npm run sync` después de tocar `package.json`
  o de instalar un plugin.
- **GPS "denegado"**: el usuario ha rechazado el permiso; se vuelve a conceder en Ajustes del sistema →
  Apps → Inclina → Permisos. La app sigue funcionando sin velocidad.
- **Marca el lado contrario**: Ajustes → Invertir izquierda y derecha. Es una peculiaridad de algunos
  sensores, no un fallo de montaje.
- **En iOS no pide permiso de movimiento**: solo se pide desde un toque del usuario (botón Cero). Si
  se denegó, Ajustes → Inclina → Movimiento y forma física.
- **Google pregunta por "ubicación en segundo plano"**: no aplica; la app no declara ese permiso.
  Si el formulario insiste, responde que la ubicación es solo en primer plano, para la velocidad.
- **Apple rechaza por 4.2 / 4.2.2**: responde con las notas de revisión y un vídeo de la salida
  simulada y de la lectura real del sensor; la app usa CoreMotion y GPS y funciona sin red.
