import { useEffect, useMemo, useState, useRef, useCallback } from "react";

// ── TIPOS API ────────────────────────────────────────────────────────────────

type LicitacionAPI = {
  CodigoExterno: string;
  Nombre: string;
  FechaCierre: string;
  FechaPublicacion?: string;
  Comprador?: { NombreOrganismo: string };
  Tipo?: string;
  MontoEstimado?: number;
  Estado?: string;
  Descripcion?: string;
};

type OrdenCompraAPI = {
  Codigo: string;
  Nombre: string;
  CodigoEstado: number;
  FechaCreacion?: string;
  Organismo?: { Nombre: string };
  Proveedor?: { RazonSocial: string };
  MontoTotal?: number;
};

type DetalleOC = OrdenCompraAPI & { Estado: string };
type DetalleLicitacion = LicitacionAPI;
type Detalle = DetalleOC | DetalleLicitacion | null;

type Licitacion = {
  id: string;
  title: string;
  org: string;
  close: string;
  tipo: "licitacion" | "compra_agil";
  monto: number | null;
  fechaPublicacion: string;
  isNew?: boolean;
};

// ── CONSTANTES ───────────────────────────────────────────────────────────────

const CATEGORIAS_OFICIALES = [
  "Tecnología y Telecomunicaciones",
  "Construcción e Infraestructura",
  "Salud y Medicina",
  "Educación y Capacitación",
  "Aseo y Medio Ambiente",
  "Alimentación y Catering",
  "Transporte y Logística",
  "Seguridad y Vigilancia",
  "Servicios Profesionales",
  "Equipamiento y Mobiliario",
  "Diseño y Comunicación",
];

const CATEGORIA_KEYWORDS: Record<string, string[]> = {
  "Tecnología y Telecomunicaciones": ["tecnología", "ti", "software", "hardware", "computador", "red", "sistema", "digital", "informática", "telecom"],
  "Construcción e Infraestructura": ["construcción", "obra", "infraestructura", "edificio", "pavimento", "reparación", "arquitectura"],
  "Salud y Medicina": ["salud", "médico", "hospital", "clínica", "farmacia", "medicamento", "insumo médico"],
  "Educación y Capacitación": ["educación", "capacitación", "formación", "curso", "taller", "colegio", "universidad"],
  "Aseo y Medio Ambiente": ["aseo", "limpieza", "reciclaje", "residuos", "medio ambiente", "sanitización"],
  "Alimentación y Catering": ["alimentación", "catering", "casino", "comida", "raciones", "alimentos"],
  "Transporte y Logística": ["transporte", "logística", "vehículo", "flota", "traslado", "despacho"],
  "Seguridad y Vigilancia": ["seguridad", "vigilancia", "guardia", "cctv", "cámara", "alarma"],
  "Servicios Profesionales": ["consultoría", "asesoría", "legal", "contable", "auditoría", "ingeniería"],
  "Equipamiento y Mobiliario": ["mobiliario", "mueble", "equipamiento", "silla", "escritorio", "bodega"],
  "Diseño y Comunicación": ["diseño", "branding", "señalética", "publicidad", "impresión", "evento", "marketing", "gráfica", "comunicación", "campaña"],
};

const getMercadoPublicoURL = (id: string) =>
  `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=OHcbOFIIHcQe7ZfkEERu8A==&idProject=${id}`;

const getOrdenURL = (numero: string) =>
  `https://www.mercadopublico.cl/Procurement/Modules/Ship/StepsProcessBuyer/Resume.aspx?idOC=${numero}`;

const OC_ESTADOS_ABIERTOS = new Set([5, 6]);

const getEstadoOCLabel = (codigo: number) => {
  const map: Record<number, string> = {
    1: "Borrador", 2: "Pendiente", 3: "Sin confirmar", 4: "Confirmada",
    5: "Enviada", 6: "Aceptada", 7: "Recepción conforme",
    8: "Recepción parcial", 9: "Vencida", 10: "Anulada",
    11: "Cerrada", 12: "Cancelada",
  };
  return map[codigo] || `Estado ${codigo}`;
};

const MAX_PAGINAS = 1;

const RANGOS_MONTO = {
  micro:   { label: "Hasta $1M",     min: 0,           max: 1_000_000   },
  pequeno: { label: "$1M – $10M",    min: 1_000_000,   max: 10_000_000  },
  mediano: { label: "$10M – $100M",  min: 10_000_000,  max: 100_000_000 },
  grande:  { label: "Más de $100M",  min: 100_000_000, max: Infinity    },
};

// ── HELPERS localStorage con try/catch ───────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Safari privado u otros contextos sin localStorage
  }
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
  const [licitaciones, setLicitaciones] = useState<LicitacionAPI[]>([]);
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompraAPI[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("open");
  const [order, setOrder] = useState<"new" | "old">("new");
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Iniciando...");
  const [visible, setVisible] = useState(20);
  const [favorites, setFavorites] = useState<string[]>(() => lsGet("favorites", []));
  const [selected, setSelected] = useState<Licitacion | null>(null);
  const [detalle, setDetalle] = useState<Detalle>(null);
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [montoRango, setMontoRango] = useState<"all" | "micro" | "pequeno" | "mediano" | "grande">("all");
  const [tipoFiltro, setTipoFiltro] = useState<"all" | "licitacion" | "compra_agil">("all");
  const [alertKeywords, setAlertKeywords] = useState<string[]>(() => lsGet("alertKeywords", []));
  const [alertCategorias, setAlertCategorias] = useState<string[]>(() => lsGet("alertCategorias", []));
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [newAlerts, setNewAlerts] = useState<string[]>([]);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // ── PERSISTENCIA ─────────────────────────────────────────────────────────

  useEffect(() => { lsSet("favorites", favorites); }, [favorites]);
  useEffect(() => { lsSet("alertKeywords", alertKeywords); }, [alertKeywords]);
  useEffect(() => { lsSet("alertCategorias", alertCategorias); }, [alertCategorias]);

  // ── HELPERS ──────────────────────────────────────────────────────────────

  const getStatus = (date: string) => {
    const diff = (new Date(date).getTime() - Date.now()) / 86400000;
    if (diff < 0) return "closed";
    if (diff <= 3) return "urgent";
    return "open";
  };

  const copyID = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  // ── PAGINACIÓN LICITACIONES ───────────────────────────────────────────────

  const fetchLicitacionesPaginadas = async (): Promise<LicitacionAPI[]> => {
    const acumulado: LicitacionAPI[] = [];
    const idsVistos = new Set<string>();

    setLoadingMsg("Cargando licitaciones recientes...");
    try {
      const res = await fetch(`/api/mercadopublico?endpoint=licitaciones&estado=publicada`);
      if (res.ok) {
        const data = await res.json();
        const listado: LicitacionAPI[] = data.Listado || [];
        listado.forEach((i) => {
          if (!idsVistos.has(i.CodigoExterno)) {
            idsVistos.add(i.CodigoExterno);
            acumulado.push(i);
          }
        });
      }
    } catch (err) {
      console.warn("Error cargando licitaciones base:", err);
    }

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
await new Promise((r) => setTimeout(r, 3000));      setLoadingMsg(`Cargando más licitaciones... (${pagina + 1}/${MAX_PAGINAS})`);

      const fechas = acumulado
        .map((i) => i.FechaPublicacion || i.FechaCierre)
        .filter(Boolean)
        .map((f) => new Date(f!).getTime());

      if (fechas.length === 0) break;
      const masAntigua = new Date(Math.min(...fechas));
      masAntigua.setDate(masAntigua.getDate() - 1);
      const fechaHasta = masAntigua.toISOString().slice(0, 10).replace(/-/g, "");

      try {
        const res = await fetch(`/api/mercadopublico?endpoint=licitaciones&estado=publicada&fecha=${fechaHasta}`);
        if (!res.ok) { console.warn(`Paginación detenida: HTTP ${res.status}`); break; }
        const data = await res.json();
        const listado: LicitacionAPI[] = data.Listado || [];
        if (listado.length === 0) break;
        const nuevas = listado.filter((i) => {
          if (idsVistos.has(i.CodigoExterno)) return false;
          idsVistos.add(i.CodigoExterno);
          return true;
        });
        acumulado.push(...nuevas);
        if (listado.length < 10) break;
      } catch (err) {
        console.warn("Error paginación:", err);
        break;
      }
    }

    return acumulado;
  };

  // ── FETCH PRINCIPAL ───────────────────────────────────────────────────────
  // useCallback para poder incluirlo correctamente en dependencias de useEffect

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingMsg("Conectando con MercadoPublico...");

      const [listadoLic, resOC] = await Promise.all([
        fetchLicitacionesPaginadas(),
        fetch(`/api/mercadopublico?endpoint=ordenesdecompra`),
      ]);

      setLoadingMsg("Cargando compras ágiles...");
      const dataOC = await resOC.json();
      const listadoOC: OrdenCompraAPI[] = dataOC.Listado || [];

      // Detectar nuevas relevantes para alertas
      const todosKeywords = [
        ...alertKeywords,
        ...alertCategorias.flatMap((cat) => CATEGORIA_KEYWORDS[cat] || []),
      ].map((k) => k.toLowerCase());

      if (prevIdsRef.current.size > 0 && todosKeywords.length > 0) {
        const todasNombres: Record<string, string> = {};
        listadoLic.forEach((i) => { todasNombres[i.CodigoExterno] = i.Nombre; });
        listadoOC.forEach((i) => { todasNombres[i.Codigo] = i.Nombre; });

        const nuevas = Object.keys(todasNombres).filter((id) => {
          if (prevIdsRef.current.has(id)) return false;
          const titulo = (todasNombres[id] || "").toLowerCase();
          return todosKeywords.some((kw) => titulo.includes(kw));
        });

        if (nuevas.length > 0) {
          setNewAlerts(nuevas);
          setShowNewBadge(true);
        }
      }

      prevIdsRef.current = new Set([
        ...listadoLic.map((i) => i.CodigoExterno),
        ...listadoOC.map((i) => i.Codigo),
      ]);

      setLicitaciones(listadoLic);
      setOrdenesCompra(listadoOC);
    } catch (err) {
      console.error("Error fetch:", err);
      setLoadingMsg("Error al cargar datos. Reintentando...");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertKeywords, alertCategorias]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── MAPEO UNIFICADO ───────────────────────────────────────────────────────

  const mapped: Licitacion[] = useMemo(() => {
    const lic: Licitacion[] = licitaciones.map((item) => ({
      id: item.CodigoExterno,
      title: item.Nombre || "Sin nombre",
      org: item.Comprador?.NombreOrganismo || "—",
      close: item.FechaCierre,
      tipo: "licitacion",
      monto: item.MontoEstimado ? Number(item.MontoEstimado) : null,
      fechaPublicacion: item.FechaPublicacion || "",
      isNew: newAlerts.includes(item.CodigoExterno),
    }));

    const oc: Licitacion[] = ordenesCompra.map((item) => ({
      id: item.Codigo,
      title: item.Nombre || "Sin nombre",
      org: item.Organismo?.Nombre || "—",
      close: OC_ESTADOS_ABIERTOS.has(item.CodigoEstado)
        ? new Date(Date.now() + 30 * 86400000).toISOString()
        : new Date(Date.now() - 86400000).toISOString(),
      tipo: "compra_agil",
      monto: item.MontoTotal ? Number(item.MontoTotal) : null,
      fechaPublicacion: item.FechaCreacion || "",
      isNew: newAlerts.includes(item.Codigo),
    }));

    return [...lic, ...oc];
  }, [licitaciones, ordenesCompra, newAlerts]);

  // ── FILTROS ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const now = new Date();
    let result = mapped.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
    if (status === "open") result = result.filter((i) => new Date(i.close) >= now);
    if (status === "closed") result = result.filter((i) => new Date(i.close) < now);
    if (tipoFiltro !== "all") result = result.filter((i) => i.tipo === tipoFiltro);
    if (montoMin) result = result.filter((i) => i.monto !== null && i.monto >= Number(montoMin));
    if (montoMax) result = result.filter((i) => i.monto !== null && i.monto <= Number(montoMax));
    if (montoRango !== "all") {
    const { min, max } = RANGOS_MONTO[montoRango];
    result = result.filter((i) => i.monto !== null && i.monto >= min && i.monto <= max);
    }
    result.sort((a, b) => {
      const diff = new Date(b.close).getTime() - new Date(a.close).getTime();
      return order === "new" ? diff : -diff;
    });
    result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    return result;
  }, [mapped, search, status, order, tipoFiltro, montoMin, montoMax, montoRango]);

  // ── STATS ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let open = 0, closed = 0, urgent = 0, lic = 0, ca = 0;
    filtered.forEach((i) => {
      const s = getStatus(i.close);
      if (s === "open") open++;
      if (s === "closed") closed++;
      if (s === "urgent") urgent++;
      if (i.tipo === "licitacion") lic++;
      else ca++;
    });
    return { total: filtered.length, open, closed, urgent, licitaciones: lic, comprasAgiles: ca, favorites: favorites.length };
  }, [filtered, favorites]);

  // ── INFINITE SCROLL ───────────────────────────────────────────────────────

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200)
        setVisible((prev) => prev + 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── ACCIONES ─────────────────────────────────────────────────────────────

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);

  const openLicitacion = async (item: Licitacion) => {
    setSelected(item);
    setDetalle(null);
    if (item.tipo === "compra_agil") {
      const oc = ordenesCompra.find((o) => o.Codigo === item.id);
      setDetalle(oc ? { ...oc, Estado: getEstadoOCLabel(oc.CodigoEstado) } : null);
      return;
    }
    try {
      const res = await fetch(`/api/mercadopublico?endpoint=licitaciones&codigo=${item.id}`);
      const data = await res.json();
      setDetalle(data?.Listado?.[0] || data);
    } catch (err) {
      console.error("Error detalle:", err);
    }
  };

  const addKeyword = () => {
    const kw = newKeywordInput.trim().toLowerCase();
    if (kw && !alertKeywords.includes(kw)) setAlertKeywords((prev) => [...prev, kw]);
    setNewKeywordInput("");
  };

  // ── CLASES BASE ───────────────────────────────────────────────────────────

  const inputCls = "bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg focus:outline-none focus:border-blue-500 transition-colors";

  // ── LOADING ───────────────────────────────────────────────────────────────

  if (loading && mapped.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
        <p className="text-slate-300 text-sm font-medium">{loadingMsg}</p>
        <p className="text-slate-600 text-xs">Esto puede tomar unos segundos la primera vez</p>
      </div>
    );
  }

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">Licitaciones</h1>
              {showNewBadge && (
                <button
                  onClick={() => setShowNewBadge(false)}
                  className="animate-pulse bg-amber-400 text-slate-900 text-xs font-bold px-2.5 py-0.5 rounded-full"
                >
                  {newAlerts.length} nueva{newAlerts.length !== 1 ? "s" : ""} ✕
                </button>
              )}
              {loading && (
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin inline-block" />
                  Actualizando...
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {(["new", "old"] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setOrder(val)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${order === val ? "bg-blue-500/20 border-blue-500/60 text-blue-300" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                >
                  {val === "new" ? "Más recientes" : "Más antiguas"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <input
              className={`${inputCls} text-sm px-3 py-2 w-60`}
              placeholder="Buscar licitación o compra ágil..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => setShowAlertConfig((v) => !v)}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${showAlertConfig ? "bg-amber-500/20 border-amber-400/60 text-amber-300" : "border-slate-700 text-slate-300 hover:border-amber-400/60 hover:text-amber-300"}`}
            >
              🔔 Alertas {alertKeywords.length + alertCategorias.length > 0 ? `(${alertKeywords.length + alertCategorias.length})` : ""}
            </button>
          </div>
        </div>

        {/* PANEL ALERTAS */}
        {showAlertConfig && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-amber-400 font-semibold text-sm mb-1">⚙️ Alertas de nuevas publicaciones</h3>
              <p className="text-slate-400 text-xs">Te avisaremos cuando aparezcan nuevas licitaciones o compras ágiles que coincidan con tu rubro.</p>
            </div>
            <div className="space-y-2">
              <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">📂 Categorías oficiales</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS_OFICIALES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setAlertCategorias((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${alertCategorias.includes(cat) ? "bg-blue-500/20 border-blue-400/60 text-blue-300 font-semibold" : "border-slate-600 text-slate-400 hover:border-blue-400/60 hover:text-blue-300"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">🔑 Palabras clave</p>
              <div className="flex gap-2">
                <input
                  className={`${inputCls} flex-1 text-sm px-3 py-1.5`}
                  placeholder="ej: diseño, señalética, marketing, evento..."
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                />
                <button
                  onClick={addKeyword}
                  className="bg-blue-500/20 border border-blue-400/60 text-blue-300 text-sm px-4 py-1.5 rounded-lg font-semibold hover:bg-blue-500/30 transition-colors"
                >
                  + Agregar
                </button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-6">
                {alertKeywords.length === 0
                  ? <p className="text-slate-500 text-xs italic">Agrega palabras clave para recibir alertas personalizadas</p>
                  : alertKeywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs px-2.5 py-0.5 rounded-full">
                      {kw}
                      <button onClick={() => setAlertKeywords((prev) => prev.filter((k) => k !== kw))} className="text-slate-500 hover:text-red-400 transition-colors leading-none">✕</button>
                    </span>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {[
            { label: "Total",        value: stats.total,         color: "text-slate-300"   },
            { label: "Abiertas",     value: stats.open,          color: "text-emerald-400" },
            { label: "Cerradas",     value: stats.closed,        color: "text-red-400"     },
            { label: "Urgentes",     value: stats.urgent,        color: "text-orange-400"  },
            { label: "Favoritos",    value: stats.favorites,     color: "text-pink-400"    },
            { label: "Licitaciones", value: stats.licitaciones,  color: "text-blue-400"    },
            { label: "C. Ágiles",    value: stats.comprasAgiles, color: "text-amber-400"   },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-xs font-medium ${color} mb-1`}>{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* MAIN GRID */}
        <div className="flex gap-5">

          {/* SIDEBAR */}
          <aside className="hidden sm:flex flex-col gap-1 w-44 shrink-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Estado</p>
            {[
              { val: "all" as const,    label: "Todas",    dot: "bg-slate-500"   },
              { val: "open" as const,   label: "Abiertas", dot: "bg-emerald-400" },
              { val: "closed" as const, label: "Cerradas", dot: "bg-red-400"     },
            ].map(({ val, label, dot }) => (
              <button
                key={val}
                onClick={() => setStatus(val)}
                className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${status === val ? "bg-slate-800 border-slate-600 text-slate-100" : "border-transparent text-slate-400 hover:bg-slate-800/50"}`}
              >
                <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")}></span>
                {label}
              </button>
            ))}

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Tipo</p>
            {[
              { val: "all" as const,         label: "Todos",        dot: "bg-slate-500" },
              { val: "licitacion" as const,  label: "Licitaciones", dot: "bg-blue-400"  },
              { val: "compra_agil" as const, label: "C. Ágiles",    dot: "bg-amber-400" },
            ].map(({ val, label, dot }) => (
              <button
                key={val}
                onClick={() => setTipoFiltro(val)}
                className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${tipoFiltro === val ? "bg-slate-800 border-slate-600 text-slate-100" : "border-transparent text-slate-400 hover:bg-slate-800/50"}`}
              >
                <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")}></span>
                {label}
              </button>
            ))}

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Monto ($)</p>
            {(["all", "micro", "pequeno", "mediano", "grande"] as const).map((val) => (
              <button
                key={val}
                onClick={() => setMontoRango(val)}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${montoRango === val ? "bg-slate-800 border-slate-600 text-slate-100" : "border-transparent text-slate-400 hover:bg-slate-800/50"}`}
              >
                {val === "all" ? "Cualquier monto" : RANGOS_MONTO[val].label}
              </button>
            ))}
            <p className="text-xs text-slate-600 mt-2 mb-1">O ingresa un rango:</p>
            <input
              type="number"
              placeholder="Mínimo"
              value={montoMin}
              onChange={(e) => { setMontoMin(e.target.value); setMontoRango("all"); }}
              className={`${inputCls} text-xs px-2.5 py-1.5 mb-1`}
            />
            <input
              type="number"
              placeholder="Máximo"
              value={montoMax}
              onChange={(e) => { setMontoMax(e.target.value); setMontoRango("all"); }}
              className={`${inputCls} text-xs px-2.5 py-1.5`}
            />
            {(montoMin || montoMax) && (
              <button
                onClick={() => { setMontoMin(""); setMontoMax(""); }}
                className="text-xs text-red-400 border border-red-400/30 rounded-lg py-1 mt-1 hover:bg-red-400/10 transition-colors"
              >
                Limpiar ✕
              </button>
            )}
          </aside>

          {/* LISTA */}
          <div className="flex-1 space-y-3 min-w-0">
            {filtered.slice(0, visible).length === 0 ? (
              <div className="text-center py-20 text-slate-500 text-sm">No se encontraron resultados</div>
            ) : (
              filtered.slice(0, visible).map((item) => {
                const isFav = favorites.includes(item.id);
                const s = getStatus(item.close);
                return (
                  <div
                    key={item.id}
                    className={`bg-slate-900 rounded-xl border p-4 flex justify-between gap-4 transition-colors ${item.isNew ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 hover:border-slate-700"}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {item.isNew && (
                        <span className="inline-block bg-amber-400 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full">✨ Nueva</span>
                      )}
                      <div className="flex items-start gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-slate-100 leading-snug flex-1 min-w-0">{item.title}</h3>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${item.tipo === "compra_agil" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-blue-500/15 text-blue-300 border-blue-500/30"}`}>
                          {item.tipo === "compra_agil" ? "Compra Ágil" : "Licitación"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{item.org}</p>
                      {item.monto && (
                        <p className="text-xs text-emerald-400 font-semibold">${item.monto.toLocaleString("es-CL")}</p>
                      )}
                      <div>
                        {s === "open"   && <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">● Abierta</span>}
                        {s === "urgent" && <span className="text-xs bg-orange-500/15 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full">● Urgente</span>}
                        {s === "closed" && <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">● Cerrada</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0 items-end">
                      <button
                        onClick={() => openLicitacion(item)}
                        className="text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Ver →
                      </button>
                      <button
                        onClick={() => toggleFavorite(item.id)}
                        className={`text-lg leading-none transition-colors ${isFav ? "text-pink-400" : "text-slate-600 hover:text-pink-400"}`}
                      >
                        {isFav ? "♥" : "♡"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { setSelected(null); setDetalle(null); }}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 flex-wrap">
              <h2 className="flex-1 text-base font-semibold leading-snug">{selected.title}</h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${selected.tipo === "compra_agil" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-blue-500/15 text-blue-300 border-blue-500/30"}`}>
                {selected.tipo === "compra_agil" ? "Compra Ágil" : "Licitación"}
              </span>
            </div>

            <p className="text-sm text-slate-400">{selected.org}</p>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">ID: {selected.id}</span>
              <button
                onClick={() => copyID(selected.id)}
                className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg hover:border-slate-500 transition-colors"
              >
                {copyFeedback ? "✓ Copiado" : "Copiar"}
              </button>
              <a
                href={selected.tipo === "compra_agil" ? getOrdenURL(selected.id) : getMercadoPublicoURL(selected.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-blue-500/10 border border-blue-500/30 text-blue-300 px-2.5 py-1 rounded-lg hover:bg-blue-500/20 transition-colors"
              >
                Ver en MercadoPublico ↗
              </a>
            </div>

            <div className="border-t border-slate-800" />

            {detalle ? (
              <div className="space-y-3">
                {selected.tipo === "compra_agil" ? (
                  ([
                    ["Creación",  (detalle as DetalleOC).FechaCreacion],
                    ["Estado",    (detalle as DetalleOC).Estado],
                    ["Monto",     (detalle as DetalleOC).MontoTotal ? `$${Number((detalle as DetalleOC).MontoTotal).toLocaleString("es-CL")}` : null],
                    ["Proveedor", (detalle as DetalleOC).Proveedor?.RazonSocial],
                  ] as [string, string | null | undefined][]).map(([label, value]) =>
                    value ? (
                      <div key={label} className="flex gap-3">
                        <span className="text-xs text-slate-500 w-24 shrink-0 pt-0.5">{label}</span>
                        <span className="text-sm text-slate-200 flex-1">{value}</span>
                      </div>
                    ) : null
                  )
                ) : (
                  ([
                    ["Cierre",      new Date(selected.close).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })],
                    ["Estado",      (detalle as DetalleLicitacion)?.Estado],
                    ["Monto",       (detalle as DetalleLicitacion)?.MontoEstimado ? `$${Number((detalle as DetalleLicitacion).MontoEstimado).toLocaleString("es-CL")}` : null],
                    ["Descripción", (detalle as DetalleLicitacion)?.Descripcion],
                    ["Publicación", (detalle as DetalleLicitacion)?.FechaPublicacion],
                  ] as [string, string | null | undefined][]).map(([label, value]) =>
                    value ? (
                      <div key={label} className="flex gap-3">
                        <span className="text-xs text-slate-500 w-24 shrink-0 pt-0.5">{label}</span>
                        <span className="text-sm text-slate-200 flex-1">{value}</span>
                      </div>
                    ) : null
                  )
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-slate-400 text-sm py-4">
                <div className="w-5 h-5 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin shrink-0" />
                Cargando detalle...
              </div>
            )}

            <div className="border-t border-slate-800 pt-3 flex gap-3 justify-end">
              <a
                href={selected.tipo === "compra_agil" ? getOrdenURL(selected.id) : getMercadoPublicoURL(selected.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm bg-blue-500/15 border border-blue-400/60 text-blue-300 px-4 py-2 rounded-lg hover:bg-blue-500/25 transition-colors"
              >
                🔗 Abrir en MercadoPublico
              </a>
              <button
                onClick={() => { setSelected(null); setDetalle(null); }}
                className="text-sm bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
