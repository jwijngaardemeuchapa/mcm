// Bancada de medição: NADA sai da máquina (Firestore, Central, Umbler...). Só localhost.
(function () {
  var ok = function (u) { try { var h = new URL(String(u), location.href).hostname; return h === "127.0.0.1" || h === "localhost"; } catch (e) { return false; } };
  var f = window.fetch;
  window.fetch = function (u, o) {
    var url = typeof u === "string" ? u : (u && u.url) || String(u);
    if (!ok(url)) return Promise.reject(new TypeError("bloqueado pela bancada: " + url));
    return f.call(window, u, o);
  };
  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { if (!ok(u)) { this.__bloq = true; } return xo.apply(this, arguments); };
  var xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { if (this.__bloq) { var self = this; setTimeout(function () { self.dispatchEvent(new Event("error")); }, 0); return; } return xs.apply(this, arguments); };
  var WS = window.WebSocket;
  window.WebSocket = function (u, p) { if (!ok(u)) throw new Error("ws bloqueado pela bancada: " + u); return new WS(u, p); };
  window.WebSocket.prototype = WS.prototype;
  window.__bancada = true;
})();
// profiler de arranque (bancada): começa antes de qualquer script do app
try { window.__profBoot = new Profiler({ sampleInterval: 10, maxBufferSize: 800000 }); window.__profBootT0 = performance.now(); } catch (e) { window.__profBootErr = String(e); }
