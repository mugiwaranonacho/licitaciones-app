import { useEffect, useMemo, useState } from "react";

type LicitacionAPI = {
  CodigoExterno: string;
  Nombre: string;
  FechaCierre: string;
  Comprador?: {
    NombreOrganismo: string;
  };
};

type Licitacion = {
  id: string;
  title: string;
  org: string;
  close: string;
};

export default function App() {
  const API_KEY = import.meta.env.VITE_API_KEY;

  const [data, setData] = useState<LicitacionAPI[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const [order, setOrder] = useState<"new" | "old">("new");
  const [loading, setLoading] = useState(true);

  const [visible, setVisible] = useState(20);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selected, setSelected] = useState<Licitacion | null>(null);
  const [detalle, setDetalle] = useState<any>(null);

  // ===================== STATUS =====================
  const getStatus = (date: string) => {
    const now = new Date();
    const close = new Date(date);
    const diff = (close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (diff < 0) return "closed";
    if (diff <= 3) return "urgent";
    return "open";
  };

  // ===================== COPY ID =====================
  const copyID = (id: string) => {
    navigator.clipboard.writeText(id);
    alert("ID copiado: " + id);
  };

  // ===================== FAVORITOS =====================
  useEffect(() => {
    const saved = localStorage.getItem("favorites");
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  // ===================== FETCH =====================
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const res = await fetch(
          `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?ticket=${API_KEY}`
        );

        const result = await res.json();
        setData(result.Listado || []);
      } catch (err) {
        console.error("Error listado:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [API_KEY]);

  // ===================== MAPEO =====================
  const mapped: Licitacion[] = useMemo(() => {
    return data.map((item) => ({
      id: item.CodigoExterno,
      title: item.Nombre,
      org: item.Comprador?.NombreOrganismo || "Sin organismo",
      close: item.FechaCierre,
    }));
  }, [data]);

  // ===================== FILTRO + ORDEN =====================
  const filtered = useMemo(() => {
    const now = new Date();

    let result = mapped.filter((item) =>
      item.title.toLowerCase().includes(search.toLowerCase())
    );

    const isClosed = (date: string) => new Date(date) < now;

    if (status === "open") result = result.filter((i) => !isClosed(i.close));
    if (status === "closed") result = result.filter((i) => isClosed(i.close));

    result.sort((a, b) => {
      const aTime = new Date(a.close).getTime();
      const bTime = new Date(b.close).getTime();
      return order === "new" ? bTime - aTime : aTime - bTime;
    });

    return result;
  }, [mapped, search, status, order]);

  // ===================== DASHBOARD STATS =====================
  const stats = useMemo(() => {
    let open = 0;
    let closed = 0;
    let urgent = 0;

    filtered.forEach((item) => {
      const s = getStatus(item.close);

      if (s === "open") open++;
      if (s === "closed") closed++;
      if (s === "urgent") urgent++;
    });

    return {
      total: filtered.length,
      open,
      closed,
      urgent,
      favorites: favorites.length,
    };
  }, [filtered, favorites]);

  // ===================== INFINITE SCROLL =====================
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200
      ) {
        setVisible((prev) => prev + 20);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ===================== FAVORITOS =====================
  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id)
        ? prev.filter((f) => f !== id)
        : [...prev, id]
    );
  };

  // ===================== DETALLE =====================
  const openLicitacion = async (item: Licitacion) => {
    setSelected(item);
    setDetalle(null);

    try {
      const res = await fetch(
        `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?ticket=${API_KEY}&codigo=${item.id}`
      );

      const data = await res.json();
      const detalleData = data?.Listado?.[0] || data;

      setDetalle(detalleData);
    } catch (err) {
      console.error("Error detalle:", err);
    }
  };

  // ===================== LOADING =====================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Cargando licitaciones...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">

      {/* HEADER */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-semibold">Licitaciones Ignacio Alvial</h1>

          <div className="flex gap-2 mt-2">
            <button onClick={() => setOrder("new")} className="px-3 py-1 bg-slate-800 rounded">
              🔽 Nuevas
            </button>
            <button onClick={() => setOrder("old")} className="px-3 py-1 bg-slate-800 rounded">
              🔼 Antiguas
            </button>
          </div>
        </div>

        <input
          className="bg-slate-800 px-4 py-2 rounded w-80"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* DASHBOARD */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-900 p-4 rounded-xl">
          <p className="text-sm text-slate-400">Total</p>
          <p className="text-xl font-bold">{stats.total}</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl">
          <p className="text-sm text-green-400">Abiertas</p>
          <p className="text-xl font-bold">{stats.open}</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl">
          <p className="text-sm text-red-400">Cerradas</p>
          <p className="text-xl font-bold">{stats.closed}</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl">
          <p className="text-sm text-yellow-400">Urgentes</p>
          <p className="text-xl font-bold">{stats.urgent}</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl">
          <p className="text-sm text-pink-400">Favoritos</p>
          <p className="text-xl font-bold">{stats.favorites}</p>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-4 gap-6">

        {/* SIDEBAR */}
        <div className="col-span-1 bg-slate-900 p-4 rounded-2xl">
          <button onClick={() => setStatus("all")} className="w-full mb-2 p-2 bg-slate-800 rounded">⚪ Todas</button>
          <button onClick={() => setStatus("open")} className="w-full mb-2 p-2 bg-slate-800 rounded">🟢 Abiertas</button>
          <button onClick={() => setStatus("closed")} className="w-full p-2 bg-slate-800 rounded">🔴 Cerradas</button>
        </div>

        {/* LISTA */}
        <div className="col-span-3 space-y-4">

          {filtered.slice(0, visible).map((item) => {
            const isFav = favorites.includes(item.id);
            const s = getStatus(item.close);

            return (
              <div key={item.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center">

                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-slate-400">{item.org}</p>

                  <div className="mt-2">
                    {s === "open" && <span className="text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded">🟢 Abierta</span>}
                    {s === "urgent" && <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-1 rounded">⏳ Urgente</span>}
                    {s === "closed" && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-1 rounded">🔴 Cerrada</span>}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openLicitacion(item)}
                    className="bg-blue-600 px-3 py-1 rounded-lg"
                  >
                    Ver
                  </button>

                  <button
                    onClick={() => toggleFavorite(item.id)}
                    className={`px-3 py-1 rounded ${
                      isFav ? "bg-red-600" : "bg-slate-700"
                    }`}
                  >
                    ❤️
                  </button>
                </div>
              </div>
            );
          })}

        </div>
      </div>

      {/* MODAL */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-slate-900 p-6 rounded-2xl w-[550px]">

            <h2 className="text-lg font-bold">{selected.title}</h2>
            <p className="text-sm text-slate-400">{selected.org}</p>

            <p className="mt-2 text-sm">
              🕒 Cierre: {new Date(selected.close).toLocaleDateString("es-CL")}
            </p>

            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              <span>ID: {selected.id}</span>
              <button
                onClick={() => copyID(selected.id)}
                className="bg-slate-700 px-2 py-1 rounded text-white"
              >
                Copiar
              </button>
            </div>

            <div className="mt-4 text-sm space-y-2">
              {detalle ? (
                <>
                  <p>📌 Estado: {detalle?.Estado || "No disponible"}</p>
                  <p>📄 {detalle?.Descripcion || "Sin descripción"}</p>
                  <p>
                    💰{" "}
                    {detalle?.MontoEstimado
                      ? `$${Number(detalle.MontoEstimado).toLocaleString("es-CL")}`
                      : "No disponible"}
                  </p>
                  <p>📅 {detalle?.FechaPublicacion || "No disponible"}</p>
                </>
              ) : (
                <p className="text-slate-500">Cargando detalle...</p>
              )}
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={() => {
                  setSelected(null);
                  setDetalle(null);
                }}
                className="bg-slate-700 px-3 py-1 rounded-lg"
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