// ======================================================
// EL ATRACO · arranque y rutas (#/, #/jugar, #/proyector, #/profe)
// ======================================================
import { DB } from "./db.js";
import { $, esc } from "./core.js";
import * as Jugar from "./jugar.js";
import * as Proyector from "./proyector.js";
import * as Profe from "./profe.js";

const app = $("#app");
let current = null;

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [name, ...args] = h.split("/");
  if (current?.leave) current.leave();
  document.body.classList.toggle("proj", name === "proyector");
  $("#nav").innerHTML = [["jugar", "Jugar"], ["proyector", "Proyector"], ["profe", "Modo profesor"]]
    .map(([k, t]) => `<a href="#/${k}"${k === name ? ' class="on"' : ""}>${t}</a>`).join("");
  current = { jugar: Jugar, proyector: Proyector, profe: Profe }[name] || null;
  if (current) current.enter(app, args);
  else app.innerHTML = `<h1>El Atraco</h1><p class="lead">Escape room de fuentes multimedia. Elige pantalla.</p>
    <div class="menu">
      <a class="mcard" href="#/jugar"><span class="n">1</span><b>Jugar</b><small>Cada alumno en su ordenador</small></a>
      <a class="mcard" href="#/proyector"><span class="n">2</span><b>Proyector</b><small>Pantalla grande del aula</small></a>
      <a class="mcard" href="#/profe"><span class="n">3</span><b>Modo profesor</b><small>Crear y dirigir la partida</small></a>
    </div>${DB.local ? '<p class="lead">Modo local (sin Firebase): sincroniza solo pestañas de este navegador.</p>' : ""}`;
}

DB.init()
  .then(() => { window.addEventListener("hashchange", route); route(); })
  .catch((e) => { app.innerHTML = `<div class="err">No se pudo conectar con Firebase:\n${esc(e.message || e)}</div><p class="lead">Comprueba la conexión. Para probar sin Firebase, abre la página con <b>?local=1</b> al final de la dirección.</p>`; console.error(e); });
