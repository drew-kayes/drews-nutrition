import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = "https://xsgdvhfhibstymoriocw.supabase.co";
const SUPABASE_KEY = "sb_publishable_iJaYFSGQcNbEGdBr8sQC-A_rft4jxhS";
const USER_ID = "drew_kayes";

const TARGETS = { calories: 3000, protein: 190, carbs: 300, fat: 90 };

const db = async (path, method = "GET", body = null) => {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": method === "POST" ? "resolution=merge-duplicates" : "",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};

const analyzeMeal = async (base64Image, mediaType, description = "") => {
  const prompt = description
    ? `Analyze this meal. The user describes it as: "${description}". Estimate the nutritional content.`
    : "Analyze this meal photo and estimate the nutritional content.";

  const content = base64Image
    ? [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
        { type: "text", text: prompt + " Respond ONLY with a JSON object with these exact keys: {\"meal_name\": string, \"calories\": number, \"protein\": number, \"carbs\": number, \"fat\": number}. No markdown, no explanation, just the JSON." }
      ]
    : [{ type: "text", text: `The user describes a meal as: "${description}". Estimate the nutritional content. Respond ONLY with a JSON object: {\"meal_name\": string, \"calories\": number, \"protein\": number, \"carbs\": number, \"fat\": number}. No markdown, no explanation, just the JSON.` }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(d) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m)-1]} ${parseInt(day)}`;
}
function pct(val, target) { return Math.min(100, Math.round((val / target) * 100)); }

const G = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body, #root { height: 100%; background: #0a0a0e; }
    body { font-family: 'DM Sans', sans-serif; color: #f0f0f0; overflow-x: hidden; }
    input, button, textarea { font-family: 'DM Sans', sans-serif; }
    input, textarea { outline: none; }
    button { cursor: pointer; }
    button:active { opacity: 0.75; }
    ::-webkit-scrollbar { width: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2a2a38; border-radius: 2px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @keyframes barFill { from { width: 0%; } to { width: var(--w); } }
    .fadeup { animation: fadeUp 0.25s ease both; }
    .bar-animate { animation: barFill 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  `}</style>
);

export default function App() {
  const [screen, setScreen] = useState("home");
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today());

  useEffect(() => { loadMeals(); }, []);

  const loadMeals = async () => {
    setLoading(true);
    try {
      const data = await db(`/nutrition_logs?user_id=eq.${USER_ID}&order=logged_at.desc`);
      setMeals(data || []);
    } catch {
      setError("Could not load data.");
    }
    setLoading(false);
  };

  const saveMeal = async (meal) => {
    const record = { ...meal, user_id: USER_ID, id: `${USER_ID}_${Date.now()}`, logged_at: new Date().toISOString(), date: today() };
    await db("/nutrition_logs", "POST", record);
    await loadMeals();
  };

  const deleteMeal = async (id) => {
    await db(`/nutrition_logs?id=eq.${id}`, "DELETE");
    await loadMeals();
  };

  const todayMeals = meals.filter(m => m.date === selectedDate);
  const totals = todayMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  if (loading) return <><G /><Loader /></>;
  if (screen === "add") return <><G /><AddScreen onSave={async (m) => { await saveMeal(m); setScreen("home"); }} onBack={() => setScreen("home")} /></>;
  if (screen === "history") return <><G /><HistoryScreen meals={meals} onBack={() => setScreen("home")} /></>;

  return <><G /><HomeScreen totals={totals} meals={todayMeals} targets={TARGETS} onAdd={() => setScreen("add")} onHistory={() => setScreen("history")} onDelete={deleteMeal} selectedDate={selectedDate} setSelectedDate={setSelectedDate} error={error} onRetry={loadMeals} /></>;
}

function HomeScreen({ totals, meals, targets, onAdd, onHistory, onDelete, selectedDate, setSelectedDate, error, onRetry }) {
  const isToday = selectedDate === today();

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0e", paddingBottom: 100 }}>
      <div style={{ padding: "max(36px, env(safe-area-inset-top)) 20px 20px", background: "linear-gradient(180deg, #0f0f18 0%, #0a0a0e 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, letterSpacing: 4, color: "#444", textTransform: "uppercase", marginBottom: 4 }}>Drew's</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Nutrition</div>
          </div>
          <button onClick={onHistory} style={{ background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 10, color: "#888", fontSize: 12, padding: "8px 14px" }}>History</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().slice(0,10)); }}
            style={{ background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 8, color: "#666", width: 32, height: 32, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 600, color: isToday ? "#f0f0f0" : "#888" }}>
            {isToday ? "Today" : formatDate(selectedDate)}
          </div>
          <button onClick={() => { if (!isToday) { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().slice(0,10)); } }}
            style={{ background: isToday ? "#0a0a0e" : "#1a1a24", border: `1px solid ${isToday ? "#1a1a24" : "#2a2a38"}`, borderRadius: 8, color: isToday ? "#333" : "#666", width: 32, height: 32, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>
      </div>

      {error && (
        <div style={{ margin: "0 20px 16px", background: "#2a0d0d", border: "1px solid #5a1a1a", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#f87171", fontSize: 13 }}>{error}</span>
          <button onClick={onRetry} style={{ background: "none", border: "1px solid #5a1a1a", borderRadius: 6, color: "#f87171", fontSize: 12, padding: "3px 8px" }}>Retry</button>
        </div>
      )}

      <div style={{ padding: "0 20px" }} className="fadeup">
        <MacroRings totals={totals} targets={targets} />
        <MacroBars totals={totals} targets={targets} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#555" }}>Meals</div>
          {isToday && <button onClick={onAdd} style={{ background: "#1a2a4a", border: "1px solid #2a4a8a", borderRadius: 10, color: "#60a5fa", fontSize: 13, fontWeight: 600, padding: "8px 16px" }}>+ Add Meal</button>}
        </div>

        {meals.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#333" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🍽</div>
            <div style={{ fontSize: 14 }}>{isToday ? "No meals logged yet" : "No meals on this day"}</div>
            {isToday && <div style={{ fontSize: 13, color: "#2a2a38", marginTop: 6 }}>Tap + Add Meal to get started</div>}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {meals.map(meal => <MealCard key={meal.id} meal={meal} onDelete={() => onDelete(meal.id)} isToday={isToday} />)}
        </div>
      </div>

      {isToday && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))", background: "linear-gradient(0deg, #0a0a0e 60%, transparent)" }}>
          <button onClick={onAdd} style={{ width: "100%", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", border: "none", borderRadius: 14, color: "#fff", fontSize: 16, fontWeight: 700, padding: 16, fontFamily: "'Syne', sans-serif", letterSpacing: 0.5 }}>
            + Log a Meal
          </button>
        </div>
      )}
    </div>
  );
}

function MacroRings({ totals, targets }) {
  const calPct = pct(totals.calories, targets.calories);
  const protPct = pct(totals.protein, targets.protein);
  const remaining = targets.calories - totals.calories;

  return (
    <div style={{ background: "#0f0f18", border: "1px solid #1a1a28", borderRadius: 16, padding: "20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
      <Ring value={calPct} color="#f59e0b" size={80}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{Math.round(totals.calories)}</div>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>CAL</div>
        </div>
      </Ring>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
          {remaining > 0 ? <><span style={{ color: "#f0f0f0", fontWeight: 600 }}>{remaining}</span> cal remaining</> : <span style={{ color: "#f87171", fontWeight: 600 }}>Over by {Math.abs(remaining)}</span>}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>Target: {targets.calories} cal</div>
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ color: "#4ade80", fontWeight: 600 }}>{Math.round(totals.protein)}g</span>
          <span style={{ color: "#444" }}> / {targets.protein}g protein</span>
        </div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{protPct}% of daily goal</div>
      </div>
    </div>
  );
}

function Ring({ value, color, size, children }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a28" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

function MacroBars({ totals, targets }) {
  const macros = [
    { key: "protein", label: "Protein", unit: "g", color: "#4ade80", val: totals.protein, target: targets.protein },
    { key: "carbs", label: "Carbs", unit: "g", color: "#60a5fa", val: totals.carbs, target: targets.carbs },
    { key: "fat", label: "Fat", unit: "g", color: "#f59e0b", val: totals.fat, target: targets.fat },
  ];
  return (
    <div style={{ background: "#0f0f18", border: "1px solid #1a1a28", borderRadius: 16, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      {macros.map(m => {
        const p = pct(m.val, m.target);
        return (
          <div key={m.key}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "#888" }}>{m.label}</div>
              <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                <span style={{ color: m.color, fontWeight: 600 }}>{Math.round(m.val)}</span>
                <span style={{ color: "#444" }}> / {m.target}{m.unit}</span>
              </div>
            </div>
            <div style={{ height: 6, background: "#1a1a28", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p}%`, background: m.color, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MealCard({ meal, onDelete, isToday }) {
  const [confirm, setConfirm] = useState(false);
  const time = meal.logged_at ? new Date(meal.logged_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <div style={{ background: "#0f0f18", border: "1px solid #1a1a28", borderRadius: 14, overflow: "hidden" }} className="fadeup">
      {meal.image_url && <img src={meal.image_url} alt={meal.meal_name} style={{ width: "100%", height: 160, objectFit: "cover" }} />}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{meal.meal_name}</div>
            {time && <div style={{ fontSize: 11, color: "#444" }}>{time}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: "#f59e0b" }}>{meal.calories}</div>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>CAL</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["P", meal.protein, "#4ade80"], ["C", meal.carbs, "#60a5fa"], ["F", meal.fat, "#f59e0b"]].map(([l, v, c]) => (
            <div key={l} style={{ flex: 1, background: "#15151f", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c, fontFamily: "'DM Mono', monospace" }}>{Math.round(v)}g</div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 1, marginTop: 1 }}>{l === "P" ? "PROTEIN" : l === "C" ? "CARBS" : "FAT"}</div>
            </div>
          ))}
        </div>
        {isToday && (
          <div style={{ marginTop: 12 }}>
            {!confirm
              ? <button onClick={() => setConfirm(true)} style={{ background: "none", border: "none", color: "#444", fontSize: 12, padding: 0 }}>Delete</button>
              : <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#888" }}>Remove this meal?</span>
                  <button onClick={onDelete} style={{ background: "#2a0d0d", border: "1px solid #5a1a1a", borderRadius: 6, color: "#f87171", fontSize: 12, padding: "4px 10px" }}>Yes</button>
                  <button onClick={() => setConfirm(false)} style={{ background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 6, color: "#888", fontSize: 12, padding: "4px 10px" }}>No</button>
                </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}

function AddScreen({ onSave, onBack }) {
  const [mode, setMode] = useState("photo"); // photo | manual
  const [image, setImage] = useState(null); // { base64, mediaType, preview }
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const [manual, setManual] = useState({ meal_name: "", calories: "", protein: "", carbs: "", fat: "" });

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type;
      setImage({ base64, mediaType, preview: dataUrl });
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!image && !description.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await analyzeMeal(image?.base64 || null, image?.mediaType || null, description);
      setResult(res);
    } catch {
      setError("Could not analyze. Try again or enter manually.");
    }
    setAnalyzing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const meal = result
        ? { ...result, image_url: image?.preview || null }
        : { meal_name: manual.meal_name || "Meal", calories: parseInt(manual.calories) || 0, protein: parseFloat(manual.protein) || 0, carbs: parseFloat(manual.carbs) || 0, fat: parseFloat(manual.fat) || 0 };
      await onSave(meal);
    } catch {
      setError("Failed to save.");
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0e", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "max(20px, env(safe-area-inset-top)) 20px 16px", borderBottom: "1px solid #1a1a22", display: "flex", alignItems: "center", gap: 14, background: "#0f0f18" }}>
        <button onClick={onBack} style={{ background: "#1a1a24", border: "none", color: "#666", width: 36, height: 36, borderRadius: 9, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700 }}>Log a Meal</div>
      </div>

      <div style={{ display: "flex", padding: "16px 20px 0", gap: 10 }}>
        {["photo", "manual"].map(m => (
          <button key={m} onClick={() => { setMode(m); setResult(null); setError(null); }} style={{
            flex: 1, padding: "10px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600,
            background: mode === m ? "#1d4ed8" : "#1a1a24",
            color: mode === m ? "#fff" : "#666",
          }}>{m === "photo" ? "📷 Photo" : "✏️ Manual"}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {mode === "photo" && (
          <div className="fadeup">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />

            {!image ? (
              <button onClick={() => fileRef.current.click()} style={{ width: "100%", height: 200, background: "#0f0f18", border: "2px dashed #2a2a38", borderRadius: 16, color: "#444", fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <div style={{ fontSize: 40 }}>📷</div>
                <div>Tap to take a photo or upload</div>
                <div style={{ fontSize: 12, color: "#333" }}>Works with any meal, plate, or food</div>
              </button>
            ) : (
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                <img src={image.preview} alt="meal" style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }} />
                <button onClick={() => { setImage(null); setResult(null); }} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, fontSize: 14 }}>✕</button>
              </div>
            )}

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#444", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Description (optional)</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. grilled chicken breast, white rice, side of broccoli"
                rows={2} style={{ width: "100%", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, color: "#f0f0f0", fontSize: 14, padding: "12px 14px", resize: "none", outline: "none" }} />
            </div>

            {!result && (
              <button onClick={analyze} disabled={(!image && !description.trim()) || analyzing} style={{ width: "100%", background: (!image && !description.trim()) ? "#1a1a24" : "linear-gradient(135deg, #1d4ed8, #2563eb)", border: "none", borderRadius: 12, color: (!image && !description.trim()) ? "#444" : "#fff", fontSize: 15, fontWeight: 700, padding: 15, fontFamily: "'Syne', sans-serif" }}>
                {analyzing ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}><Spinner />Analyzing...</span> : "Analyze Meal"}
              </button>
            )}

            {error && <div style={{ marginTop: 12, background: "#2a0d0d", border: "1px solid #5a1a1a", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>{error}</div>}

            {result && <ResultEditor result={result} setResult={setResult} onSave={handleSave} saving={saving} onRetry={() => setResult(null)} />}
          </div>
        )}

        {mode === "manual" && (
          <div className="fadeup">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "meal_name", label: "Meal Name", placeholder: "e.g. Chicken & Rice", type: "text" },
                { key: "calories", label: "Calories", placeholder: "e.g. 650", type: "number" },
                { key: "protein", label: "Protein (g)", placeholder: "e.g. 48", type: "number" },
                { key: "carbs", label: "Carbs (g)", placeholder: "e.g. 72", type: "number" },
                { key: "fat", label: "Fat (g)", placeholder: "e.g. 12", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 7 }}>{f.label}</div>
                  <input type={f.type} inputMode={f.type === "number" ? "decimal" : "text"} placeholder={f.placeholder}
                    value={manual[f.key]} onChange={e => setManual(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, color: "#f0f0f0", fontSize: 16, padding: "12px 14px", fontFamily: "'DM Mono', monospace" }} />
                </div>
              ))}
            </div>
            {error && <div style={{ marginTop: 12, background: "#2a0d0d", border: "1px solid #5a1a1a", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>{error}</div>}
            <button onClick={handleSave} disabled={saving || !manual.meal_name} style={{ width: "100%", marginTop: 24, background: !manual.meal_name ? "#1a1a24" : "linear-gradient(135deg, #166534, #16a34a)", border: "none", borderRadius: 12, color: !manual.meal_name ? "#444" : "#fff", fontSize: 15, fontWeight: 700, padding: 15, fontFamily: "'Syne', sans-serif" }}>
              {saving ? "Saving..." : "Save Meal ✓"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultEditor({ result, setResult, onSave, saving, onRetry }) {
  const fields = [
    { key: "calories", label: "Calories", color: "#f59e0b" },
    { key: "protein", label: "Protein (g)", color: "#4ade80" },
    { key: "carbs", label: "Carbs (g)", color: "#60a5fa" },
    { key: "fat", label: "Fat (g)", color: "#f59e0b" },
  ];
  return (
    <div style={{ marginTop: 20 }} className="fadeup">
      <div style={{ background: "#0f1a0f", border: "1px solid #1a3a1a", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, fontFamily: "'Syne', sans-serif" }}>Analysis Complete -- Edit if Needed</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Meal Name</div>
          <input value={result.meal_name} onChange={e => setResult(p => ({ ...p, meal_name: e.target.value }))}
            style={{ width: "100%", background: "#15151f", border: "1px solid #2a2a38", borderRadius: 8, color: "#f0f0f0", fontSize: 14, padding: "10px 12px", outline: "none" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {fields.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 5 }}>{f.label}</div>
              <input type="number" inputMode="decimal" value={result[f.key]} onChange={e => setResult(p => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))}
                style={{ width: "100%", background: "#15151f", border: `1px solid #2a2a38`, borderRadius: 8, color: f.color, fontSize: 16, fontWeight: 700, padding: "10px 12px", outline: "none", fontFamily: "'DM Mono', monospace" }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onRetry} style={{ flex: 0.4, background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 12, color: "#888", fontSize: 14, fontWeight: 600, padding: 14 }}>Re-analyze</button>
        <button onClick={onSave} disabled={saving} style={{ flex: 1, background: "linear-gradient(135deg, #166534, #16a34a)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: 14, fontFamily: "'Syne', sans-serif" }}>
          {saving ? "Saving..." : "Log This Meal ✓"}
        </button>
      </div>
    </div>
  );
}

function HistoryScreen({ meals, onBack }) {
  const byDate = meals.reduce((acc, m) => {
    if (!acc[m.date]) acc[m.date] = [];
    acc[m.date].push(m);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0e", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "max(20px, env(safe-area-inset-top)) 20px 16px", borderBottom: "1px solid #1a1a22", display: "flex", alignItems: "center", gap: 14, background: "#0f0f18" }}>
        <button onClick={onBack} style={{ background: "#1a1a24", border: "none", color: "#666", width: 36, height: 36, borderRadius: 9, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700 }}>History</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {dates.length === 0 && <div style={{ color: "#444", fontSize: 14, textAlign: "center", paddingTop: 40 }}>No meals logged yet.</div>}
        {dates.map(date => {
          const dayMeals = byDate[date];
          const tot = dayMeals.reduce((a, m) => ({ cal: a.cal + (m.calories||0), prot: a.prot + (m.protein||0) }), { cal: 0, prot: 0 });
          return (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 }}>{date === today() ? "Today" : formatDate(date)}</div>
                <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#888" }}>
                  <span style={{ color: "#f59e0b" }}>{Math.round(tot.cal)}</span> cal · <span style={{ color: "#4ade80" }}>{Math.round(tot.prot)}g</span> protein
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dayMeals.map(m => (
                  <div key={m.id} style={{ background: "#0f0f18", border: "1px solid #1a1a28", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m.meal_name}</div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                        P: {Math.round(m.protein)}g · C: {Math.round(m.carbs)}g · F: {Math.round(m.fat)}g
                      </div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f59e0b", fontFamily: "'Syne', sans-serif" }}>{m.calories}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
}

function Loader() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 36, height: 36, border: "3px solid #1a1a24", borderTop: "3px solid #f59e0b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#444", fontSize: 13 }}>Loading...</div>
    </div>
  );
}
