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

    if (url.pathname.includes("gemini-image")) {
      const body = await request.json();
      const prompt = body.prompt || "Generate an educational diagram";

      const geminiBody = {
        contents: [{
          parts: [{ text: `Create an educational illustration for study purposes: ${prompt}. Make it clear, professional, and visually informative with good composition and labeling.` }]
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      };

      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        }
      );

      const geminiData = await geminiResp.json();
      const parts = geminiData?.candidates?.[0]?.content?.parts || [];
      let imageBase64 = "";
      let altText = "";

      for (const part of parts) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
        }
        if (part.text) {
          altText = part.text;
        }
      }

      return new Response(JSON.stringify({ imageBase64, altText, success: !!imageBase64 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const groqUrl = `https://api.groq.com${url.pathname}${url.search}`;

    const body = await request.json();

    const response = await fetch(groqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  },
};
