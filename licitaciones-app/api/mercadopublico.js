export default async function handler(req, res) {
  const { endpoint, ...params } = req.query;

  const API_KEY = process.env.VITE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "API key no configurada" });
  }

  const endpoints = {
    licitaciones: "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json",
    ordenesdecompra: "https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json",
  };

  const base = endpoints[endpoint];
  if (!base) {
    return res.status(400).json({ error: "Endpoint inválido" });
  }

  const query = new URLSearchParams({ ticket: API_KEY, ...params });

  try {
    const response = await fetch(`${base}?${query}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Error MercadoPublico: ${response.status}` });
    }
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Error al conectar con MercadoPublico" });
  }
}
