# Implementation Plan: Parallel Story + DeepSeek in Quiz & askAI

## Goal
3 changes in `index.html`, then commit + push.

---

## Change 1: Story — Parallel API calls (lines 7557-7637)

**Replace lines 7557-7637** with parallel code.

### Code to paste:
```javascript
window.__storyTimer = null;
  try{
let storyCountdown = 60;
window.__storyTimer = setInterval(function(){
storyCountdown--;
if(status) status.textContent = "⏳ " + Math.max(0, storyCountdown) + "s...";
if(storyCountdown < -30){ clearInterval(window.__storyTimer); }
}, 1000);
if(status) status.textContent = "⏳ 60s...";
window.__storyPlayTimeout = null;

// === PARALLEL: Fire all 3 APIs at once, same rich prompt ===
let geminiStory = null, deepseekStory = null, openrouterStory = null;
let geminiWorking = false, deepseekWorking = false, openrouterWorking = false;
const sysMsg = "You are a fun storyteller for kids. Be cheerful. " + langInstr;

const geminiP = (async () => {
  try {
    const result = await Promise.race([
      askGemini(prompt, sysMsg, 4096, sig),
      new Promise(r => setTimeout(() => r(null), 60000))
    ]);
    if(result && !sig.aborted){ geminiStory = result; geminiWorking = true; }
  } catch(e) { if(e?.name === "AbortError") return; }
})();

const deepseekP = (async () => {
  try {
    const result = await askDeepSeekStream(prompt, sysMsg, 4096, sig, function(chunk, full){
      if(content && !sig.aborted && !geminiStory){
        content.innerHTML = full.replace(/\n/g, "<br>");
      }
    });
    if(result && !sig.aborted){ deepseekStory = result; deepseekWorking = true; }
  } catch(e) {}
})();

const openrouterP = (async () => {
  try {
    const result = await askOpenRouterStream(prompt, sysMsg, 4096, sig, function(chunk, full){
      if(content && !sig.aborted && !geminiStory && !deepseekStory){
        content.innerHTML = full.replace(/\n/g, "<br>");
      }
    });
    if(result && !sig.aborted){ openrouterStory = result; openrouterWorking = true; }
  } catch(e) {}
})();

await Promise.allSettled([geminiP, deepseekP, openrouterP]);
if(sig.aborted) return;

// Priority: Gemini → DeepSeek → OpenRouter
let storyText = null;
if(geminiWorking && geminiStory){
  storyText = geminiStory;
  __lastApiSource = "gemini";
  __storyContentLang = lang;
} else if(deepseekWorking && deepseekStory){
  storyText = deepseekStory;
  __lastApiSource = "deepseek";
  __storyContentLang = lang;
} else if(openrouterWorking && openrouterStory){
  storyText = openrouterStory;
  __lastApiSource = "openrouter";
  __storyContentLang = lang;
}
```

---

## Change 2: `askAI` — Add DeepSeek + timeout 12s→30s (lines 4988-5056)

**Replace entire function** from line 4988 to 5056.

### Code to paste:
```javascript
async function askAI(prompt, systemMsg, maxTok, modelName){
  if(!maxTok) maxTok = 8192;
  if(!modelName) modelName = "llama-3.1-8b-instant";
  
  const messages = systemMsg ? [
    {role:"system",content:systemMsg},
    {role:"user",content:prompt}
  ] : [
    {role:"user",content:prompt}
  ];
  
  console.log("🤖 === askAI called ===");
  
  // 1. Gemini with 30s timeout
  console.log("   🌐 Trying Gemini (30s timeout)...");
  const geminiController = new AbortController();
  const geminiTimer = setTimeout(() => { try{geminiController.abort()}catch(e){} }, 30000);
  try{
    const geminiResult = await askGemini(prompt, systemMsg, maxTok, geminiController.signal);
    clearTimeout(geminiTimer);
    if(geminiResult){
      console.log("   ✅ Gemini success!");
      __lastApiSource = "gemini";
      return geminiResult;
    }
  }catch(gemErr){
    clearTimeout(geminiTimer);
    if(gemErr.name !== "AbortError") console.log("   ❌ Gemini error:", gemErr.message);
    else console.log("   ⏱ Gemini timed out, switching...");
  }
  
  // 2. DeepSeek fallback
  console.log("   🔄 Trying DeepSeek...");
  try{
    const deepseekResult = await askDeepSeek(prompt, systemMsg, maxTok);
    if(deepseekResult){
      console.log("   ✅ DeepSeek success!");
      __lastApiSource = "deepseek";
      return deepseekResult;
    }
  }catch(dsErr){
    console.log("   ❌ DeepSeek error:", dsErr.message);
  }
  
  // 3. Groq fallback with 25s timeout
  console.log("   🔄 Trying Groq fallback (25s timeout)...");
  const groqController = new AbortController();
  const groqTimer = setTimeout(() => { try{groqController.abort()}catch(e){} }, 25000);
  try{
    const response = await fetch(WORKER_URL + "/openai/v1/chat/completions",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        model:modelName || "llama-3.1-8b-instant",
        messages,
        temperature:0.3,
        max_tokens:maxTok,
      }),
      signal: groqController.signal
    });
    clearTimeout(groqTimer);
    
    if(response.ok){
      const data = await response.json();
      if(data?.choices?.[0]){
        console.log("   ✅ Groq success!");
        __lastApiSource = "groq";
        return data.choices[0].message.content;
      }
    }
    console.log("   ❌ Groq failed with status:", response.status);
  }catch(workerErr){
    clearTimeout(groqTimer);
    console.log("   ❌ Groq error:", workerErr.message);
  }
  
  console.log("   🧠 All APIs failed.");
  __lastApiSource = "none";
  return null;
}
```

---

## Change 3: Quiz — Add Gemini + DeepSeek before Groq (lines 8533-8541)

**Replace lines 8533-8541** with new code.

### Code to paste:
```javascript
let aiResult;
try{
  // 1. Gemini with 30s
  const gemCtrl = new AbortController();
  const gemTim = setTimeout(() => { try{gemCtrl.abort()}catch(e){} }, 30000);
  aiResult = await askGemini(prompt, "You are a quiz generator.", Math.min(chunkCount * 400 + 1000, 16000), gemCtrl.signal);
  clearTimeout(gemTim);
}catch(e){
  aiResult = null;
}
if(!aiResult){
  // 2. DeepSeek
  try{
    aiResult = await askDeepSeek(prompt, "You are a quiz generator.", Math.min(chunkCount * 400 + 1000, 16000));
  }catch(e){ aiResult = null; }
}
if(!aiResult){
  // 3. Groq with 25s
  try{
    const groqCtrl = new AbortController();
    const groqTim = setTimeout(() => { try{groqCtrl.abort()}catch(e){} }, 25000);
    aiResult = await askGroq(prompt, "You are a quiz generator.", Math.min(chunkCount * 400 + 1000, 16000), "llama-3.1-8b-instant", groqCtrl.signal);
    clearTimeout(groqTim);
  }catch(e){
    aiResult = null;
  }
}
```

---

## Deploy

```powershell
git add index.html; if($?){ git commit -m "feat: parallel story, DeepSeek in quiz+askAI, Gemini 30s timeout" }
git push
```

---

## Summary
| Feature | 1st | 2nd | 3rd |
|---|---|---|---|
| Story | Gemini (60s) | DeepSeek (parallel) | OpenRouter (parallel) |
| Quiz | Gemini (30s) | DeepSeek | Groq (25s) |
| Mentor | Gemini (30s) | DeepSeek | Groq (25s) |
| Interview | Gemini (30s) | DeepSeek | Groq (25s) |
| Notes | Gemini (40s) | DeepSeek | Groq |
