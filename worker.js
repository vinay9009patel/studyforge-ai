export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, User-Agent",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    
    const url = new URL(request.url);

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
        
        if (env.GEMINI_API_KEY) {
          const models = [
            "gemini-2.0-flash-exp-image-generation",
            "gemini-2.5-flash",
            "gemini-2.5-pro"
          ];
          
          for (const model of models) {
            try {
              const genConfig = model.includes("exp-image") ? {} : { responseModalities: ["IMAGE", "TEXT"] };
              const bodyData = { contents: [{ parts: [{ text: "Create a photorealistic educational image: " + prompt }] }] };
              if (Object.keys(genConfig).length) bodyData.generationConfig = genConfig;
              
              const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyData)
              });
              
              const d = await r.json();
              if (!r.ok) continue;
              
              const parts = d?.candidates?.[0]?.content?.parts || [];
              let img = "", alt = "";
              for (const p of parts) { if (p.inlineData) img = p.inlineData.data; if (p.text) alt = p.text; }
              
              if (img) {
                return new Response(JSON.stringify({ 
                  imageBase64: img, 
                  altText: alt, 
                  success: true, 
                  modelUsed: model,
                  source: "gemini"
                }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
              }
            } catch (e) { continue; }
          }
        }
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: "All image sources failed: " + (wikimediaResult?.error || "unknown"),
          fallback: "canvas",
          searchQuery: extractKeywords(prompt)
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
      const gr = await fetch("https://api.groq.com" + url.pathname + url.search, {
        method: "POST", 
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
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
    const searchQuery = extractKeywords(prompt);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilimit=5`;
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "StudyForge-AI/1.0 (https://github.com/vinay9009patel/studyforge-ai; vinaypatel975562@gmail.com)",
        "Accept": "application/json"
      }
    });
    
    if (!response.ok) {
      return { success: false, error: "Wikipedia API status: " + response.status + " for query: " + searchQuery };
    }
    
    const data = await response.json();
    
    if (data && data.query && data.query.pages) {
      const pages = Object.values(data.query.pages);
      
      for (const page of pages) {
        if (page.thumbnail && page.thumbnail.source) {
          return {
            success: true,
            imageUrl: page.thumbnail.source,
            thumbnailUrl: page.thumbnail.source,
            title: page.title,
            pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
            width: page.thumbnail?.width || 600,
            height: page.thumbnail?.height || 400
          };
        }
      }
      return { success: false, error: "No images found in results for: " + searchQuery };
    }
    
    return { success: false, error: "Invalid response structure" };
  } catch (e) {
    return { success: false, error: "Exception: " + e.message };
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
