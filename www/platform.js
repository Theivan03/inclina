/* Inclina — capa de plataforma.
   El mismo código corre como PWA en el navegador y empaquetado con Capacitor en Android/iOS.
   Cuando hay Capacitor nativo se usan sus plugins (GPS, pantalla encendida, compartir archivos);
   si no, las APIs del navegador. Nada del resto de la app sabe en qué plataforma está. */
var Platform = (function () {
  var C = window.Capacitor;
  var native = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  var P = native ? (C.Plugins || {}) : {};
  var os = native ? C.getPlatform() : 'web';
  function has(name) { return native && !!P[name]; }

  /* --- GPS: devuelve una función para parar el seguimiento --- */
  function watchPosition(onFix, onError) {
    var opts = { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 };
    if (has('Geolocation')) {
      var id = null, stopped = false;
      P.Geolocation.requestPermissions({ permissions: ['location'] }).then(function (st) {
        var s = st && (st.location || st.coarseLocation);
        if (s === 'denied') { onError({ code: 1, message: 'denied' }); return; }
        // Sin el envoltorio JS del plugin, watchPosition devuelve el id de callback directamente (no una promesa).
        return Promise.resolve(P.Geolocation.watchPosition(opts, function (pos, err) {
          if (err) onError({ code: /denied|permission/i.test(err.message || '') ? 1 : 2, message: err.message });
          else if (pos) onFix(pos);
        })).then(function (cid) { id = cid; if (stopped) P.Geolocation.clearWatch({ id: cid }); });
      }).catch(function (e) { onError({ code: 2, message: String(e) }); });
      return function () { stopped = true; if (id != null) P.Geolocation.clearWatch({ id: id }); };
    }
    if (!('geolocation' in navigator)) { onError({ code: 0, message: 'unsupported' }); return function () {}; }
    var w = navigator.geolocation.watchPosition(onFix, onError, opts);
    return function () { navigator.geolocation.clearWatch(w); };
  }

  /* --- pantalla encendida --- */
  var wakeLock = null, keptAwake = false, wakeListeners = [];
  function notifyWake() { wakeListeners.forEach(function (f) { f(isAwake()); }); }
  function isAwake() { return has('KeepAwake') ? keptAwake : !!wakeLock; }
  function keepAwake(on) {
    if (has('KeepAwake')) {
      return (on ? P.KeepAwake.keepAwake() : P.KeepAwake.allowSleep()).then(function () { keptAwake = !!on; notifyWake(); }, function () { keptAwake = false; notifyWake(); });
    }
    if (!('wakeLock' in navigator)) return Promise.resolve();
    if (!on) { if (wakeLock) { try { wakeLock.release(); } catch (e) {} } wakeLock = null; notifyWake(); return Promise.resolve(); }
    return navigator.wakeLock.request('screen').then(function (l) {
      wakeLock = l; l.addEventListener('release', function () { wakeLock = null; notifyWake(); }); notifyWake();
    }, function () { wakeLock = null; notifyWake(); });
  }
  function onWakeChange(f) { wakeListeners.push(f); }

  /* --- exportar / compartir un CSV --- */
  function canShare() { return has('Share') || !!(navigator.share && navigator.canShare); }
  function shareCsv(name, text, title) {
    if (has('Filesystem') && has('Share')) {
      return P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
        .then(function (r) { return P.Share.share({ title: title, dialogTitle: title, files: [r.uri] }); });
    }
    if (navigator.share && navigator.canShare) {
      var file = new File([text], name, { type: 'text/csv' }), data = { files: [file], title: title };
      if (navigator.canShare(data)) return navigator.share(data);
      return navigator.share({ title: title, text: text.slice(0, 2000) });
    }
    return Promise.reject(new Error('share unsupported'));
  }
  function downloadCsv(name, text, title) {
    if (native) return shareCsv(name, text, title); // en la app no hay "descargas": se elige destino al compartir
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
    return Promise.resolve();
  }

  /* --- GPS en segundo plano (plugin BackgroundGeolocation, app Android/iOS). Devuelve función para parar. ---
     Con la app en segundo plano o la pantalla apagada sigue llegando posición gracias a un servicio
     con notificación. En la web usa watchPosition normal. */
  function hasBackgroundGps() { return has('BackgroundGeolocation'); }
  function watchPositionBackground(onFix, onError, opts) {
    if (!has('BackgroundGeolocation')) return watchPosition(onFix, onError);
    if (has('Motion') && P.Motion.ensureNotificationPermission) { try { P.Motion.ensureNotificationPermission(); } catch (e) {} }
    var id = null, stopped = false;
    var o = { backgroundTitle: (opts && opts.title) || 'Inclina está grabando tu ruta', backgroundMessage: (opts && opts.message) || 'Toca Parar en la app cuando acabes.',
      requestPermissions: true, stale: false, distanceFilter: 0 };
    Promise.resolve(P.BackgroundGeolocation.addWatcher(o, function (loc, err) {
      if (err) { onError({ code: err.code === 'NOT_AUTHORIZED' ? 1 : 2, message: err.message || String(err) }); return; }
      if (!loc) return;
      onFix({ coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, altitude: loc.altitude, altitudeAccuracy: loc.altitudeAccuracy, heading: loc.bearing, speed: loc.speed }, timestamp: loc.time || Date.now() });
    })).then(function (wid) { id = wid; if (stopped) P.BackgroundGeolocation.removeWatcher({ id: wid }); }).catch(function (e) { onError({ code: 2, message: String(e) }); });
    return function () { stopped = true; if (id != null) { try { P.BackgroundGeolocation.removeWatcher({ id: id }); } catch (e) {} } };
  }
  function openLocationSettings() { if (has('BackgroundGeolocation')) { try { P.BackgroundGeolocation.openSettings(); } catch (e) {} } }

  /* --- voz (TTS nativo en la app; speechSynthesis en el navegador) --- */
  function canSpeak() { return has('TextToSpeech') || !!window.speechSynthesis; }
  function speak(text) {
    if (has('TextToSpeech')) { return P.TextToSpeech.speak({ text: text, lang: 'es-ES', rate: 1.05, pitch: 1, volume: 1, category: 'ambient' }).catch(function () {}); }
    if (window.speechSynthesis) {
      try { var u = new SpeechSynthesisUtterance(text); u.lang = 'es-ES'; u.rate = 1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) {}
    }
    return Promise.resolve();
  }

  /* --- compartir / guardar una imagen PNG (data URL) --- */
  function sharePng(name, dataUrl, title) {
    if (has('Filesystem') && has('Share')) {
      var b64 = dataUrl.split(',')[1];
      return P.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' })
        .then(function (r) { return P.Share.share({ title: title, dialogTitle: title, files: [r.uri] }); });
    }
    return fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      var file = new File([blob], name, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: title });
      var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
    });
  }
  function openExternal(url) {
    if (native) { try { window.open(url, '_system'); return; } catch (e) {} }
    window.open(url, '_blank', 'noopener');
  }

  /* --- sensores de movimiento nativos (plugin Motion, solo en la app Android) ---
     onBatch recibe { samples: [[ax,ay,az,gx,gy,gz,tMs], ...], hz }. Devuelve una función para parar, o null si no hay plugin. */
  function hasNativeMotion() { return has('Motion'); }
  function startNativeMotion(onBatch, hz) {
    if (!has('Motion')) return null;
    var handle = P.Motion.addListener('batch', function (data) { if (data && data.samples) onBatch(data); });
    P.Motion.start({ hz: hz || 200 }).catch(function () {});
    return function () {
      try { P.Motion.stop(); } catch (e) {}
      try { Promise.resolve(handle).then(function (h) { if (h && h.remove) h.remove(); }); } catch (e) {}
    };
  }

  /* --- botón atrás de Android --- */
  function onBack(handler) {
    if (!has('App')) return;
    P.App.addListener('backButton', function () {
      var handled = handler();
      if (!handled) P.App.minimizeApp();
    });
  }

  /* --- arranque --- */
  function ready() { if (has('SplashScreen')) { try { P.SplashScreen.hide(); } catch (e) {} } }

  return { native: native, os: os, watchPosition: watchPosition, keepAwake: keepAwake, isAwake: isAwake, onWakeChange: onWakeChange,
    canShare: canShare, shareCsv: shareCsv, downloadCsv: downloadCsv, onBack: onBack, ready: ready,
    hasNativeMotion: hasNativeMotion, startNativeMotion: startNativeMotion,
    hasBackgroundGps: hasBackgroundGps, watchPositionBackground: watchPositionBackground, openLocationSettings: openLocationSettings,
    canSpeak: canSpeak, speak: speak, sharePng: sharePng, openExternal: openExternal };
})();
