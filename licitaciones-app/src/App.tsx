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
  descripcion?: string;
  isNew?: boolean;
  categoria?: string;
  esRelevante?: boolean;
};

type Alerta = {
  id: string;
  nombre: string;
  keywords: string[];
  categorias: string[];
  montoMin: number | null;
  activa: boolean;
};

// ── CATEGORÍAS PARA RUBRO DISEÑO/MARKETING ──────────────────────────────────

const CATEGORIAS_RUBRO = [
  { id: "diseno",      label: "🎨 Diseño Gráfico",        keywords: ["diseño gráfico", "branding", "identidad visual", "logotipo", "logo", "gráfica", "ilustración", "infografía", "material gráfico", "diseño visual", "diseño de imagen", "diseño comunicacional", "diseño editorial", "papelería institucional", "imagen institucional"] },
  { id: "marketing",   label: "📢 Marketing y Publicidad", keywords: ["marketing", "publicidad", "campaña publicitaria", "pauta", "plan de medios", "medios de comunicación", "redes sociales", "community manager", "seo", "sem", "influencer", "difusión", "comunicacional", "relaciones públicas", "prensa", "imagen corporativa", "plan comunicacional", "estrategia comunicacional"] },
  { id: "imprenta",    label: "🖨️ Impresión y Señalética", keywords: ["impresión", "imprenta", "señalética", "gigantografía", "letrero", "banner", "vinilo", "ploteo", "cartelería", "rotulación", "material impreso", "folletería", "folleto", "afiche", "díptico", "tríptico", "lienzo", "pasacalle", "roller", "lona", "tótem", "pendón", "pvc impreso", "material publicitario impreso"] },
  { id: "pop",         label: "📦 Material POP",           keywords: ["material pop", "pop ", "merchandising", "artículo promocional", "souvenir", "regalo corporativo", "bolsa corporativa", "artículos promocionales", "objetos de premiación", "trofeo", "medalla", "galvano", "placa recordatoria", "implementos deportivos", "premiación"] },
  { id: "eventos",     label: "🎪 Eventos y Producción",   keywords: ["evento", "producción de evento", "montaje", "stand", "feria", "exposición", "congreso", "lanzamiento", "activación", "ceremonia", "producción artística", "servicio artístico", "animación de evento", "organización de evento"] },
  { id: "mobiliario",  label: "🪑 Mobiliario",             keywords: ["mobiliario", "mueble", "silla", "escritorio", "estantería", "locker", "archivador", "mesa de trabajo", "recepción", "modular", "panel divisorio", "mobiliario de oficina"] },
  { id: "tecnologia",  label: "🖥️ Equipamiento TI",        keywords: ["computador", "laptop", "notebook", "tablet", "monitor", "impresora", "escáner", "proyector", "pantalla interactiva", "hardware", "equipamiento tecnológico", "equipos informáticos", "periférico", "licencia software", "software de diseño"] },
  { id: "audiovisual", label: "🎬 Audiovisual",            keywords: ["video", "audiovisual", "fotografía", "filmación", "edición de video", "animación", "motion graphics", "streaming", "producción audiovisual", "registro fotográfico", "registro audiovisual", "spot", "cápsula audiovisual"] },
  { id: "web",         label: "💻 Web y Desarrollo",       keywords: ["sitio web", "página web", "desarrollo web", "aplicación web", "plataforma digital", "e-commerce", "ux", "ui", "soporte técnico web", "diseño web", "portal web"] },
  { id: "consultoria", label: "💼 Consultoría Creativa",   keywords: ["consultoría de comunicaciones", "asesoría comunicacional", "estrategia de comunicaciones", "consultoría de imagen", "plan de marketing", "consultoría creativa", "servicio integral de monitoreo", "monitoreo de medios", "análisis de medios", "inteligencia de medios"] },
];

// Keywords que indican que NO es del rubro (aunque contengan palabras como "diseño")
const KEYWORDS_EXCLUIR = [
  "pavimentación", "pavimento", "alcantarillado", "agua potable", "sanitario", "ptas",
  "hidráulico", "hidrología", "aguas lluvia", "drenaje", "aguas servidas",
  "obra civil", "construcción", "edificio", "edificación", "infraestructura vial",
  "skatepark", "plaza", "área verde", "parque", "remodelación", "mejoramiento de infraestructura",
  "hospitalario", "insumo médico", "clínico", "fármaco", "medicamento", "vaporizador", "artroscopia",
  "gimnasio municipal", "caballeriza",
  "eficiencia energética", "fotovoltaico", "bess", "batería de litio",
  "geología", "topografía", "suelo",
];

const esRelevanteRubro = (titulo: string, descripcion?: string): boolean => {
  const texto = (titulo + " " + (descripcion || "")).toLowerCase();
  // Si tiene keywords de exclusión claras, descartar
  return !KEYWORDS_EXCLUIR.some((kw) => texto.includes(kw));
};

const getCategoriaItem = (titulo: string, descripcion?: string) => {
  // Buscar en título con mayor peso, luego descripción
  const tituloLower = titulo.toLowerCase();
  const descLower = (descripcion || "").toLowerCase();

  for (const cat of CATEGORIAS_RUBRO) {
    // Primero buscar en título
    if (cat.keywords.some((kw) => tituloLower.includes(kw))) return cat;
  }
  for (const cat of CATEGORIAS_RUBRO) {
    // Luego buscar en descripción
    if (cat.keywords.some((kw) => descLower.includes(kw))) return cat;
  }
  return null;
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

// Días restantes hasta cierre
const getDiasRestantes = (fecha: string) => {
  const diff = (new Date(fecha).getTime() - Date.now()) / 86400000;
  return Math.ceil(diff);
};

const getDiasLabel = (dias: number) => {
  if (dias < 0) return null;
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "1 día";
  return `${dias} días`;
};

// ── HELPERS localStorage ──────────────────────────────────────────────────────

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
  } catch {}
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
  const [licitaciones, setLicitaciones] = useState<LicitacionAPI[]>([]);
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompraAPI[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LicitacionAPI[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const [order, setOrder] = useState<"new" | "old" | "monto_asc" | "monto_desc">("new");
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Iniciando...");
  const [visible, setVisible] = useState(20);
  const [favorites, setFavorites] = useState<string[]>(() => lsGet("favorites", []));
  const [vistaFavoritos, setVistaFavoritos] = useState(false);
  const [selected, setSelected] = useState<Licitacion | null>(null);
  const [detalle, setDetalle] = useState<Detalle>(null);
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [montoRango, setMontoRango] = useState<"all" | "micro" | "pequeno" | "mediano" | "grande">("all");
  const [tipoFiltro, setTipoFiltro] = useState<"all" | "licitacion" | "compra_agil">("all");
  const [filtrarNoRelevantes, setFiltrarNoRelevantes] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("all");
  const [newAlerts, setNewAlerts] = useState<string[]>([]);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // ── ALERTAS MEJORADAS ─────────────────────────────────────────────────────
  const [alertas, setAlertas] = useState<Alerta[]>(() => lsGet("alertasV2", []));
  const alertasRef = useRef<Alerta[]>([]);
  useEffect(() => { alertasRef.current = alertas; }, [alertas]);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [editingAlerta, setEditingAlerta] = useState<Alerta | null>(null);
  const [newAlertaNombre, setNewAlertaNombre] = useState("");
  const [newAlertaKeyword, setNewAlertaKeyword] = useState("");
  const [newAlertaKeywords, setNewAlertaKeywords] = useState<string[]>([]);
  const [newAlertaCategorias, setNewAlertaCategorias] = useState<string[]>([]);
  const [newAlertaMontoMin, setNewAlertaMontoMin] = useState("");

  // ── PERSISTENCIA ─────────────────────────────────────────────────────────
  useEffect(() => { lsSet("favorites", favorites); }, [favorites]);
  useEffect(() => { lsSet("alertasV2", alertas); }, [alertas]);

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

  // ── PAGINACIÓN ────────────────────────────────────────────────────────────

  const fetchConRetry = async (url: string, intentos = 3): Promise<Response | null> => {
    for (let i = 0; i < intentos; i++) {
      const res = await fetch(url);
      if (res.status === 429) {
        console.warn(`429 en intento ${i + 1}, esperando ${(i + 1) * 5}s...`);
        await new Promise((r) => setTimeout(r, (i + 1) * 5000));
        continue;
      }
      return res;
    }
    return null;
  };

  const fetchLicitacionesPaginadas = async (): Promise<LicitacionAPI[]> => {
    const acumulado: LicitacionAPI[] = [];
    const idsVistos = new Set<string>();

    setLoadingMsg("Cargando licitaciones recientes...");
    try {
      // La API acepta estado como código numérico: 5 = publicada
      const res = await fetchConRetry(`/api/mercadopublico?endpoint=licitaciones`);
      console.log("📡 HTTP status licitaciones:", res?.status);
      if (res && res.ok) {
        const data = await res.json();
        console.log("📦 Respuesta API licitaciones:", JSON.stringify(data).slice(0, 300));
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

    return acumulado;
  };

  // ── BÚSQUEDA EN API ───────────────────────────────────────────────────────

  const fetchSearch = useCallback(async (termino: string) => {
    if (!termino.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/mercadopublico?endpoint=licitaciones&estado=publicada&busqueda=${encodeURIComponent(termino)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.Listado || []);
      }
    } catch (err) {
      console.warn("Error búsqueda:", err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => fetchSearch(value), 600);
  };

  // ── FETCH PRINCIPAL ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingMsg("Conectando con MercadoPublico...");

      const [listadoLic, resOC] = await Promise.all([
        fetchLicitacionesPaginadas(),
        fetchConRetry(`/api/mercadopublico?endpoint=ordenesdecompra`),
      ]);

      setLoadingMsg("Cargando compras ágiles...");
      const dataOC = resOC && resOC.ok ? await resOC.json() : { Listado: [] };
      console.log("📦 Respuesta API OC:", JSON.stringify(dataOC).slice(0, 300));
      const listadoOC: OrdenCompraAPI[] = dataOC.Listado || [];

      // Detectar nuevas con alertas mejoradas
      if (prevIdsRef.current.size > 0 && alertasRef.current.some((a) => a.activa)) {
        const todasNombres: Record<string, { nombre: string; monto: number | null }> = {};
        listadoLic.forEach((i) => { todasNombres[i.CodigoExterno] = { nombre: i.Nombre, monto: i.MontoEstimado ? Number(i.MontoEstimado) : null }; });
        listadoOC.forEach((i) => { todasNombres[i.Codigo] = { nombre: i.Nombre, monto: i.MontoTotal ? Number(i.MontoTotal) : null }; });

        const nuevasIds: string[] = [];
        for (const [id, { nombre, monto }] of Object.entries(todasNombres)) {
          if (prevIdsRef.current.has(id)) continue;
          for (const alerta of alertasRef.current) {
            if (!alerta.activa) continue;
            const titulo = nombre.toLowerCase();
            const todosKw = [
              ...alerta.keywords,
              ...alerta.categorias.flatMap((cid) => CATEGORIAS_RUBRO.find((c) => c.id === cid)?.keywords || []),
            ];
            const match = todosKw.some((kw) => titulo.includes(kw.toLowerCase()));
            const montoOk = alerta.montoMin === null || monto === null || monto >= alerta.montoMin;
            if (match && montoOk) { nuevasIds.push(id); break; }
          }
        }

        if (nuevasIds.length > 0) {
          setNewAlerts(nuevasIds);
          setShowNewBadge(true);
        }
      }

      prevIdsRef.current = new Set([
        ...listadoLic.map((i) => i.CodigoExterno),
        ...listadoOC.map((i) => i.Codigo),
      ]);

      setLicitaciones(listadoLic);
      setOrdenesCompra(listadoOC);
      console.log("✅ Licitaciones cargadas:", listadoLic.length);
      console.log("✅ Órdenes de compra cargadas:", listadoOC.length);
    } catch (err) {
      console.error("Error fetch:", err);
      setLoadingMsg("Error al cargar datos. Reintentando...");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── MAPEO UNIFICADO ───────────────────────────────────────────────────────

  const mapped: Licitacion[] = useMemo(() => {
    // Si hay búsqueda activa, usar resultados de la API
    const fuenteLic = searchResults !== null ? searchResults : licitaciones;

    const lic: Licitacion[] = fuenteLic.map((item) => ({
      id: item.CodigoExterno,
      title: item.Nombre || "Sin nombre",
      org: item.Comprador?.NombreOrganismo || "—",
      close: item.FechaCierre,
      tipo: "licitacion",
      monto: item.MontoEstimado ? Number(item.MontoEstimado) : null,
      fechaPublicacion: item.FechaPublicacion || "",
      descripcion: item.Descripcion || "",
      isNew: newAlerts.includes(item.CodigoExterno),
      categoria: getCategoriaItem(item.Nombre, item.Descripcion)?.id,
      esRelevante: esRelevanteRubro(item.Nombre, item.Descripcion),
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
      categoria: getCategoriaItem(item.Nombre)?.id,
      esRelevante: true,
    }));

    return [...lic, ...oc];
  }, [licitaciones, ordenesCompra, newAlerts, searchResults]);

  // ── FILTROS ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const now = new Date();
    // Si hay búsqueda API activa, no filtrar por texto localmente (ya viene filtrado)
    let result = searchResults !== null
      ? mapped
      : mapped.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
    if (filtrarNoRelevantes && searchResults !== null) result = result.filter((i) => i.esRelevante !== false);
    if (vistaFavoritos) result = result.filter((i) => favorites.includes(i.id));
    if (status === "open") result = result.filter((i) => new Date(i.close) >= now);
    if (status === "closed") result = result.filter((i) => new Date(i.close) < now);
    if (tipoFiltro !== "all") result = result.filter((i) => i.tipo === tipoFiltro);
    if (categoriaFiltro !== "all") result = result.filter((i) => i.categoria === categoriaFiltro);
    if (montoMin) result = result.filter((i) => i.monto !== null && i.monto >= Number(montoMin));
    if (montoMax) result = result.filter((i) => i.monto !== null && i.monto <= Number(montoMax));
    if (montoRango !== "all") {
      const { min, max } = RANGOS_MONTO[montoRango];
      result = result.filter((i) => i.monto !== null && i.monto >= min && i.monto <= max);
    }
    result.sort((a, b) => {
      if (order === "monto_asc") return (a.monto ?? 0) - (b.monto ?? 0);
      if (order === "monto_desc") return (b.monto ?? 0) - (a.monto ?? 0);
      const diff = new Date(b.close).getTime() - new Date(a.close).getTime();
      return order === "new" ? diff : -diff;
    });
    result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    return result;
  }, [mapped, search, searchResults, filtrarNoRelevantes, status, order, tipoFiltro, categoriaFiltro, montoMin, montoMax, montoRango, vistaFavoritos, favorites]);

  // ── STATS ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let open = 0, closed = 0, urgent = 0, lic = 0, ca = 0;
    mapped.forEach((i) => {
      const s = getStatus(i.close);
      if (s === "open") open++;
      if (s === "closed") closed++;
      if (s === "urgent") urgent++;
      if (i.tipo === "licitacion") lic++;
      else ca++;
    });
    // Vencen esta semana
    const enSemana = mapped.filter((i) => {
      const d = getDiasRestantes(i.close);
      return d >= 0 && d <= 7;
    }).length;
    return { total: mapped.length, open, closed, urgent, licitaciones: lic, comprasAgiles: ca, favorites: favorites.length, enSemana };
  }, [mapped, favorites]);

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

  // ── EXPORTAR CSV ─────────────────────────────────────────────────────────

  const exportCSV = () => {
    const header = ["ID", "Título", "Organismo", "Tipo", "Monto", "Cierre", "Estado", "Categoría"];
    const rows = filtered.slice(0, visible).map((i) => {
      const s = getStatus(i.close);
      const cat = CATEGORIAS_RUBRO.find((c) => c.id === i.categoria)?.label || "—";
      return [
        i.id,
        `"${i.title.replace(/"/g, '""')}"`,
        `"${i.org.replace(/"/g, '""')}"`,
        i.tipo === "compra_agil" ? "Compra Ágil" : "Licitación",
        i.monto ? i.monto : "",
        new Date(i.close).toLocaleDateString("es-CL"),
        s === "open" ? "Abierta" : s === "urgent" ? "Urgente" : "Cerrada",
        cat,
      ].join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `licitaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── GESTIÓN DE ALERTAS ───────────────────────────────────────────────────

  const resetFormAlerta = () => {
    setNewAlertaNombre("");
    setNewAlertaKeyword("");
    setNewAlertaKeywords([]);
    setNewAlertaCategorias([]);
    setNewAlertaMontoMin("");
    setEditingAlerta(null);
  };

  const guardarAlerta = () => {
    if (!newAlertaNombre.trim()) return;
    if (editingAlerta) {
      setAlertas((prev) => prev.map((a) =>
        a.id === editingAlerta.id
          ? { ...a, nombre: newAlertaNombre.trim(), keywords: newAlertaKeywords, categorias: newAlertaCategorias, montoMin: newAlertaMontoMin ? Number(newAlertaMontoMin) : null }
          : a
      ));
    } else {
      const nueva: Alerta = {
        id: uid(),
        nombre: newAlertaNombre.trim(),
        keywords: newAlertaKeywords,
        categorias: newAlertaCategorias,
        montoMin: newAlertaMontoMin ? Number(newAlertaMontoMin) : null,
        activa: true,
      };
      setAlertas((prev) => [...prev, nueva]);
    }
    resetFormAlerta();
  };

  const editarAlerta = (a: Alerta) => {
    setEditingAlerta(a);
    setNewAlertaNombre(a.nombre);
    setNewAlertaKeywords(a.keywords);
    setNewAlertaCategorias(a.categorias);
    setNewAlertaMontoMin(a.montoMin ? String(a.montoMin) : "");
  };

  const toggleAlerta = (id: string) =>
    setAlertas((prev) => prev.map((a) => a.id === id ? { ...a, activa: !a.activa } : a));

  const eliminarAlerta = (id: string) =>
    setAlertas((prev) => prev.filter((a) => a.id !== id));

  const addKwAlerta = () => {
    const kw = newAlertaKeyword.trim().toLowerCase();
    if (kw && !newAlertaKeywords.includes(kw)) setNewAlertaKeywords((p) => [...p, kw]);
    setNewAlertaKeyword("");
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
              <h1 className="text-2xl font-bold tracking-tight">🗂️ Licitaciones</h1>
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
            <div className="flex gap-2 flex-wrap">
              {(["new", "old", "monto_desc", "monto_asc"] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setOrder(val)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${order === val ? "bg-blue-500/20 border-blue-500/60 text-blue-300" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                >
                  {val === "new" ? "Más recientes" : val === "old" ? "Más antiguas" : val === "monto_desc" ? "Mayor monto" : "Menor monto"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative">
              <input
                className={`${inputCls} text-sm px-3 py-2 w-64 pr-8`}
                placeholder="Buscar en Mercado Público..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {searchLoading && (
                <span className="absolute right-2.5 top-2.5 w-3.5 h-3.5 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
              )}
              {search && !searchLoading && (
                <button
                  onClick={() => { handleSearch(""); }}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 text-xs leading-none"
                >✕</button>
              )}
            </div>
            {searchResults !== null && (
              <span className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg whitespace-nowrap">
                🔍 {searchResults.length} resultados en API
              </span>
            )}
            <button
              onClick={() => { setVistaFavoritos((v) => !v); }}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${vistaFavoritos ? "bg-pink-500/20 border-pink-400/60 text-pink-300" : "border-slate-700 text-slate-300 hover:border-pink-400/60 hover:text-pink-300"}`}
            >
              ♥ Favoritos {favorites.length > 0 ? `(${favorites.length})` : ""}
            </button>
            <button
              onClick={() => setShowAlertConfig((v) => !v)}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${showAlertConfig ? "bg-amber-500/20 border-amber-400/60 text-amber-300" : "border-slate-700 text-slate-300 hover:border-amber-400/60 hover:text-amber-300"}`}
            >
              🔔 Alertas {alertas.filter((a) => a.activa).length > 0 ? `(${alertas.filter((a) => a.activa).length})` : ""}
            </button>
            <button
              onClick={exportCSV}
              className="text-sm px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-300 transition-colors whitespace-nowrap"
            >
              ↓ CSV
            </button>
          </div>
        </div>

        {/* PANEL ALERTAS MEJORADO */}
        {showAlertConfig && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 space-y-5">
            <div>
              <h3 className="text-amber-400 font-semibold text-sm mb-1">🔔 Mis Alertas</h3>
              <p className="text-slate-400 text-xs">Crea alertas personalizadas para tu rubro. Recibirás una notificación cuando aparezca algo relevante.</p>
            </div>

            {/* Lista de alertas existentes */}
            {alertas.length > 0 && (
              <div className="space-y-2">
                {alertas.map((alerta) => (
                  <div key={alerta.id} className={`flex items-start gap-3 p-3 rounded-lg border ${alerta.activa ? "bg-slate-800/60 border-slate-700" : "bg-slate-900/40 border-slate-800 opacity-60"}`}>
                    <button
                      onClick={() => toggleAlerta(alerta.id)}
                      className={`mt-0.5 w-8 h-4 rounded-full transition-colors shrink-0 relative ${alerta.activa ? "bg-amber-400" : "bg-slate-600"}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${alerta.activa ? "left-4" : "left-0.5"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{alerta.nombre}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {alerta.keywords.map((kw) => (
                          <span key={kw} className="text-xs bg-blue-500/15 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full">{kw}</span>
                        ))}
                        {alerta.categorias.map((cid) => {
                          const cat = CATEGORIAS_RUBRO.find((c) => c.id === cid);
                          return cat ? <span key={cid} className="text-xs bg-purple-500/15 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">{cat.label}</span> : null;
                        })}
                        {alerta.montoMin && (
                          <span className="text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full">≥ ${Number(alerta.montoMin).toLocaleString("es-CL")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => editarAlerta(alerta)} className="text-xs text-slate-400 hover:text-blue-300 transition-colors">✏️</button>
                      <button onClick={() => eliminarAlerta(alerta.id)} className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario nueva alerta / editar */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
              <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
                {editingAlerta ? "✏️ Editar alerta" : "➕ Nueva alerta"}
              </p>

              <input
                className={`${inputCls} w-full text-sm px-3 py-2`}
                placeholder="Nombre de la alerta (ej: Diseño Región Metropolitana)"
                value={newAlertaNombre}
                onChange={(e) => setNewAlertaNombre(e.target.value)}
              />

              {/* Categorías del rubro */}
              <div>
                <p className="text-slate-400 text-xs mb-2">Categorías de tu rubro:</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS_RUBRO.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setNewAlertaCategorias((prev) =>
                        prev.includes(cat.id) ? prev.filter((c) => c !== cat.id) : [...prev, cat.id]
                      )}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${newAlertaCategorias.includes(cat.id) ? "bg-purple-500/20 border-purple-400/60 text-purple-300 font-semibold" : "border-slate-600 text-slate-400 hover:border-purple-400/60 hover:text-purple-300"}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keywords adicionales */}
              <div>
                <p className="text-slate-400 text-xs mb-2">Palabras clave adicionales:</p>
                <div className="flex gap-2">
                  <input
                    className={`${inputCls} flex-1 text-sm px-3 py-1.5`}
                    placeholder="ej: municipalidad, región de O'Higgins..."
                    value={newAlertaKeyword}
                    onChange={(e) => setNewAlertaKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKwAlerta()}
                  />
                  <button
                    onClick={addKwAlerta}
                    className="bg-blue-500/20 border border-blue-400/60 text-blue-300 text-sm px-4 py-1.5 rounded-lg font-semibold hover:bg-blue-500/30 transition-colors"
                  >
                    + Agregar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {newAlertaKeywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs px-2.5 py-0.5 rounded-full">
                      {kw}
                      <button onClick={() => setNewAlertaKeywords((p) => p.filter((k) => k !== kw))} className="text-slate-500 hover:text-red-400 transition-colors">✕</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Monto mínimo */}
              <div>
                <p className="text-slate-400 text-xs mb-2">Monto mínimo (opcional):</p>
                <input
                  type="number"
                  className={`${inputCls} text-sm px-3 py-1.5 w-48`}
                  placeholder="ej: 1000000"
                  value={newAlertaMontoMin}
                  onChange={(e) => setNewAlertaMontoMin(e.target.value)}
                />
                {newAlertaMontoMin && (
                  <p className="text-xs text-emerald-400 mt-1">${Number(newAlertaMontoMin).toLocaleString("es-CL")}</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={guardarAlerta}
                  disabled={!newAlertaNombre.trim()}
                  className="bg-amber-500/20 border border-amber-400/60 text-amber-300 text-sm px-5 py-2 rounded-lg font-semibold hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editingAlerta ? "Guardar cambios" : "Crear alerta"}
                </button>
                {editingAlerta && (
                  <button onClick={resetFormAlerta} className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {[
            { label: "Total",        value: stats.total,         color: "text-slate-300"   },
            { label: "Abiertas",     value: stats.open,          color: "text-emerald-400" },
            { label: "Urgentes",     value: stats.urgent,        color: "text-orange-400"  },
            { label: "Esta semana",  value: stats.enSemana,      color: "text-yellow-400"  },
            { label: "Cerradas",     value: stats.closed,        color: "text-red-400"     },
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
          <aside className="hidden sm:flex flex-col gap-1 w-48 shrink-0">

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Filtros</p>
            <button
              onClick={() => setFiltrarNoRelevantes((v) => !v)}
              className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${filtrarNoRelevantes ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-slate-700 text-slate-400 hover:bg-slate-800/50"}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${filtrarNoRelevantes ? "bg-emerald-400" : "bg-slate-600"}`} />
              {filtrarNoRelevantes ? "Solo mi rubro ✓" : "Mostrar todos"}
            </button>

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Estado</p>
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
                <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")} />
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
                <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")} />
                {label}
              </button>
            ))}

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Categoría</p>
            <button
              onClick={() => setCategoriaFiltro("all")}
              className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${categoriaFiltro === "all" ? "bg-slate-800 border-slate-600 text-slate-100" : "border-transparent text-slate-400 hover:bg-slate-800/50"}`}
            >
              Todas
            </button>
            {CATEGORIAS_RUBRO.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaFiltro(cat.id)}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors leading-snug ${categoriaFiltro === cat.id ? "bg-slate-800 border-slate-600 text-slate-100" : "border-transparent text-slate-400 hover:bg-slate-800/50"}`}
              >
                {cat.label}
              </button>
            ))}

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">Monto ($)</p>
            {(["all", "micro", "pequeno", "mediano", "grande"] as const).map((val) => (
              <button
                key={val}
                onClick={() => setMontoRango(val)}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${montoRango === val ? "bg-slate-800 border-slate-600 text-slate-100" : "border-transparent text-slate-400 hover:bg-slate-800/50"}`}
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
            {vistaFavoritos && (
              <div className="text-xs text-pink-300 bg-pink-500/10 border border-pink-500/20 rounded-lg px-3 py-2">
                ♥ Mostrando {filtered.length} favorito{filtered.length !== 1 ? "s" : ""}
              </div>
            )}
            {filtered.slice(0, visible).length === 0 ? (
              <div className="text-center py-20 text-slate-500 text-sm">No se encontraron resultados</div>
            ) : (
              filtered.slice(0, visible).map((item) => {
                const isFav = favorites.includes(item.id);
                const s = getStatus(item.close);
                const dias = getDiasRestantes(item.close);
                const diasLabel = getDiasLabel(dias);
                const cat = CATEGORIAS_RUBRO.find((c) => c.id === item.categoria);
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
                      <div className="flex flex-wrap gap-2 items-center">
                        {item.monto && (
                          <span className="text-xs text-emerald-400 font-semibold">${item.monto.toLocaleString("es-CL")}</span>
                        )}
                        {cat && (
                          <span className="text-xs bg-purple-500/10 border border-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">{cat.label}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {s === "open"   && <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">● Abierta</span>}
                        {s === "urgent" && <span className="text-xs bg-orange-500/15 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full">● Urgente</span>}
                        {s === "closed" && <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">● Cerrada</span>}
                        {diasLabel && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${dias <= 3 ? "bg-orange-500/10 text-orange-300 border-orange-500/20" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                            ⏱ {diasLabel}
                          </span>
                        )}
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

            {/* Categoría en modal */}
            {selected.categoria && (() => {
              const cat = CATEGORIAS_RUBRO.find((c) => c.id === selected.categoria);
              return cat ? <span className="inline-block text-xs bg-purple-500/15 border border-purple-500/30 text-purple-300 px-2.5 py-0.5 rounded-full">{cat.label}</span> : null;
            })()}

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

            {/* Días restantes en modal */}
            {(() => {
              const dias = getDiasRestantes(selected.close);
              const label = getDiasLabel(dias);
              if (!label) return null;
              return (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg border ${dias <= 3 ? "bg-orange-500/10 text-orange-300 border-orange-500/20" : "bg-slate-800 text-slate-300 border-slate-700"}`}>
                  ⏱ Cierra en {label}
                </div>
              );
            })()}

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
