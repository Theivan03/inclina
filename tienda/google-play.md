# Ficha de Google Play — Inclina

Copia y pega campo por campo en Play Console → Crecimiento → Ficha de Play Store principal.
Los límites de caracteres están entre paréntesis. Las versiones en inglés van en la ficha en
inglés (Añadir traducción → English (United States)); el idioma predeterminado puede ser español.

## Nombre de la app (30)
Inclina: inclinómetro de moto

EN: Inclina: Motorcycle Lean Angle

## Descripción breve (80)
Ángulo de inclinación en vivo, máximos por curva e histórico. Sin anuncios.

EN: Live lean angle, per-corner maximums and ride history. No ads, no account.

## Descripción completa (4000)
Inclina mide cuánto inclinas la moto en cada curva y te lo cuenta sin adornos: el ángulo en vivo, los máximos a izquierda y derecha de la salida, y una lista de cada curva con su ángulo máximo, su velocidad y su duración.

Está pensada para una cosa: calibrar lo que sientes contra lo que de verdad inclinas. La mayoría de los motoristas se sorprenden al comparar los dos números.

CÓMO FUNCIONA
Usa el giróscopo y el acelerómetro del teléfono, y la velocidad del GPS. En vez de limitarse al acelerómetro (que en una curva mantenida marca casi 0°, porque la "gravedad aparente" se alinea con la moto), Inclina integra el giróscopo y corrige la deriva con la física de la curva: velocidad por velocidad de giro. El resultado se mantiene estable en curvas largas y vuelve a cero en recta.

QUÉ INCLUYE
• Pantalla de marcha con el ángulo en grande, el arco de inclinación y las marcas de máximo de cada lado.
• Velocidad GPS, cronómetro, distancia y contador de curvas.
• Pantalla siempre encendida mientras ruedas.
• Lista de curvas de cada salida: ángulo máximo, lado, velocidad y duración.
• Histórico de salidas en el teléfono.
• Exportar a CSV (una salida o todas) y compartir por cualquier app.
• Tema día (alto contraste para el sol) y noche (ámbar sobre fondo oscuro).
• Calibración en 2 segundos: vale en vertical o apaisado, con cualquier inclinación del soporte.
• Salida simulada para ver cómo funciona sin subirte a la moto.

LO QUE NO HACE
Sin anuncios, sin cuenta, sin suscripción, sin servidores. Todos los datos se quedan en tu teléfono. La ubicación se usa solo mientras hay una salida en marcha, para la velocidad; no se guarda el recorrido.

PRECISIÓN
La de un teléfono bien sujeto al soporte: unos 3-5°. Suficiente para aprender; no es un instrumento de laboratorio.

SEGURIDAD
El número en vivo no es para mirarlo en plena curva. Mira el máximo al salir de ella y el resumen al acabar. Conduce con atención; la app no sustituye tu criterio.

EN:
Inclina measures how far you lean the bike in every corner and tells you plainly: the live angle, the ride's left and right maximums, and a list of every corner with its peak angle, speed and duration.

It is built for one thing: calibrating what you feel against what you actually lean. Most riders are surprised when they compare the two numbers.

HOW IT WORKS
It uses the phone's gyroscope and accelerometer plus GPS speed. Instead of relying on the accelerometer alone (which reads close to 0° in a sustained corner, because apparent gravity aligns with the bike), Inclina integrates the gyroscope and corrects drift with cornering physics: speed times yaw rate. The result stays stable in long corners and returns to zero on the straights.

WHAT'S INCLUDED
• Ride screen with a large angle readout, lean arc and max markers for each side.
• GPS speed, timer, distance and corner counter.
• Screen stays on while riding.
• Per-ride corner list: peak angle, side, speed and duration.
• Ride history stored on the phone.
• CSV export (one ride or all) and sharing through any app.
• Day theme (high contrast for sunlight) and night theme (amber on dark).
• 2-second calibration: works in portrait or landscape, at any mount tilt.
• Simulated ride to see how it works without getting on the bike.

WHAT IT DOESN'T DO
No ads, no account, no subscription, no servers. All data stays on your phone. Location is used only while a ride is running, for speed; the route is not stored.

ACCURACY
That of a phone firmly mounted: about 3-5°. Enough to learn from; not a lab instrument.

SAFETY
The live number is not for reading mid-corner. Check the maximum on exit and the summary when you stop. Ride attentively; the app does not replace your judgement.

## Recursos gráficos
- Icono: 512 × 512 PNG, sin transparencia → `tienda/graficos/icono-512.png`
- Gráfico de portada (obligatorio): 1024 × 500 PNG → `tienda/graficos/portada-1024x500.png`
- Capturas de teléfono (mínimo 2, máximo 8, relación 9:16) → `tienda/capturas/android-*.png` (1080 × 2400)
- Vídeo: opcional, no lo pongas.

## Categoría y contacto
- Tipo: Aplicación · Categoría: Herramientas (alternativa: Coches y vehículos)
- Correo de contacto: el mismo que pongas en la política de privacidad
- Política de privacidad: la URL donde alojes `tienda/privacidad.html` (obligatoria porque la app pide ubicación)

## Contenido de la app (Play Console → Política → Contenido de la app)
Rellena cada apartado así:

**Política de privacidad**: la URL.

**Anuncios**: No, mi app no contiene anuncios.

**Acceso a la app**: Todas las funciones están disponibles sin restricciones (no hay login).

**Clasificación de contenido** (cuestionario IARC): categoría "Utilidad, productividad, comunicación u otros". Responde No a todo (violencia, sexo, lenguaje, drogas, juego, interacción entre usuarios, compartir ubicación con otros usuarios, compras). Resultado esperado: PEGI 3 / Para todos.

**Público objetivo y contenido**: grupo de edad 18 y más. No está dirigida a niños.

**Aplicación de noticias**: No.

**Aplicaciones de rastreo de contactos y estado de COVID-19**: No.

**Seguridad de los datos** (Data safety): esta es la parte que más dudas genera. Google define "recoger" como enviar datos fuera del dispositivo. Inclina no envía nada, así que:
- ¿Tu app recoge o comparte alguno de los tipos de datos de usuario obligatorios? → **No**.
- Resultado: la ficha mostrará "No se recogen datos" y "No se comparten datos con terceros".
- Aun así, en la sección de prácticas de seguridad marca: los datos se pueden borrar desde la app (Ajustes → Borrar todos los datos).
- Si el formulario pregunta por la ubicación por ver el permiso en el manifiesto: se procesa de forma efímera, solo en el dispositivo, no se transmite. Eso no cuenta como recogida.

**Servicios financieros, Salud, Gobierno**: No.

**Permisos sensibles**: la app pide ubicación precisa y, durante la grabación, mantiene un servicio en primer plano de tipo "location" con notificación (FOREGROUND_SERVICE_LOCATION). No declara ACCESS_BACKGROUND_LOCATION, así que el formulario de "ubicación en segundo plano" no aplica; si Play lo pregunta, explica que la grabación de rutas usa un servicio en primer plano iniciado por el usuario y visible en la barra de notificaciones.

## Notas de la versión (500)
Primera versión: ángulo de inclinación en vivo, máximos por curva y por salida, histórico y exportación CSV.

EN: First release: live lean angle, per-corner and per-ride maximums, history and CSV export.
