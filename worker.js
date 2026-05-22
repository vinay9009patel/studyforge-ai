export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const url = new URL(request.url);
    let body;

    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (url.pathname.includes("gemini-image")) {
      try {
        const prompt = body.prompt || "Generate an educational diagram";
        if (!env.GEMINI_API_KEY) {
          return new Response(JSON.stringify({ success: false, error: "GEMINI_API_KEY not configured" }), {
            status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const geminiBody = {
          contents: [{
            parts: [{ text: `Create an educational illustration for study purposes: ${prompt}. Make it clear, professional, and visually informative with good composition and labeling.` }]
          }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
        };
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${env.GEMINI_API_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
        );
        const geminiData = await geminiResp.json();
        const parts = geminiData?.candidates?.[0]?.content?.parts || [];
        let imageBase64 = "", altText = "";
        for (const p of parts) {
          if (p.inlineData) imageBase64 = p.inlineData.data;
          if (p.text) altText = p.text;
        }
        return new Response(JSON.stringify({ imageBase64, altText, success: !!imageBase64 }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    if (url.pathname.includes("gemini-text")) {
      try {
        const prompt = body.prompt || "";
        const systemMsg = body.systemMsg || "";
        const maxTok = body.maxTok || 3500;
        if (!env.GEMINI_API_KEY) {
          return new Response(JSON.stringify({ text: "", success: false, error: "GEMINI_API_KEY not configured" }), {
            status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        const fullPrompt = systemMsg ? `${systemMsg}\n\n${prompt}` : prompt;
        const geminiBody = {
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTok }
        };
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
        );
        const geminiData = await geminiResp.json();
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return new Response(JSON.stringify({ text, success: !!text }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(JSON.stringify({ text: "", success: false, error: e.message }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    try {
      if (!env.GROQ_API_KEY) {
        return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const groqUrl = `https://api.groq.com${url.pathname}${url.search}`;
      const response = await fetch(groqUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        responseData = { error: "Invalid response from Groq", status: response.status };
      }

      return new Response(JSON.stringify(responseData), {
        status: response.ok ? 200 : 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
