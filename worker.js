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

    if (request.method === "POST" && url.pathname === "/device-signup/check") {
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

    if (request.method === "POST" && url.pathname === "/device-signup/claim") {
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

    if (request.method === "GET" && url.pathname.includes("/test-image")) {
      const result = await searchWikimediaImage("binary search algorithm");
      return new Response(JSON.stringify(result), { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }

    if (request.method === "GET" && url.pathname.includes("/test-multi")) {
      const queries = ["binary search", "search algorithm", "divide and conquer algorithm", "array data structure", "computer science algorithm"];
      const result = await searchMultipleWikimediaImages(queries);
      return new Response(JSON.stringify(result), { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }

    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json", ...cors } });

    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
    }

    try {
      if (url.pathname.includes("gemini-image") || url.pathname.includes("image-search")) {
        const prompt = body.prompt || "education";
        
        if (body.queries && Array.isArray(body.queries)) {
          const result = await searchMultipleWikimediaImages(body.queries);
          return new Response(JSON.stringify(result), { 
            status: 200, 
            headers: { "Content-Type": "application/json", ...cors } 
          });
        }
        
        let pollResult = await generatePollinationsImage(prompt);
        if (pollResult && pollResult.success) {
          return new Response(JSON.stringify({ 
            imageBase64: pollResult.imageBase64, 
            altText: prompt, 
            success: true, 
            source: "pollinations"
          }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        }
        
        const wikimediaResult = await searchWikimediaImage(prompt);
        if (wikimediaResult && wikimediaResult.success) {
          return new Response(JSON.stringify({
            imageUrl: wikimediaResult.imageUrl,
            thumbnailUrl: wikimediaResult.thumbnailUrl,
            altText: wikimediaResult.title,
            success: true,
            source: "wikimedia",
            pageUrl: wikimediaResult.pageUrl
          }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
        }
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: "All image sources failed: " + (pollResult?.error || wikimediaResult?.error || "unknown"),
          fallback: "canvas"
        }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      }

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

function extractKeywords(prompt) {
  const stopWords = ["the", "a", "an", "is", "in", "on", "at", "to", "for", "with", "by", "from", "up", "out", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now", "create", "educational", "image", "photorealistic", "illustration", "diagram", "showing", "structure", "process", "concept", "topic", "about", "explain", "visual", "real", "world", "action", "what", "happens", "step", "during"];
  
  let keywords = (prompt || "science").toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w))
    .slice(0, 4);
  
  if (keywords.length === 0) keywords = ["science", "education"];
  
  return keywords.join(" ");
}

async function searchWikimediaImage(prompt) {
  try {
    const searchQuery = (prompt || "science")
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=5&gsrwhat=text&prop=pageimages|extracts&exintro&explaintext&exsentences=1&piprop=original|thumbnail&pithumbsize=800&pilimit=5`;
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "StudyForge-AI/1.0 (https://github.com/vinay9009patel/studyforge-ai; vinaypatel975562@gmail.com)",
        "Accept": "application/json"
      }
    });
    
    if (!response.ok) {
      return { success: false, error: "API status: " + response.status };
    }
    
    const data = await response.json();
    
    if (data && data.query && data.query.pages) {
      const pages = Object.values(data.query.pages);
      
      for (const page of pages) {
        let imgUrl = null;
        if (page.original && page.original.source) imgUrl = page.original.source;
        else if (page.thumbnail && page.thumbnail.source) imgUrl = page.thumbnail.source;
        
        if (imgUrl) {
          return {
            success: true,
            imageUrl: imgUrl,
            thumbnailUrl: imgUrl,
            title: page.title + ": " + (page.extract || "").substring(0, 100),
            pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
            width: (page.original || page.thumbnail || {}).width || 800,
            height: (page.original || page.thumbnail || {}).height || 600
          };
        }
      }
    }
    
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=800`;
    const cResp = await fetch(commonsUrl, {
      headers: { "User-Agent": "StudyForge-AI/1.0", "Accept": "application/json" }
    });
    if (cResp.ok) {
      const cData = await cResp.json();
      if (cData && cData.query && cData.query.pages) {
        const cPages = Object.values(cData.query.pages);
        for (const page of cPages) {
          const info = page.imageinfo && page.imageinfo[0];
          if (info && info.url) {
            return {
              success: true,
              imageUrl: info.thumburl || info.url,
              thumbnailUrl: info.thumburl || info.url,
              title: page.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
              pageUrl: info.descriptionurl || "",
              width: info.width || 800,
              height: info.height || 600
            };
          }
        }
      }
    }
    
    return { success: false, error: "No images found" };
  } catch (e) {
    return { success: false, error: "Exception: " + e.message };
  }
}

async function generatePollinationsImage(prompt) {
  try {
    const shortPrompt = prompt.split(",")[0].trim().substring(0, 80);
    const encoded = encodeURIComponent(shortPrompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=800&height=600&seed=${Math.floor(Math.random() * 10000)}`;
    
    const resp = await fetch(url, { signal: AbortSignal.timeout(55000) });
    if (!resp.ok) return { success: false, error: "Pollinations status: " + resp.status };
    
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("image")) return { success: false, error: "Not an image" };
    
    const buffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    let binary = "";
    uint8.forEach(byte => binary += String.fromCharCode(byte));
    return { success: true, imageBase64: btoa(binary) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function searchMultipleWikimediaImages(queries) {
  try {
    const results = [];
    
    for (const query of queries) {
      if (results.length >= 6) break;
      
      const result = await searchWikimediaImage(query);
      
      if (result.success) {
        const alreadyExists = results.some(r => r.title === result.title || r.imageUrl === result.imageUrl);
        if (!alreadyExists) {
          results.push({
            ...result,
            query: query,
            index: results.length
          });
        }
      }
    }
    
    return {
      success: results.length > 0,
      images: results,
      count: results.length
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      images: []
    };
  }
}
