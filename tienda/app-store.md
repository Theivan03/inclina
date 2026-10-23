# Ficha de App Store — Inclina

Copia y pega en App Store Connect → Mi app → versión 1.0.0. Límites entre paréntesis.
Idioma principal: español (España). Añade English (U.S.) como localización.

## Nombre (30)
Inclina: inclinómetro de moto
EN: Inclina: Motorcycle Lean Angle

## Subtítulo (30)
Ángulo en vivo y por curva
EN: Live and per-corner lean

## Texto promocional (170, editable sin nueva versión)
Mide cuánto inclinas de verdad. Ángulo en vivo, máximos de cada curva, histórico y CSV. Sin anuncios ni cuenta.
EN: Measure how far you really lean. Live angle, per-corner maximums, history and CSV. No ads, no account.

## Descripción (4000)
Usa la descripción completa de `google-play.md` (es la misma; Apple admite saltos de línea pero no viñetas con formato, los puntos "•" van bien).

## Palabras clave (100, separadas por comas, sin espacios)
inclinometro,moto,angulo,inclinacion,curva,motocicleta,track,circuito,lean,telemetria
EN: lean,angle,motorcycle,motorbike,inclinometer,cornering,track,telemetry,ride,bike

## URLs
- Soporte: una página de tu dominio con el correo de contacto (vale la misma de la política).
- Política de privacidad: la URL de `tienda/privacidad.html`.
- Marketing: opcional.

## Categoría
Principal: Utilidades · Secundaria: Deportes

## Clasificación por edades
Cuestionario: No a todo → 4+.

## Capturas (obligatorias)
- iPhone 6,7" (1290 × 2796 o 1320 × 2868): `tienda/capturas/ios-*.png`. Con eso Apple cubre el resto de tamaños de iPhone.
- iPad: no hace falta; la app está marcada como solo iPhone en Xcode.

## Privacidad de la app (App Privacy)
Apple define "recoger" como transmitir datos fuera del dispositivo de forma que el desarrollador u otros puedan acceder a ellos. Inclina no transmite nada, así que:
- ¿Recoges datos de esta app? → **No, no recogemos datos de esta app.**
- Resultado en la ficha: "No se recogen datos".
- Esto es compatible con pedir permiso de ubicación y de movimiento: ambos se procesan solo en el dispositivo.

## Información de revisión (App Review Information) — importante
Apple rechaza apps que parecen "una página web empaquetada" (directriz 4.2). Inclina no lo es, pero el revisor no va a subirse a una moto para comprobarlo, así que dale instrucciones claras en "Notas":

Notas para la revisión (en inglés, que es lo que lee el revisor):

Inclina is a motorcycle lean-angle meter. All content is bundled in the app (no remote web content). It reads the device gyroscope and accelerometer (CoreMotion via the web view, NSMotionUsageDescription) and GPS speed (NSLocationWhenInUseUsageDescription) to compute the lean angle, and stores ride data locally. There are no accounts, no servers and no network requests.

To test without a motorcycle: open Settings (bottom tab "Ajustes") and tap "Salida simulada" (simulated ride). The app will play a 40-second synthetic ride showing live lean angle, speed and corner detection, then open the ride summary with the corner list, CSV export and share. To test real sensors: tap "Cero" to calibrate (hold the phone still for 2 s), then tilt the phone left/right; the angle updates live.

The app is in Spanish. Location is used only for speed while a ride is running, in the foreground.

- Credenciales de prueba: no se necesitan (marca "no requiere inicio de sesión").
- Contacto: tu nombre, teléfono y correo.

## Novedades de la versión
Primera versión.
EN: First release.
