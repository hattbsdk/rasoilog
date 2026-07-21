import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, X, ChevronLeft, ChevronRight, Copy, Check, Pencil,
  BookOpen, BarChart3, Search, Target, Download, MessageCircle,
  CalendarDays, Mic, Upload, Home, Cloud, RefreshCw,
} from "lucide-react";
import { NEW_INGREDIENTS, NEW_DISHES, USER_SNAPSHOT } from "./seedData.js";

const SpeechAPI = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

/* ---------- constants & helpers ---------- */

const KEY = "rasoilog-v2";
const SYNC_KEY = "rasoilog-sync-code";
const SYNC_BASE = "https://rasoilog-sync.ramitseth17.workers.dev"; // replaced at build time with the sync server URL
const INK = "#1B3A2D";
const LEAF = "#2E7D5B";
const DATA_V = 5; // bump when new seed items ship; they merge in without touching user data

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r1 = (n) => Math.round(n * 10) / 10;
const r0 = (n) => Math.round(n);
const fmtK = (n) => r0(n).toLocaleString("en-IN");

const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayAt = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d; };
const fmtDay = (d) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const fmtShort = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* merge seed rows into an ingredient list without overwriting anything the user has */
const mergeSeeds = (ingredients, rows) => {
  const have = new Set(ingredients.map((i) => i.name.trim().toLowerCase()));
  const add = rows
    .filter(([name]) => !have.has(name.trim().toLowerCase()))
    .map(([name, unit, cal, protein, fibre]) => ({ id: uid(), name, unit, cal, protein, fibre }));
  return [...ingredients, ...add];
};

const migrate = (d) => {
  let out = { ...d };
  if ((out.seedV || 1) < DATA_V) {
    out.ingredients = mergeSeeds(out.ingredients || [], [...NEW_INGREDIENTS, ...NEW_DISHES]);
    out.seedV = DATA_V;
  }
  return out;
};

const freshData = () => migrate(JSON.parse(JSON.stringify(USER_SNAPSHOT)));

const loadData = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* corrupted or unavailable */ }
  return freshData();
};

/* ---- cloud sync: merge two datasets without losing anything ---- */
const mergeData = (loc, rem) => {
  if (!rem || !rem.ingredients) return loc;
  const del = [...new Set([...(loc.del || []), ...(rem.del || [])])].slice(-1000);
  const dset = new Set(del);
  const byId = (arr) => { const m = new Map(); arr.forEach((x) => m.set(x.id, x)); return m; };
  const unionById = (a, b) => {
    const m = byId(b); byId(a).forEach((v, k) => m.set(k, v));
    return [...m.values()].filter((x) => !dset.has(x.id));
  };
  const logs = {};
  const days = new Set([...Object.keys(loc.logs || {}), ...Object.keys(rem.logs || {})]);
  days.forEach((d) => {
    const merged = unionById(loc.logs?.[d] || [], rem.logs?.[d] || []).sort((x, y) => x.ts - y.ts);
    if (merged.length) logs[d] = merged;
  });
  const newer = (loc.mt || 0) >= (rem.mt || 0) ? loc : rem;
  return {
    ingredients: unionById(loc.ingredients || [], rem.ingredients || []),
    meals: unionById(loc.meals || [], rem.meals || []),
    logs,
    targets: newer.targets || loc.targets,
    hint: false,
    seedV: Math.max(loc.seedV || 1, rem.seedV || 1),
    del,
    mt: Math.max(loc.mt || 0, rem.mt || 0),
  };
};

const macrosFor = (ing, qty) => {
  const f = ing.unit === "pc" ? qty : qty / 100;
  return { cal: ing.cal * f, protein: ing.protein * f, fibre: ing.fibre * f };
};

const totalsOf = (entries) =>
  entries.reduce((a, e) => ({ cal: a.cal + e.cal, protein: a.protein + e.protein, fibre: a.fibre + e.fibre }),
    { cal: 0, protein: 0, fibre: 0 });

const unitLabel = (u) => (u === "pc" ? "per piece" : "per 100 g");

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); return true;
    } catch { return false; }
  }
}

const downloadFile = (name, text, type) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ---------- small stable components ---------- */

/* Bottom sheet sized to the VISUAL viewport (--vvh) so the keyboard can
   never hide the footer button or live results. Content scrolls inside. */
const Sheet = ({ title, onClose, children, footer }) => (
  <div className="fixed inset-x-0 top-0 z-40 flex items-end justify-center bg-black/40"
    style={{ height: "var(--vvh, 100dvh)" }} onClick={onClose}>
    <div className="flex w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl"
      style={{ maxHeight: "calc(var(--vvh, 100dvh) - 16px)" }} onClick={(e) => e.stopPropagation()}
      onFocusCapture={(e) => {
        const el = e.target;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
          setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }, 150);
        }
      }}>
      <div className="flex flex-none items-center justify-between px-5 pb-1 pt-4">
        <button onClick={onClose} className="-ml-2 flex items-center gap-0.5 p-2 text-stone-400" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-stone-800">{title}</h2>
        <button onClick={onClose} className="-mr-2 p-2 text-stone-400" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
      {footer && <div className="flex-none border-t border-stone-100 px-5 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>{footer}</div>}
    </div>
  </div>
);

const Field = ({ label, hint, ...props }) => (
  <label className="block">
    <span className="text-xs font-medium text-stone-500">
      {label}{hint ? <span className="font-normal text-stone-400"> · {hint}</span> : null}
    </span>
    <input {...props} className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-800 focus:border-emerald-600 focus:outline-none" />
  </label>
);

const PrimaryBtn = ({ children, disabled, onClick }) => (
  <button onClick={onClick} disabled={disabled}
    className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40"
    style={{ backgroundColor: LEAF }}>
    {children}
  </button>
);

const AddBtn = ({ icon: Icon, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-2xl border border-stone-200 bg-white py-3 text-stone-700 active:bg-stone-50">
    <Icon size={18} style={{ color: LEAF }} />
    <span className="text-xs font-medium">{label}</span>
  </button>
);

const MicButton = ({ onResult, onUnsupported }) => {
  const [listening, setListening] = useState(false);
  const start = () => {
    if (!SpeechAPI) { onUnsupported?.(); return; }
    const rec = new SpeechAPI();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onResult(e.results[0][0].transcript.trim());
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  return (
    <button type="button" onClick={start} aria-label="Dictate"
      className="flex shrink-0 items-center justify-center rounded-xl border px-3"
      style={{ borderColor: listening ? LEAF : "#e7e5e4", backgroundColor: listening ? "#ecfdf5" : "white" }}>
      <Mic size={16} className={listening ? "animate-pulse" : ""} style={{ color: listening ? LEAF : "#78716c" }} />
    </button>
  );
};

const Bar = ({ pct, over }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
    <div className="h-1.5 rounded-full transition-all"
      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: over ? "#C77B2B" : LEAF }} />
  </div>
);

/* ---------- main app ---------- */

export default function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTabRaw] = useState("today");
  const [dayOff, setDayOff] = useState(0);
  const [modal, setModalRaw] = useState(null);
  const [toast, setToast] = useState(null);

  // form states
  const [pickSearch, setPickSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [libSearch, setLibSearch] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [ingForm, setIngForm] = useState({ name: "", unit: "g", cal: "", protein: "", fibre: "" });
  const [ingEditId, setIngEditId] = useState(null);
  const [quick, setQuick] = useState({ name: "", cal: "", protein: "", fibre: "" });
  const [multStr, setMultStr] = useState("1");
  const [mealForm, setMealForm] = useState({ name: "", items: [] });
  const [mealPickOpen, setMealPickOpen] = useState(false);
  const [mealPickSearch, setMealPickSearch] = useState("");
  const [targetsForm, setTargetsForm] = useState({ cal: "", protein: "", fibre: "" });
  const [reportDetail, setReportDetail] = useState("full");
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState(null);

  // sync state
  const [syncCode, setSyncCode] = useState(() => { try { return localStorage.getItem(SYNC_KEY) || ""; } catch { return ""; } });
  const [syncInput, setSyncInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const modalRef = useRef(modal);
  modalRef.current = modal;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const fileRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const syncTimer = useRef(null);
  const syncCodeRef = useRef(syncCode);
  syncCodeRef.current = syncCode;

  /* ----- browser back button: closes sheets, then returns Home ----- */

  const setModal = (m) => {
    if (m && !modalRef.current) history.pushState({ sheet: true, tab: tabRef.current }, "");
    setModalRaw(m);
  };
  const closeModal = () => {
    if (modalRef.current && history.state?.sheet) history.back();
    else setModalRaw(null);
  };
  const setTab = (id) => {
    setConfirmReset(false);
    setConfirmDelId(null);
    if (id === tabRef.current) return;
    if (id === "today") {
      if (history.state?.tab && !history.state?.sheet) { history.back(); return; }
    } else if (history.state?.tab) {
      history.replaceState({ tab: id }, "");
    } else {
      history.pushState({ tab: id }, "");
    }
    setTabRaw(id);
  };

  useEffect(() => {
    const onPop = (e) => {
      if (modalRef.current) { setModalRaw(null); return; }
      setTabRaw(e.state?.tab || "today");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ----- visual viewport → --vvh (keyboard-safe sheets) ----- */

  useEffect(() => {
    const vv = window.visualViewport;
    const set = () => {
      const s = document.documentElement.style;
      s.setProperty("--vvh", (vv ? vv.height : window.innerHeight) + "px");
      s.setProperty("--vvo", (vv ? vv.offsetTop : 0) + "px");
    };
    set();
    if (vv) { vv.addEventListener("resize", set); vv.addEventListener("scroll", set); }
    window.addEventListener("resize", set);
    return () => {
      if (vv) { vv.removeEventListener("resize", set); vv.removeEventListener("scroll", set); }
      window.removeEventListener("resize", set);
    };
  }, []);

  /* ----- cloud sync ----- */

  const saveLocal = (next) => {
    setData(next);
    dataRef.current = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* full */ }
  };

  const doSync = async (code, { silent } = {}) => {
    const c = code || syncCodeRef.current;
    if (!c || !SYNC_BASE.startsWith("http")) return;
    setSyncing(true);
    try {
      const r = await fetch(`${SYNC_BASE}/sync/${c}`, { cache: "no-store" });
      const remote = r.ok ? await r.json() : null;
      const merged = mergeData(dataRef.current, remote);
      saveLocal(merged);
      if (JSON.stringify(merged) !== JSON.stringify(remote)) {
        await fetch(`${SYNC_BASE}/sync/${c}`, { method: "PUT", body: JSON.stringify(merged) });
      }
      setLastSync(Date.now());
      if (!silent) setToast("Synced");
    } catch {
      if (!silent) setToast("Sync failed — check connection");
    }
    setSyncing(false);
  };

  const scheduleSync = () => {
    if (!syncCodeRef.current) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => doSync(null, { silent: true }), 2000);
  };

  useEffect(() => {
    if (syncCode) doSync(syncCode, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSync = (code) => {
    const c = code.trim().toLowerCase();
    if (c.length < 6) { setToast("Code must be at least 6 characters"); return; }
    try { localStorage.setItem(SYNC_KEY, c); } catch { /* ignore */ }
    setSyncCode(c);
    syncCodeRef.current = c;
    doSync(c);
  };

  const stopSync = () => {
    try { localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ }
    setSyncCode("");
    syncCodeRef.current = "";
    setToast("Sync turned off on this device");
  };

  /* ----- persist ----- */

  const persist = (next) => {
    next = { ...next, mt: Date.now() };
    saveLocal(next);
    scheduleSync();
  };

  useEffect(() => {
    // ensure first-run data (with merged seeds) is written
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  /* ----- derived ----- */

  const viewDate = dayAt(dayOff);
  const vkey = dkey(viewDate);
  const entries = data.logs[vkey] || [];
  const tot = totalsOf(entries);
  const tg = data.targets;

  const mealTotals = (meal, seen = new Set()) => {
    if (seen.has(meal.id)) return { cal: 0, protein: 0, fibre: 0 };
    const nextSeen = new Set(seen).add(meal.id);
    return meal.items.reduce((a, it) => {
      if (it.type === "meal") {
        const sub = data.meals.find((m) => m.id === it.mealId);
        if (!sub) return a;
        const st = mealTotals(sub, nextSeen);
        const mlt = it.qty || 0;
        return { cal: a.cal + st.cal * mlt, protein: a.protein + st.protein * mlt, fibre: a.fibre + st.fibre * mlt };
      }
      const ing = data.ingredients.find((i) => i.id === it.ingId);
      if (!ing) return a;
      const m = macrosFor(ing, it.qty);
      return { cal: a.cal + m.cal, protein: a.protein + m.protein, fibre: a.fibre + m.fibre };
    }, { cal: 0, protein: 0, fibre: 0 });
  };

  const mealDetail = (meal, seen = new Set()) => {
    if (seen.has(meal.id)) return "";
    return meal.items.map((it) => {
      if (it.type === "meal") {
        const sub = data.meals.find((m) => m.id === it.mealId);
        return sub ? `${it.qty}× ${sub.name}` : null;
      }
      const ing = data.ingredients.find((i) => i.id === it.ingId);
      return ing ? `${it.qty} ${ing.unit === "pc" ? "pc" : "g"} ${ing.name}` : null;
    }).filter(Boolean).join(", ");
  };

  /* ----- actions ----- */

  const addEntry = (e) => {
    persist({ ...data, logs: { ...data.logs, [vkey]: [...entries, e] } });
    closeModal();
    setToast("Logged");
  };

  const tomb = (d, id) => ({ ...d, del: [...(d.del || []), id].slice(-1000) });

  const delEntry = (id) =>
    persist(tomb({ ...data, logs: { ...data.logs, [vkey]: entries.filter((e) => e.id !== id) } }, id));

  const logIngredient = (ing) => {
    const q = num(qtyStr);
    if (q <= 0) return;
    const m = macrosFor(ing, q);
    addEntry({
      id: uid(), ts: Date.now(), name: ing.name,
      detail: `${q} ${ing.unit === "pc" ? "pc" : "g"}`,
      cal: r1(m.cal), protein: r1(m.protein), fibre: r1(m.fibre),
    });
  };

  const saveIngredient = () => {
    const f = ingForm;
    if (!f.name.trim()) return;
    const ing = {
      id: ingEditId || uid(), name: f.name.trim(), unit: f.unit,
      cal: num(f.cal), protein: num(f.protein), fibre: num(f.fibre),
    };
    const ingredients = ingEditId
      ? data.ingredients.map((i) => (i.id === ingEditId ? ing : i))
      : [...data.ingredients, ing];
    persist({ ...data, ingredients });
    setToast(ingEditId ? "Ingredient updated" : "Ingredient saved");
    if (modal?.from === "picker" && !ingEditId) { setQtyStr(""); setModalRaw({ t: "qty", ing }); }
    else closeModal();
  };

  const delIngredient = (id) => {
    persist(tomb({ ...data, ingredients: data.ingredients.filter((i) => i.id !== id) }, id));
    setConfirmDelId(null);
    setToast("Deleted");
  };

  const logMeal = (meal) => {
    const mlt = num(multStr) || 1;
    const t = mealTotals(meal);
    addEntry({
      id: uid(), ts: Date.now(),
      name: mlt !== 1 ? `${meal.name} ×${mlt}` : meal.name,
      detail: mealDetail(meal),
      cal: r1(t.cal * mlt), protein: r1(t.protein * mlt), fibre: r1(t.fibre * mlt),
    });
  };

  const saveMeal = () => {
    const items = mealForm.items
      .map((it) => it.type === "meal"
        ? { type: "meal", mealId: it.mealId, qty: num(it.qty) }
        : { type: "ingredient", ingId: it.ingId, qty: num(it.qty) })
      .filter((it) => it.qty > 0);
    if (!mealForm.name.trim() || items.length === 0) return;
    persist({ ...data, meals: [...data.meals, { id: uid(), name: mealForm.name.trim(), items }] });
    closeModal();
    setToast("Meal saved");
  };

  const delMeal = (id) => {
    persist(tomb({ ...data, meals: data.meals.filter((m) => m.id !== id) }, id));
    setConfirmDelId(null);
    setToast("Deleted");
  };

  const saveQuick = () => {
    if (!quick.name.trim()) return;
    addEntry({
      id: uid(), ts: Date.now(), name: quick.name.trim(), detail: "",
      cal: num(quick.cal), protein: num(quick.protein), fibre: num(quick.fibre),
    });
  };

  const saveTargets = () => {
    persist({
      ...data,
      targets: { cal: num(targetsForm.cal), protein: num(targetsForm.protein), fibre: num(targetsForm.fibre) },
    });
    closeModal();
    setToast("Targets updated");
  };

  const resetAll = () => {
    persist(freshData());
    setConfirmReset(false);
    setToast("Fresh start");
  };

  /* ----- report / share / export / backup ----- */

  const buildReport = (detail) => {
    const days = Array.from({ length: 7 }, (_, i) => dayAt(i - 6));
    let out = `NUTRITION LOG — ${fmtShort(days[0])} to ${fmtShort(days[6])} ${days[6].getFullYear()}\n`;
    out += `Daily targets: ${tg.cal} kcal · ${tg.protein} g protein · ${tg.fibre} g fibre\n\n`;
    let sum = { cal: 0, p: 0, f: 0 }, n = 0;
    for (const d of days) {
      const es = data.logs[dkey(d)] || [];
      const t = totalsOf(es);
      if (es.length) { n++; sum.cal += t.cal; sum.p += t.protein; sum.f += t.fibre; }
      out += `${fmtDay(d)} — ${es.length ? `${r0(t.cal)} kcal · ${r1(t.protein)} g P · ${r1(t.fibre)} g F` : "no entries"}\n`;
      if (detail === "full") {
        es.forEach((e) => {
          out += `  • ${e.name}${e.detail ? ` (${e.detail})` : ""} — ${r0(e.cal)} kcal · ${r1(e.protein)} P · ${r1(e.fibre)} F\n`;
        });
      }
    }
    if (n) out += `\nAverage over ${n} logged day${n > 1 ? "s" : ""}: ${r0(sum.cal / n)} kcal · ${r1(sum.p / n)} g protein · ${r1(sum.f / n)} g fibre\n`;
    return out;
  };

  const waShare = (text) =>
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");

  const todayShareText = () =>
    `RasoiLog — ${fmtDay(viewDate)}\n${fmtK(tot.cal)} kcal · ${r1(tot.protein)} g protein · ${r1(tot.fibre)} g fibre (${entries.length} ${entries.length === 1 ? "entry" : "entries"})`;

  const downloadCsv = () => {
    const rows = [["date", "item", "detail", "kcal", "protein_g", "fibre_g"]];
    Object.keys(data.logs).sort().forEach((k) =>
      (data.logs[k] || []).forEach((e) =>
        rows.push([k, e.name, e.detail || "", r0(e.cal), r1(e.protein), r1(e.fibre)])));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadFile("rasoilog.csv", csv, "text/csv");
  };

  const exportBackup = () =>
    downloadFile(`rasoilog-backup-${dkey(new Date())}.json`, JSON.stringify(data, null, 1), "application/json");

  const importBackup = (file) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d.ingredients || !d.logs) throw new Error("bad file");
        persist(migrate(d));
        setToast("Backup restored");
      } catch { setToast("Couldn't read that backup file"); }
    };
    rd.readAsText(file);
  };

  /* ----- shared bits ----- */

  const pct = (v, t) => (t > 0 ? (v / t) * 100 : 0);
  const filteredIngs = (q) => {
    const s = q.trim().toLowerCase();
    return s ? data.ingredients.filter((i) => i.name.toLowerCase().includes(s)) : data.ingredients;
  };

  const combinedResults = (q) => {
    const s = q.trim().toLowerCase();
    const meals = data.meals.filter((m) => !s || m.name.toLowerCase().includes(s)).map((item) => ({ type: "meal", item }));
    const ings = data.ingredients.filter((i) => !s || i.name.toLowerCase().includes(s)).map((item) => ({ type: "ingredient", item }));
    return [...meals, ...ings].sort((a, b) => a.item.name.localeCompare(b.item.name));
  };

  const IngRow = ({ ing, onTap }) => (
    <button onClick={onTap} className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
      <div>
        <p className="text-sm font-medium text-stone-800">{ing.name}</p>
        <p className="text-xs text-stone-400">{unitLabel(ing.unit)} — {r0(ing.cal)} kcal · P {r1(ing.protein)} · F {r1(ing.fibre)}</p>
      </div>
      <ChevronRight size={16} className="text-stone-300" />
    </button>
  );

  /* ================= render ================= */

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#F6F4EE", height: "100dvh" }}>

      {/* ---------- fixed header ---------- */}
      <header className="flex-none px-4 pb-2"
        style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button onClick={() => { setTab("today"); setDayOff(0); closeModal(); }} aria-label="Home">
            <h1 className="text-2xl italic text-stone-900" style={{ fontFamily: '"EB Garamond", Georgia, serif' }}>
              Rasoi<span style={{ color: LEAF }}>Log</span>
            </h1>
          </button>
          <div className="flex gap-1">
            <button onClick={() => { setSyncInput(""); setModal({ t: "sync" }); }}
              className="rounded-full p-2 active:bg-stone-200" aria-label="Cloud sync"
              style={{ color: syncCode ? LEAF : "#78716c" }}><Cloud size={19} /></button>
            <button onClick={() => { setTargetsForm({ cal: String(tg.cal), protein: String(tg.protein), fibre: String(tg.fibre) }); setModal({ t: "targets" }); }}
              className="rounded-full p-2 text-stone-500 active:bg-stone-200" aria-label="Daily targets"><Target size={19} /></button>
            <button onClick={() => waShare(todayShareText())}
              className="rounded-full p-2 text-stone-500 active:bg-stone-200" aria-label="Share to WhatsApp"><MessageCircle size={19} /></button>
          </div>
        </div>
      </header>

      {/* ---------- scrollable content (only this moves) ---------- */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <div className="mx-auto max-w-md">

          {/* ---------- TODAY ---------- */}
          {tab === "today" && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <button onClick={() => setDayOff(dayOff - 1)} className="rounded-full p-2 text-stone-500 active:bg-stone-200" aria-label="Previous day"><ChevronLeft size={18} /></button>
                <button onClick={() => setDayOff(0)} className="text-sm font-semibold text-stone-700">
                  {fmtDay(viewDate)}
                  {dayOff === 0
                    ? <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: INK }}>Today</span>
                    : <span className="ml-2 text-xs font-normal text-stone-400">tap for today</span>}
                </button>
                <button onClick={() => setDayOff(Math.min(0, dayOff + 1))} disabled={dayOff === 0}
                  className="rounded-full p-2 text-stone-500 active:bg-stone-200 disabled:opacity-30" aria-label="Next day"><ChevronRight size={18} /></button>
              </div>

              <div className="mb-3 rounded-3xl border border-stone-100 bg-white p-5 shadow-sm">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Calories</p>
                    <p className="italic leading-none text-stone-900" style={{ fontFamily: '"EB Garamond", Georgia, serif', fontSize: "2.9rem" }}>
                      {fmtK(tot.cal)}
                    </p>
                  </div>
                  <p className="pb-1 text-sm text-stone-400">of {fmtK(tg.cal)} kcal</p>
                </div>
                <div className="mt-2"><Bar pct={pct(tot.cal, tg.cal)} over={tot.cal > tg.cal} /></div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Protein</p>
                      <p className="text-sm font-semibold text-stone-800">{r1(tot.protein)}<span className="text-xs font-normal text-stone-400"> / {tg.protein} g</span></p>
                    </div>
                    <div className="mt-1"><Bar pct={pct(tot.protein, tg.protein)} /></div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Fibre</p>
                      <p className="text-sm font-semibold text-stone-800">{r1(tot.fibre)}<span className="text-xs font-normal text-stone-400"> / {tg.fibre} g</span></p>
                    </div>
                    <div className="mt-1"><Bar pct={pct(tot.fibre, tg.fibre)} /></div>
                  </div>
                </div>
              </div>

              {data.hint && (
                <div className="mb-3 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <p className="flex-1 text-xs leading-relaxed text-emerald-900">
                    Your library now includes 200+ Indian ingredients and home-style dishes (cooked weights for dals & sabzis, standard home ghee/oil). Open <b>Library</b> to tweak anything to your kitchen's numbers.
                  </p>
                  <button onClick={() => persist({ ...data, hint: false })} className="text-emerald-700"><X size={16} /></button>
                </div>
              )}

              <div className="mb-4 grid grid-cols-3 gap-2">
                <AddBtn icon={Search} label="Ingredient" onClick={() => { setPickSearch(""); setModal({ t: "pick" }); }} />
                <AddBtn icon={BookOpen} label="Meal" onClick={() => setModal({ t: "meals" })} />
                <AddBtn icon={Plus} label="Quick add" onClick={() => { setQuick({ name: "", cal: "", protein: "", fibre: "" }); setModal({ t: "quick" }); }} />
              </div>

              {entries.length === 0 ? (
                <p className="mt-8 text-center text-sm text-stone-400">Nothing logged for this day yet.<br />Add an ingredient, a saved meal, or a quick entry.</p>
              ) : (
                <div className="space-y-2">
                  {entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-white px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-800">{e.name}</p>
                        <p className="truncate text-xs text-stone-400">
                          {e.detail ? `${e.detail} · ` : ""}{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-stone-800">{r0(e.cal)} <span className="text-xs font-normal text-stone-400">kcal</span></p>
                        <p className="text-xs text-stone-400">P {r1(e.protein)} · F {r1(e.fibre)}</p>
                      </div>
                      <button onClick={() => delEntry(e.id)} className="-mr-1 p-2 text-stone-300 active:text-red-500" aria-label="Delete entry"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ---------- SEARCH ---------- */}
          {tab === "search" && (
            <>
              <div className="mb-3 flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-3 text-stone-400" />
                  <input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Search ingredients & meals…"
                    className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-base focus:border-emerald-600 focus:outline-none" />
                </div>
                <MicButton onResult={setGlobalSearch} onUnsupported={() => setToast("Voice search isn't supported here — try your keyboard's mic icon")} />
              </div>
              <div className="space-y-2">
                {combinedResults(globalSearch).slice(0, 60).map(({ type, item }) =>
                  type === "ingredient" ? (
                    <button key={"i-" + item.id} onClick={() => { setQtyStr(""); setModal({ t: "qty", ing: item }); }}
                      className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#EFEAE0", color: "#8a7a5c" }}>Ingredient</span>
                          <p className="truncate text-sm font-medium text-stone-800">{item.name}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400">{unitLabel(item.unit)} — {r0(item.cal)} kcal · P {r1(item.protein)} · F {r1(item.fibre)}</p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-stone-300" />
                    </button>
                  ) : (
                    <button key={"m-" + item.id} onClick={() => { setMultStr("1"); setModal({ t: "mult", meal: item }); }}
                      className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#E4EFE9", color: LEAF }}>Meal</span>
                          <p className="truncate text-sm font-medium text-stone-800">{item.name}</p>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-stone-400">{mealDetail(item)}</p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-stone-300" />
                    </button>
                  )
                )}
                {combinedResults(globalSearch).length === 0 && (
                  <p className="py-8 text-center text-sm text-stone-400">Nothing matches — add it from the Library tab.</p>
                )}
              </div>
            </>
          )}

          {/* ---------- LIBRARY ---------- */}
          {tab === "library" && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-stone-800">Library</h2>
                <button onClick={() => setModal({ t: "typePick" })}
                  className="flex items-center gap-1 text-sm font-semibold" style={{ color: LEAF }}>
                  <Plus size={16} /> Add
                </button>
              </div>

              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-3 text-stone-400" />
                <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder={`Search ${data.ingredients.length} items…`}
                  className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-base focus:border-emerald-600 focus:outline-none" />
              </div>

              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                Ingredients & dishes <span className="font-normal normal-case text-stone-400">({filteredIngs(libSearch).length})</span>
              </h3>
              <div className="mb-6 space-y-2">
                {filteredIngs(libSearch).length === 0 && <p className="py-4 text-center text-sm text-stone-400">Nothing matches.</p>}
                {filteredIngs(libSearch).slice(0, 80).map((ing) => (
                  <div key={ing.id} className="flex items-center gap-2 rounded-2xl border border-stone-100 bg-white px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800">{ing.name}</p>
                      <p className="text-xs text-stone-400">{unitLabel(ing.unit)} — {r0(ing.cal)} kcal · P {r1(ing.protein)} · F {r1(ing.fibre)}</p>
                    </div>
                    <button onClick={() => { setIngForm({ name: ing.name, unit: ing.unit, cal: String(ing.cal), protein: String(ing.protein), fibre: String(ing.fibre) }); setIngEditId(ing.id); setModal({ t: "ingForm", from: "library" }); }}
                      className="p-2 text-stone-400 active:text-stone-700" aria-label="Edit"><Pencil size={15} /></button>
                    {confirmDelId === ing.id ? (
                      <button onClick={() => delIngredient(ing.id)} className="-mr-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white">Sure?</button>
                    ) : (
                      <button onClick={() => setConfirmDelId(ing.id)} className="-mr-1 p-2 text-stone-300 active:text-red-500" aria-label="Delete"><Trash2 size={15} /></button>
                    )}
                  </div>
                ))}
                {filteredIngs(libSearch).length > 80 && (
                  <p className="py-2 text-center text-xs text-stone-400">Showing first 80 — type to narrow down.</p>
                )}
              </div>

              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Saved meals</h3>
              <div className="space-y-2">
                {data.meals.length === 0 && (
                  <p className="py-4 text-center text-sm text-stone-400">Group ingredients you eat together into a meal —<br />then log the whole thing in one tap.</p>
                )}
                {data.meals.map((m) => {
                  const t = mealTotals(m);
                  return (
                    <div key={m.id} className="flex items-center gap-2 rounded-2xl border border-stone-100 bg-white px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-800">{m.name}</p>
                        <p className="truncate text-xs text-stone-400">{mealDetail(m)}</p>
                        <p className="text-xs font-medium text-stone-500">{r0(t.cal)} kcal · P {r1(t.protein)} · F {r1(t.fibre)}</p>
                      </div>
                      {confirmDelId === m.id ? (
                        <button onClick={() => delMeal(m.id)} className="-mr-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white">Sure?</button>
                      ) : (
                        <button onClick={() => setConfirmDelId(m.id)} className="-mr-1 p-2 text-stone-300 active:text-red-500" aria-label="Delete meal"><Trash2 size={15} /></button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* backup & data */}
              <div className="mt-8 space-y-2 border-t border-stone-200 pt-4">
                <button onClick={exportBackup}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-700">
                  <Download size={15} style={{ color: LEAF }} /> Export backup (everything)
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-700">
                  <Upload size={15} style={{ color: LEAF }} /> Restore from backup
                </button>
                <input ref={fileRef} type="file" accept="application/json" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) importBackup(e.target.files[0]); e.target.value = ""; }} />
              </div>

              <div className="mt-6 pb-2">
                {confirmReset ? (
                  <div className="flex gap-2">
                    <button onClick={resetAll} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white">Tap again to erase everything</button>
                    <button onClick={() => setConfirmReset(false)} className="rounded-xl border border-stone-200 px-4 text-sm text-stone-600">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmReset(true)} className="w-full text-center text-xs text-stone-400 underline">Reset all data</button>
                )}
              </div>
            </>
          )}

          {/* ---------- WEEK ---------- */}
          {tab === "week" && (() => {
            const days = Array.from({ length: 7 }, (_, i) => {
              const off = i - 6;
              const d = dayAt(off);
              const es = data.logs[dkey(d)] || [];
              return { off, d, es, t: totalsOf(es) };
            });
            const logged = days.filter((x) => x.es.length);
            const avg = logged.length
              ? totalsOf(logged.map((x) => ({ cal: x.t.cal, protein: x.t.protein, fibre: x.t.fibre })))
              : null;
            return (
              <>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Last 7 days</h2>
                <p className="mb-3 text-xs text-stone-400">{fmtShort(days[0].d)} – {fmtShort(days[6].d)} · tap a day to view or edit it</p>
                <div className="space-y-2">
                  {days.map(({ off, d, es, t }) => (
                    <button key={off} onClick={() => { setDayOff(off); setTab("today"); }}
                      className="w-full rounded-2xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-medium text-stone-800">{fmtDay(d)}{off === 0 && <span className="ml-1 text-xs font-normal text-stone-400">(today)</span>}</p>
                        {es.length
                          ? <p className="text-sm font-semibold text-stone-800">{fmtK(t.cal)} <span className="text-xs font-normal text-stone-400">kcal · P {r1(t.protein)} · F {r1(t.fibre)}</span></p>
                          : <p className="text-xs text-stone-300">no entries</p>}
                      </div>
                      <div className="mt-2"><Bar pct={pct(t.cal, tg.cal)} over={t.cal > tg.cal} /></div>
                    </button>
                  ))}
                </div>

                {avg && (
                  <p className="mt-3 text-center text-xs text-stone-500">
                    Average over {logged.length} logged day{logged.length > 1 ? "s" : ""}: <b>{r0(avg.cal / logged.length)} kcal</b> · P {r1(avg.protein / logged.length)} · F {r1(avg.fibre / logged.length)}
                  </p>
                )}

                <div className="mt-6 space-y-2">
                  <PrimaryBtn onClick={() => { setReportDetail("full"); setCopied(false); setModal({ t: "report" }); }}>
                    Weekly report for Claude
                  </PrimaryBtn>
                  <button onClick={() => waShare(buildReport("totals"))}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-700">
                    <MessageCircle size={16} style={{ color: LEAF }} /> Share week to WhatsApp
                  </button>
                  <button onClick={downloadCsv} className="flex w-full items-center justify-center gap-2 py-2 text-xs text-stone-400">
                    <Download size={13} /> Download full history (CSV)
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </main>

      {/* ---------- fixed bottom nav (never scrolls away) ---------- */}
      <nav className="flex-none border-t border-stone-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid max-w-md grid-cols-4 px-4 pt-2">
          {[
            { id: "today", icon: Home, label: "Home" },
            { id: "search", icon: Search, label: "Search" },
            { id: "library", icon: BookOpen, label: "Library" },
            { id: "week", icon: BarChart3, label: "Week" },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-0.5 py-1">
              <Icon size={20} style={{ color: tab === id ? INK : "#a8a29e" }} />
              <span className="text-xs font-medium" style={{ color: tab === id ? INK : "#a8a29e" }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ---------- modals ---------- */}

      {modal?.t === "typePick" && (
        <Sheet title="What are you adding?" onClose={closeModal}>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setIngForm({ name: "", unit: "g", cal: "", protein: "", fibre: "" }); setIngEditId(null); setModalRaw({ t: "ingForm", from: "library" }); }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white py-6 active:bg-stone-50">
              <Search size={22} style={{ color: LEAF }} />
              <span className="text-sm font-semibold text-stone-800">Ingredient</span>
              <span className="px-2 text-center text-xs text-stone-400">A single food with known values</span>
            </button>
            <button onClick={() => { setMealForm({ name: "", items: [] }); setMealPickOpen(false); setMealPickSearch(""); setModalRaw({ t: "mealForm" }); }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white py-6 active:bg-stone-50">
              <BookOpen size={22} style={{ color: LEAF }} />
              <span className="text-sm font-semibold text-stone-800">Meal</span>
              <span className="px-2 text-center text-xs text-stone-400">A combo of ingredients eaten together</span>
            </button>
          </div>
        </Sheet>
      )}

      {modal?.t === "pick" && (
        <Sheet title="Log an ingredient" onClose={closeModal}
          footer={
            <button onClick={() => { setIngForm({ name: pickSearch.trim(), unit: "g", cal: "", protein: "", fibre: "" }); setIngEditId(null); setModalRaw({ t: "ingForm", from: "picker" }); }}
              className="flex w-full items-center justify-center gap-1 py-1 text-sm font-semibold" style={{ color: LEAF }}>
              <Plus size={16} /> Create new ingredient
            </button>
          }>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-3 text-stone-400" />
            <input autoFocus value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} placeholder="Search ingredients & meals…"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-9 pr-3 text-base focus:border-emerald-600 focus:outline-none" />
          </div>
          <div className="space-y-2">
            {combinedResults(pickSearch).slice(0, 60).map(({ type, item }) =>
              type === "ingredient" ? (
                <button key={"i-" + item.id} onClick={() => { setQtyStr(""); setModalRaw({ t: "qty", ing: item }); }}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#EFEAE0", color: "#8a7a5c" }}>Ingredient</span>
                      <p className="truncate text-sm font-medium text-stone-800">{item.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-400">{unitLabel(item.unit)} — {r0(item.cal)} kcal · P {r1(item.protein)} · F {r1(item.fibre)}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-stone-300" />
                </button>
              ) : (
                <button key={"m-" + item.id} onClick={() => { setMultStr("1"); setModalRaw({ t: "mult", meal: item }); }}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#E4EFE9", color: LEAF }}>Meal</span>
                      <p className="truncate text-sm font-medium text-stone-800">{item.name}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-400">{mealDetail(item)}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-stone-300" />
                </button>
              )
            )}
            {combinedResults(pickSearch).length === 0 && <p className="py-6 text-center text-sm text-stone-400">Nothing matches — create it below.</p>}
          </div>
        </Sheet>
      )}

      {modal?.t === "qty" && (() => {
        const ing = modal.ing;
        const q = num(qtyStr);
        const m = macrosFor(ing, q);
        return (
          <Sheet title={ing.name} onClose={closeModal}
            footer={<PrimaryBtn disabled={q <= 0} onClick={() => logIngredient(ing)}>Add to {dayOff === 0 ? "today" : fmtDay(viewDate)}</PrimaryBtn>}>
            <p className="mb-3 text-xs text-stone-400">{unitLabel(ing.unit)}: {r0(ing.cal)} kcal · P {r1(ing.protein)} · F {r1(ing.fibre)}</p>
            {/* live result FIRST so the keyboard can never hide it */}
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              {[["kcal", r0(m.cal)], ["protein g", r1(m.protein)], ["fibre g", r1(m.fibre)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-stone-50 py-2">
                  <p className="text-lg font-semibold text-stone-800">{v}</p>
                  <p className="text-xs text-stone-400">{l}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input autoFocus type="number" inputMode="decimal" min="0" value={qtyStr} onChange={(e) => setQtyStr(e.target.value)}
                placeholder={ing.unit === "pc" ? "1" : "100"}
                className="w-full rounded-xl border border-stone-200 px-3 py-3 text-center text-2xl font-semibold text-stone-800 focus:border-emerald-600 focus:outline-none" />
              <span className="w-14 text-sm font-medium text-stone-500">{ing.unit === "pc" ? "pieces" : "grams"}</span>
            </div>
          </Sheet>
        );
      })()}

      {modal?.t === "ingForm" && (
        <Sheet title={ingEditId ? "Edit ingredient" : "New ingredient"} onClose={closeModal}
          footer={<PrimaryBtn disabled={!ingForm.name.trim() || ingForm.cal === ""} onClick={saveIngredient}>{ingEditId ? "Save changes" : "Save ingredient"}</PrimaryBtn>}>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-stone-500">Name</span>
              <div className="mt-1 flex gap-2">
                <input value={ingForm.name} onChange={(e) => setIngForm({ ...ingForm, name: e.target.value })} placeholder="e.g. Rajma, cooked"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-800 focus:border-emerald-600 focus:outline-none" />
                <MicButton onResult={(t) => setIngForm((f) => ({ ...f, name: t }))} onUnsupported={() => setToast("Voice typing isn't supported here — try your keyboard's mic icon")} />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-stone-500">Measured</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[["g", "per 100 g"], ["pc", "per piece"]].map(([u, l]) => (
                  <button key={u} onClick={() => setIngForm({ ...ingForm, unit: u })}
                    className={`rounded-xl border py-2 text-sm font-medium ${ingForm.unit === u ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-600"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="kcal" hint={ingForm.unit === "pc" ? "per pc" : "per 100 g"} type="number" inputMode="decimal" min="0" value={ingForm.cal} onChange={(e) => setIngForm({ ...ingForm, cal: e.target.value })} placeholder="0" />
              <Field label="Protein g" type="number" inputMode="decimal" min="0" value={ingForm.protein} onChange={(e) => setIngForm({ ...ingForm, protein: e.target.value })} placeholder="0" />
              <Field label="Fibre g" type="number" inputMode="decimal" min="0" value={ingForm.fibre} onChange={(e) => setIngForm({ ...ingForm, fibre: e.target.value })} placeholder="0" />
            </div>
          </div>
        </Sheet>
      )}

      {modal?.t === "meals" && (
        <Sheet title="Log a saved meal" onClose={closeModal}
          footer={
            <button onClick={() => { setMealForm({ name: "", items: [] }); setMealPickOpen(false); setMealPickSearch(""); setModalRaw({ t: "mealForm" }); }}
              className="flex w-full items-center justify-center gap-1 py-1 text-sm font-semibold" style={{ color: LEAF }}>
              <Plus size={16} /> Build a new meal
            </button>
          }>
          <div className="space-y-2">
            {data.meals.length === 0 && <p className="py-6 text-center text-sm text-stone-400">No saved meals yet. Build one from your ingredients — then logging it takes one tap.</p>}
            {data.meals.map((m) => {
              const t = mealTotals(m);
              return (
                <button key={m.id} onClick={() => { setMultStr("1"); setModalRaw({ t: "mult", meal: m }); }}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800">{m.name}</p>
                    <p className="truncate text-xs text-stone-400">{r0(t.cal)} kcal · P {r1(t.protein)} · F {r1(t.fibre)}</p>
                  </div>
                  <ChevronRight size={16} className="text-stone-300" />
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {modal?.t === "mult" && (() => {
        const meal = modal.meal;
        const t = mealTotals(meal);
        const mlt = num(multStr) || 0;
        return (
          <Sheet title={meal.name} onClose={closeModal}
            footer={<PrimaryBtn disabled={mlt <= 0} onClick={() => logMeal(meal)}>Add to {dayOff === 0 ? "today" : fmtDay(viewDate)}</PrimaryBtn>}>
            <p className="mb-3 truncate text-xs text-stone-400">{mealDetail(meal)}</p>
            {/* live result first, input after — keyboard-safe */}
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              {[["kcal", r0(t.cal * mlt)], ["protein g", r1(t.protein * mlt)], ["fibre g", r1(t.fibre * mlt)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-stone-50 py-2">
                  <p className="text-lg font-semibold text-stone-800">{v}</p>
                  <p className="text-xs text-stone-400">{l}</p>
                </div>
              ))}
            </div>
            <span className="text-xs font-medium text-stone-500">Portion</span>
            <div className="mt-1 flex items-center gap-2">
              {["0.5", "1", "1.5", "2"].map((v) => (
                <button key={v} onClick={() => setMultStr(v)}
                  className={`flex-1 rounded-xl border py-2 text-sm font-medium ${multStr === v ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-600"}`}>
                  {v}×
                </button>
              ))}
              <input type="number" inputMode="decimal" min="0" value={multStr} onChange={(e) => setMultStr(e.target.value)}
                className="w-16 rounded-xl border border-stone-200 px-2 py-2 text-center text-sm focus:border-emerald-600 focus:outline-none" />
            </div>
          </Sheet>
        );
      })()}

      {modal?.t === "mealForm" && (() => {
        const items = mealForm.items;
        const liveTotals = items.reduce((a, it) => {
          if (it.type === "meal") {
            const sub = data.meals.find((m) => m.id === it.mealId);
            if (!sub) return a;
            const st = mealTotals(sub);
            const mlt = num(it.qty);
            return { cal: a.cal + st.cal * mlt, protein: a.protein + st.protein * mlt, fibre: a.fibre + st.fibre * mlt };
          }
          const ing = data.ingredients.find((i) => i.id === it.ingId);
          if (!ing) return a;
          const m = macrosFor(ing, num(it.qty));
          return { cal: a.cal + m.cal, protein: a.protein + m.protein, fibre: a.fibre + m.fibre };
        }, { cal: 0, protein: 0, fibre: 0 });
        const valid = mealForm.name.trim() && items.some((it) => num(it.qty) > 0);
        return (
          <Sheet title={mealPickOpen ? "Add to meal" : "Build a meal"} onClose={closeModal}
            footer={mealPickOpen
              ? <button onClick={() => setMealPickOpen(false)} className="w-full py-1 text-sm font-semibold text-stone-500">Back to meal</button>
              : <PrimaryBtn disabled={!valid} onClick={saveMeal}>Save meal · {r0(liveTotals.cal)} kcal · P {r1(liveTotals.protein)} · F {r1(liveTotals.fibre)}</PrimaryBtn>}>
            {mealPickOpen ? (
              <>
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-3 text-stone-400" />
                  <input autoFocus value={mealPickSearch} onChange={(e) => setMealPickSearch(e.target.value)} placeholder="Search ingredients & meals…"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-9 pr-3 text-base focus:border-emerald-600 focus:outline-none" />
                </div>
                <div className="space-y-2">
                  {combinedResults(mealPickSearch).slice(0, 50).map(({ type, item }) =>
                    type === "meal" ? (
                      <button key={"m-" + item.id} onClick={() => {
                        setMealForm({ ...mealForm, items: [...items, { type: "meal", mealId: item.id, qty: "1" }] });
                        setMealPickOpen(false);
                      }} className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-4 py-3 text-left active:bg-stone-50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#E4EFE9", color: LEAF }}>Meal</span>
                            <p className="truncate text-sm font-medium text-stone-800">{item.name}</p>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-stone-400">{mealDetail(item)}</p>
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-stone-300" />
                      </button>
                    ) : (
                      <IngRow key={"i-" + item.id} ing={item} onTap={() => {
                        setMealForm({ ...mealForm, items: [...items, { type: "ingredient", ingId: item.id, qty: item.unit === "pc" ? "1" : "100" }] });
                        setMealPickOpen(false);
                      }} />
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-stone-500">Meal name</span>
                  <div className="mt-1 flex gap-2">
                    <input value={mealForm.name} onChange={(e) => setMealForm({ ...mealForm, name: e.target.value })} placeholder="e.g. My usual breakfast"
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-800 focus:border-emerald-600 focus:outline-none" />
                    <MicButton onResult={(t) => setMealForm((f) => ({ ...f, name: t }))} onUnsupported={() => setToast("Voice typing isn't supported here — try your keyboard's mic icon")} />
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((it, i) => {
                    if (it.type === "meal") {
                      const sub = data.meals.find((m) => m.id === it.mealId);
                      if (!sub) return null;
                      return (
                        <div key={`meal-${it.mealId}-${i}`} className="flex items-center gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2">
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#E4EFE9", color: LEAF }}>Meal</span>
                          <p className="min-w-0 flex-1 truncate text-sm text-stone-800">{sub.name}</p>
                          <input type="number" inputMode="decimal" min="0" value={it.qty}
                            onChange={(e) => setMealForm({ ...mealForm, items: items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })}
                            className="w-16 rounded-lg border border-stone-200 px-2 py-1.5 text-center text-sm focus:border-emerald-600 focus:outline-none" />
                          <span className="w-4 text-xs text-stone-400">×</span>
                          <button onClick={() => setMealForm({ ...mealForm, items: items.filter((_, j) => j !== i) })} className="p-1 text-stone-300 active:text-red-500"><X size={15} /></button>
                        </div>
                      );
                    }
                    const ing = data.ingredients.find((x) => x.id === it.ingId);
                    if (!ing) return null;
                    return (
                      <div key={`ing-${it.ingId}-${i}`} className="flex items-center gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2">
                        <p className="min-w-0 flex-1 truncate text-sm text-stone-800">{ing.name}</p>
                        <input type="number" inputMode="decimal" min="0" value={it.qty}
                          onChange={(e) => setMealForm({ ...mealForm, items: items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })}
                          className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-center text-sm focus:border-emerald-600 focus:outline-none" />
                        <span className="w-6 text-xs text-stone-400">{ing.unit === "pc" ? "pc" : "g"}</span>
                        <button onClick={() => setMealForm({ ...mealForm, items: items.filter((_, j) => j !== i) })} className="p-1 text-stone-300 active:text-red-500"><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { setMealPickSearch(""); setMealPickOpen(true); }}
                  className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-500">
                  <Plus size={15} /> Add ingredient or meal
                </button>
              </div>
            )}
          </Sheet>
        );
      })()}

      {modal?.t === "quick" && (
        <Sheet title="Quick add" onClose={closeModal}
          footer={<PrimaryBtn disabled={!quick.name.trim() || quick.cal === ""} onClick={saveQuick}>Add to {dayOff === 0 ? "today" : fmtDay(viewDate)}</PrimaryBtn>}>
          <p className="mb-3 text-xs text-stone-400">For one-off items where you already know the numbers. Tip: use your keyboard's mic to dictate the name.</p>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-stone-500">What did you eat?</span>
              <div className="mt-1 flex gap-2">
                <input autoFocus value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="e.g. Samosa from shop"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-800 focus:border-emerald-600 focus:outline-none" />
                <MicButton onResult={(t) => setQuick((q) => ({ ...q, name: t }))} onUnsupported={() => setToast("Voice typing isn't supported here — try your keyboard's mic icon")} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="kcal" type="number" inputMode="decimal" min="0" value={quick.cal} onChange={(e) => setQuick({ ...quick, cal: e.target.value })} placeholder="0" />
              <Field label="Protein g" type="number" inputMode="decimal" min="0" value={quick.protein} onChange={(e) => setQuick({ ...quick, protein: e.target.value })} placeholder="0" />
              <Field label="Fibre g" type="number" inputMode="decimal" min="0" value={quick.fibre} onChange={(e) => setQuick({ ...quick, fibre: e.target.value })} placeholder="0" />
            </div>
          </div>
        </Sheet>
      )}

      {modal?.t === "sync" && (
        <Sheet title="Cloud sync" onClose={closeModal}>
          {syncCode ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Your sync code</p>
                <p className="mt-1 select-all font-mono text-xl font-bold text-emerald-900">{syncCode}</p>
              </div>
              <p className="text-xs leading-relaxed text-stone-500">
                Enter this same code on any other phone or computer (Cloud icon → connect) and your log stays in sync everywhere. Keep it private — anyone with the code can see and edit this data.
              </p>
              <p className="text-center text-xs text-stone-400">
                {syncing ? "Syncing…" : lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not synced yet"}
              </p>
              <PrimaryBtn onClick={() => doSync()}>
                <span className="inline-flex items-center gap-2"><RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> Sync now</span>
              </PrimaryBtn>
              <button onClick={async () => { (await copyText(syncCode)) && setToast("Code copied"); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-700">
                <Copy size={15} style={{ color: LEAF }} /> Copy code
              </button>
              <button onClick={stopSync} className="w-full py-1 text-center text-xs text-stone-400 underline">Turn off sync on this device</button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-stone-500">
                Sync your log across devices — free, automatic. Create a code on your first device, then enter the same code on the others.
              </p>
              <PrimaryBtn onClick={() => startSync("rasoi-" + uid().slice(-8))}>Create new sync code</PrimaryBtn>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-stone-200" />
                <span className="text-xs text-stone-400">or connect this device</span>
                <div className="h-px flex-1 bg-stone-200" />
              </div>
              <input value={syncInput} onChange={(e) => setSyncInput(e.target.value)} placeholder="Enter existing sync code"
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-center font-mono text-base focus:border-emerald-600 focus:outline-none" />
              <button onClick={() => syncInput.trim() && startSync(syncInput)} disabled={!syncInput.trim()}
                className="w-full rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-700 disabled:opacity-40">
                Connect & merge data
              </button>
            </div>
          )}
        </Sheet>
      )}

      {modal?.t === "targets" && (
        <Sheet title="Daily targets" onClose={closeModal}
          footer={<PrimaryBtn onClick={saveTargets}>Save targets</PrimaryBtn>}>
          <div className="grid grid-cols-3 gap-2">
            <Field label="kcal" type="number" inputMode="decimal" min="0" value={targetsForm.cal} onChange={(e) => setTargetsForm({ ...targetsForm, cal: e.target.value })} />
            <Field label="Protein g" type="number" inputMode="decimal" min="0" value={targetsForm.protein} onChange={(e) => setTargetsForm({ ...targetsForm, protein: e.target.value })} />
            <Field label="Fibre g" type="number" inputMode="decimal" min="0" value={targetsForm.fibre} onChange={(e) => setTargetsForm({ ...targetsForm, fibre: e.target.value })} />
          </div>
        </Sheet>
      )}

      {modal?.t === "report" && (() => {
        const report = buildReport(reportDetail);
        return (
          <Sheet title="Weekly report for Claude" onClose={closeModal}>
            <p className="mb-3 text-xs leading-relaxed text-stone-500">
              Copy this and paste it into any Claude chat once a week — ask for trends, gaps, or adjustments.
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {[["full", "Full detail"], ["totals", "Totals only (fewer tokens)"]].map(([v, l]) => (
                <button key={v} onClick={() => { setReportDetail(v); setCopied(false); }}
                  className={`rounded-xl border py-2 text-xs font-medium ${reportDetail === v ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <textarea readOnly value={report} rows={9}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-stone-700" style={{ fontSize: "11px" }} />
            <div className="mt-3 space-y-2">
              <PrimaryBtn onClick={async () => { setCopied(await copyText(report)); }}>
                {copied ? <span className="inline-flex items-center gap-1"><Check size={15} /> Copied — paste into Claude</span> : <span className="inline-flex items-center gap-1"><Copy size={15} /> Copy report</span>}
              </PrimaryBtn>
              <button onClick={() => waShare(report)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-700">
                <MessageCircle size={16} style={{ color: LEAF }} /> Send to WhatsApp
              </button>
            </div>
          </Sheet>
        );
      })()}

      {/* ---------- toast ---------- */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
