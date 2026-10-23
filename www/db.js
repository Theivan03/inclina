/* Inclina — almacenamiento local en IndexedDB.
   Almacenes: rides (metadatos de cada ruta), tracks (puntos GPS por ruta), photos (fotos por ruta),
   vehicles (garaje), kv (ajustes y varios). Todo queda en el teléfono.
   Migra automáticamente las salidas guardadas en localStorage por las versiones anteriores. */
var DB = (function () {
  var NAME = 'inclina', VERSION = 1, db = null, opening = null;

  function open() {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB no disponible')); return; }
      var req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('rides')) { var r = d.createObjectStore('rides', { keyPath: 'id' }); r.createIndex('start', 'start'); }
        if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'rideId' });
        if (!d.objectStoreNames.contains('photos')) { var p = d.createObjectStore('photos', { keyPath: 'id' }); p.createIndex('rideId', 'rideId'); }
        if (!d.objectStoreNames.contains('vehicles')) d.createObjectStore('vehicles', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = function () { db = req.result; db.onversionchange = function () { db.close(); db = null; }; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
    return opening;
  }
  function tx(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        try { out = fn(s); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }
  function reqResult(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode), r = fn(t.objectStore(store));
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  var api = {
    open: open,
    // rutas
    allRides: function () { return reqResult('rides', 'readonly', function (s) { return s.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return y.start - x.start; }); }); },
    getRide: function (id) { return reqResult('rides', 'readonly', function (s) { return s.get(id); }); },
    putRide: function (r) { return tx('rides', 'readwrite', function (s) { s.put(r); }); },
    deleteRide: function (id) {
      return tx('rides', 'readwrite', function (s) { s.delete(id); })
        .then(function () { return tx('tracks', 'readwrite', function (s) { s.delete(id); }); })
        .then(function () { return api.photosOf(id); })
        .then(function (ps) { return tx('photos', 'readwrite', function (s) { ps.forEach(function (p) { s.delete(p.id); }); }); });
    },
    // trazados
    getTrack: function (rideId) { return reqResult('tracks', 'readonly', function (s) { return s.get(rideId); }).then(function (t) { return t ? t.points : []; }); },
    putTrack: function (rideId, points) { return tx('tracks', 'readwrite', function (s) { s.put({ rideId: rideId, points: points }); }); },
    // fotos
    photosOf: function (rideId) { return reqResult('photos', 'readonly', function (s) { return s.index('rideId').getAll(rideId); }).then(function (a) { return a || []; }); },
    putPhoto: function (p) { return tx('photos', 'readwrite', function (s) { s.put(p); }); },
    deletePhoto: function (id) { return tx('photos', 'readwrite', function (s) { s.delete(id); }); },
    // garaje
    allVehicles: function () { return reqResult('vehicles', 'readonly', function (s) { return s.getAll(); }).then(function (a) { return a || []; }); },
    putVehicle: function (v) { return tx('vehicles', 'readwrite', function (s) { s.put(v); }); },
    deleteVehicle: function (id) { return tx('vehicles', 'readwrite', function (s) { s.delete(id); }); },
    // clave-valor
    get: function (k, d) { return reqResult('kv', 'readonly', function (s) { return s.get(k); }).then(function (r) { return r ? r.v : d; }).catch(function () { return d; }); },
    set: function (k, v) { return tx('kv', 'readwrite', function (s) { s.put({ k: k, v: v }); }); },
    del: function (k) { return tx('kv', 'readwrite', function (s) { s.delete(k); }); },
    // borrar todo
    wipe: function () {
      return Promise.all(['rides', 'tracks', 'photos', 'vehicles', 'kv'].map(function (st) { return tx(st, 'readwrite', function (s) { s.clear(); }); }));
    },
    /* Migración desde localStorage (salidas de la v1.x, sin trazado). */
    migrateFromLocalStorage: function () {
      var old;
      try { old = JSON.parse(localStorage.getItem('inclina.rides') || 'null'); } catch (e) { old = null; }
      if (!old || !old.length) return Promise.resolve(0);
      return api.allRides().then(function (existing) {
        var have = {}; existing.forEach(function (r) { have[r.id] = 1; });
        var todo = old.filter(function (r) { return r && r.id && !have[r.id]; });
        return Promise.all(todo.map(function (r) {
          r.legacy = true; r.corners = r.corners || [];
          return api.putRide(r);
        })).then(function () { try { localStorage.removeItem('inclina.rides'); } catch (e) {} return todo.length; });
      });
    },
    estimateUsage: function () {
      if (!(navigator.storage && navigator.storage.estimate)) return Promise.resolve(null);
      return navigator.storage.estimate().then(function (e) { return { used: e.usage || 0, quota: e.quota || 0 }; }).catch(function () { return null; });
    }
  };
  return api;
})();
