export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, User-Agent",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    
    const url = new URL(request.url);

    // === LIMIT ENDPOINTS (cross-device daily usage) ===
    if (request.method === "POST" && url.pathname === "/limit/get") {
      let body;
      try { body = await request.json(); } catch(e) {
        return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      }
      const email = body?.email;
      const date = body?.date;
      if (!email || !date) return new Response(JSON.stringify({ success: false, error: "email and date required" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      try {
        const key = `limit_${email}_${date}`;
        const raw = await env.LIMITS.get(key);
        const usage = raw ? JSON.parse(raw) : { notes:0, quiz:0, mentor:0, interview:0 };
        return new Response(JSON.stringify({ success: true, usage, key }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      } catch(e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
      }
    }

    if (request.method === "POST" && url.pathname === "/limit/set") {
      let body;
      try { body = await request.json(); } catch(e) {
        return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      }
      const email = body?.email;
      const date = body?.date;
      const usage = body?.usage;
      if (!email || !date || !usage) return new Response(JSON.stringify({ success: false, error: "email, date, and usage required" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      try {
        const key = `limit_${email}_${date}`;
        await env.LIMITS.put(key, JSON.stringify(usage), { expirationTtl: 86400 });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      } catch(e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
      }
    }

    // === DEVICE SIGNUP ENDPOINTS ===
    if ((request.method === "POST" && url.pathname === "/device-signup/check") || (request.method === "POST" && url.pathname === "/device-signup/claim")) {
      let body;
      try { body = await request.json(); } catch(e) {
        return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      }
      if (url.pathname === "/device-signup/check") {
        const deviceId = String(body?.deviceId || "").trim();
        const weekKey = String(body?.weekKey || "").trim();
        const maxAllowed = Math.max(1, Math.min(Number(body?.maxAllowed || 2), 5));
        if (!deviceId || !weekKey) {
          return new Response(JSON.stringify({ success: false, error: "deviceId and weekKey required" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
        }
        try {
          const key = `device_signup_${deviceId}_${weekKey}`;
          const raw = await env.LIMITS.get(key);
          const data = raw ? JSON.parse(raw) : { count: 0, emails: [] };
          const count = Number(data?.count || 0);
          return new Response(JSON.stringify({
            success: true,
            allowed: count < maxAllowed,
            count,
            remaining: Math.max(0, maxAllowed - count),
            maxAllowed
          }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
        }
      }
      if (url.pathname === "/device-signup/claim") {
        const deviceId = String(body?.deviceId || "").trim();
        const weekKey = String(body?.weekKey || "").trim();
        const email = String(body?.email || "").trim().toLowerCase();
        const maxAllowed = Math.max(1, Math.min(Number(body?.maxAllowed || 2), 5));
        if (!deviceId || !weekKey || !email) {
          return new Response(JSON.stringify({ success: false, error: "deviceId, weekKey, and email required" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
        }
        try {
          const key = `device_signup_${deviceId}_${weekKey}`;
          const raw = await env.LIMITS.get(key);
          const data = raw ? JSON.parse(raw) : { count: 0, emails: [] };
          const emails = Array.isArray(data?.emails) ? data.emails : [];
          const alreadyExists = emails.includes(email);
          const count = Number(data?.count || 0);
          if (!alreadyExists && count >= maxAllowed) {
            return new Response(JSON.stringify({
              success: true,
              allowed: false,
              count,
              remaining: 0,
              maxAllowed
            }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
          }
          const nextEmails = alreadyExists ? emails : [...emails, email];
          const nextCount = alreadyExists ? count : count + 1;
          await env.LIMITS.put(key, JSON.stringify({
            count: nextCount,
            emails: nextEmails,
            updatedAt: Date.now()
          }), { expirationTtl: 60 * 60 * 24 * 8 });
          return new Response(JSON.stringify({
            success: true,
            allowed: true,
            count: nextCount,
            remaining: Math.max(0, maxAllowed - nextCount),
            maxAllowed
          }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
        }
      }
    }

    // === GET ALL USERS' DAILY USAGE (admin) ===
    if (request.method === "POST" && url.pathname === "/limit/all") {
      try {
        const prefix = `limit_`;
        const listResult = await env.LIMITS.list({ prefix });
        const all = {};
        for (const key of listResult.keys) {
          const raw = await env.LIMITS.get(key.name);
          if (raw) {
            all[key.name] = JSON.parse(raw);
          }
        }
        return new Response(JSON.stringify({ success: true, data: all }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      } catch(e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
      }
    }

    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json", ...cors } });

    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
    }

    try {
      if (url.pathname.includes("gemini-text")) {
        if (!env.GEMINI_API_KEY) return new Response(JSON.stringify({ success: false, error: "GEMINI_API_KEY missing" }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        const fp = body.systemMsg ? body.systemMsg + "\n\n" + (body.prompt || "") : (body.prompt || "");
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY, {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: fp }] }], generationConfig: { temperature: 0.3, maxOutputTokens: body.maxTok || 3500 } })
        });
        const d = await r.json();
        if (!r.ok) {
          return new Response(JSON.stringify({ success: false, error: d?.error?.message || "Gemini API error", code: r.status }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        }
        const resultText = d?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!resultText) {
          return new Response(JSON.stringify({ success: false, error: "Empty response from Gemini" }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        }
        return new Response(JSON.stringify({ text: resultText, success: true }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      }

      // === OPENROUTER ENDPOINT (story only) ===
      if (url.pathname.includes("/openrouter/chat/completions")) {
        if (!env.OPENROUTER_API_KEY) return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY missing" }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
        const isStream = body.stream === true;
        const or = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.OPENROUTER_API_KEY, "HTTP-Referer": "https://studyforge-ai.vinaypatel975562.workers.dev", "X-Title": "StudyForge AI" },
          body: JSON.stringify(body)
        });
        if(isStream && or.ok && or.body){
          return new Response(or.body, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", ...cors } });
        }
        let data;
        try { data = await or.json(); } catch (e) { data = { error: "OpenRouter error" }; }
        return new Response(JSON.stringify(data), { status: or.ok ? 200 : 500, headers: { "Content-Type": "application/json", ...cors } });
      }

      if (!env.GROQ_API_KEY) return new Response(JSON.stringify({ error: "GROQ_API_KEY missing" }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
      const isStream = body.stream === true;
      const gr = await fetch("https://api.groq.com" + url.pathname + url.search, {
        method: "POST", 
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
        body: JSON.stringify(body)
      });
      if(isStream && gr.ok && gr.body){
        return new Response(gr.body, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", ...cors } });
      }
      let data;
      try { data = await gr.json(); } catch (e) { data = { error: "Groq error" }; }
      return new Response(JSON.stringify(data), { status: gr.ok ? 200 : 500, headers: { "Content-Type": "application/json", ...cors } });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
    }
  },
};


