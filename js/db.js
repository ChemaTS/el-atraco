// ======================================================
// Capa de datos: Firebase (real) o modo local (?local=1)
// El modo local sincroniza pestañas del mismo navegador
// y sirve para probar sin conexión.
// API: init, get, set, update, onDoc, onCol, inc, union, uid
// Rutas tipo "games/ABCDE/bands/roja"
// ======================================================
import { FIREBASE, FIRESTORE_DB } from "./config.js";

const LOCAL = new URLSearchParams(location.search).has("local");
export const DB = { local: LOCAL, uid: null };

/* ---------------- centinelas ---------------- */
const INC = "__inc__", UNI = "__union__";
DB.inc = (n) => (LOCAL ? { [INC]: n } : fs.increment(n));
DB.union = (v) => (LOCAL ? { [UNI]: v } : fs.arrayUnion(v));

let fs = null, fdb = null;

/* ---------------- Firebase ---------------- */
async function initFirebase() {
  const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [{ initializeApp }, auth, fstore] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-auth.js"),
    import(base + "firebase-firestore.js"),
  ]);
  fs = fstore;
  const app = initializeApp(FIREBASE);
  fdb = fstore.getFirestore(app, FIRESTORE_DB);
  const a = auth.getAuth(app);
  await new Promise((res, rej) => {
    const stop = auth.onAuthStateChanged(a, (u) => { if (u) { DB.uid = u.uid; stop(); res(); } });
    auth.signInAnonymously(a).catch(rej);
  });
  const ref = (p) => fstore.doc(fdb, p);
  DB.get = async (p) => { const s = await fstore.getDoc(ref(p)); return s.exists() ? s.data() : null; };
  DB.set = (p, d, merge = false) => fstore.setDoc(ref(p), d, { merge });
  DB.update = (p, d) => fstore.updateDoc(ref(p), d);
  DB.onDoc = (p, cb) => fstore.onSnapshot(ref(p), (s) => cb(s.exists() ? s.data() : null), (e) => DB.onError(e));
  DB.onCol = (p, cb) => fstore.onSnapshot(fstore.collection(fdb, p), (qs) => {
    const out = {}; qs.forEach((d) => (out[d.id] = d.data())); cb(out);
  }, (e) => DB.onError(e));
}

/* ---------------- Local ---------------- */
function initLocal() {
  // un documento = una clave de localStorage (evita pisar documentos de otras pestañas)
  const PFX = "atraco_doc:";
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("atraco_local") : null;
  const subs = new Set();
  const read = (p) => { try { return JSON.parse(localStorage.getItem(PFX + p) || "null"); } catch { return null; } };
  const write = (p, v) => localStorage.setItem(PFX + p, JSON.stringify(v));
  const fire = () => subs.forEach((f) => f());
  bc && (bc.onmessage = fire);
  window.addEventListener("storage", (e) => e.key && e.key.startsWith(PFX) && fire());
  const notify = () => { fire(); bc && bc.postMessage(1); };
  const apply = (obj, k, v) => {
    const parts = k.split("."); let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === "object" ? o[parts[i]] : {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (v && typeof v === "object" && INC in v) o[last] = (o[last] || 0) + v[INC];
    else if (v && typeof v === "object" && UNI in v) { const arr = Array.isArray(o[last]) ? o[last] : []; const s = JSON.stringify(v[UNI]); if (!arr.some((x) => JSON.stringify(x) === s)) arr.push(v[UNI]); o[last] = arr; }
    else o[last] = v;
  };
  // cada pestaña es un "alumno" distinto (uid por pestaña, sobrevive a recargas)
  const uid = sessionStorage.getItem("uid") || "u" + Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem("uid", uid);
  DB.uid = uid;
  DB.get = async (p) => read(p);
  DB.set = async (p, d, merge = false) => { const base = merge ? read(p) || {} : {}; Object.entries(d).forEach(([k, v]) => apply(base, k, v)); write(p, base); notify(); };
  DB.update = async (p, d) => { const o = read(p); if (!o) throw new Error("No existe " + p); Object.entries(d).forEach(([k, v]) => apply(o, k, v)); write(p, o); notify(); };
  DB.onDoc = (p, cb) => { let last; const f = () => { const v = localStorage.getItem(PFX + p) || "null"; if (v !== last) { last = v; cb(JSON.parse(v)); } }; subs.add(f); f(); return () => subs.delete(f); };
  DB.onCol = (p, cb) => { let last; const f = () => { const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k.startsWith(PFX + p + "/")) continue; const id = k.slice(PFX.length + p.length + 1); if (!id.includes("/")) out[id] = read(p + "/" + id); } const v = JSON.stringify(out); if (v !== last) { last = v; cb(JSON.parse(v)); } }; subs.add(f); f(); return () => subs.delete(f); };
}

DB.onError = (e) => console.error(e);
DB.init = async () => { if (LOCAL) initLocal(); else await initFirebase(); return DB.uid; };
