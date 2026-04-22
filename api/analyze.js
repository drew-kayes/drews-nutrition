export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64Image, mediaType, description } = req.body;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const prompt = description
    ? `Analyze this meal. The user describes it as: "${description}". Estimate the nutritional content.`
    : "Analyze this meal photo and estimate the nutritional content.";

  const suffix = " Respond ONLY with a JSON object with these exact keys: {\"meal_name\": string, \"calories\": number, \"protein\": number, \"carbs\": number, \"fat\": number}. No markdown, no explanation, just the JSON.";

  const content = base64Image
    ? [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
        { type: "text", text: prompt + suffix }
      ]
    : [{ type: "text", text: `The user describes a meal as: "${description}". Estimate the nutritional content.` + suffix }];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
