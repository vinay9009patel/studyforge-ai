export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json", ...cors } });

    const url = new URL(request.url);
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
    }

    try {
      if (url.pathname.includes("gemini-image")) {
        if (!env.GEMINI_API_KEY) return new Response(JSON.stringify({ success: false, error: "GEMINI_API_KEY missing" }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=" + env.GEMINI_API_KEY, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Create an educational illustration: " + (body.prompt || "") }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } })
        });
        const d = await r.json();
        if (!r.ok) {
          return new Response(JSON.stringify({ success: false, error: d?.error?.message || "Gemini API error" }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        }
        const parts = d?.candidates?.[0]?.content?.parts || [];
        let img = "", alt = "";
        for (const p of parts) { if (p.inlineData) img = p.inlineData.data; if (p.text) alt = p.text; }
        return new Response(JSON.stringify({ imageBase64: img, altText: alt, success: !!img }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      }

      if (url.pathname.includes("gemini-text")) {
        if (!env.GEMINI_API_KEY) return new Response(JSON.stringify({ success: false, error: "GEMINI_API_KEY missing" }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        const fp = body.systemMsg ? body.systemMsg + "\n\n" + (body.prompt || "") : (body.prompt || "");
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: fp }] }], generationConfig: { temperature: 0.3, maxOutputTokens: body.maxTok || 3500 } })
        });
        const d = await r.json();
        return new Response(JSON.stringify({ text: d?.candidates?.[0]?.content?.parts?.[0]?.text || "", success: true }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      }

      if (!env.GROQ_API_KEY) return new Response(JSON.stringify({ error: "GROQ_API_KEY missing" }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
      const gr = await fetch("https://api.groq.com" + url.pathname + url.search, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
        body: JSON.stringify(body)
      });
      let data;
      try { data = await gr.json(); } catch (e) { data = { error: "Groq error" }; }
      return new Response(JSON.stringify(data), { status: gr.ok ? 200 : 500, headers: { "Content-Type": "application/json", ...cors } });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
    }
  },
};
