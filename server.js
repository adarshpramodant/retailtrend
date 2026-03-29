import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

// ✅ Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(".")); // serve frontend

// ✅ Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Health check route (VERY IMPORTANT)
app.get("/api/ai", (req, res) => {
  res.send("AI API is working ✅");
});

// ✅ AI Route
app.post("/api/ai", async (req, res) => {
  try {
    const { question, products } = req.body;

    console.log("AI request received:", question);

    // ✅ Validate input
    if (!question) {
      return res.status(400).json({
        error: "No question provided"
      });
    }

    // ✅ Limit data
    const limitedProducts = (products || []).slice(0, 50);

    // ✅ Prompt
    const prompt = `
You are a smart retail analytics AI.

Analyze this store data:
${JSON.stringify(limitedProducts)}

User question:
${question}

Return response in this format:

📊 Insight:
...

📈 Trend:
...

💡 Suggestion:
...
`;

    // ✅ Use latest Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const result = await model.generateContent(prompt);

    const answer = result.response.text();

    res.status(200).json({ answer });

  } catch (err) {
    console.error("AI ERROR:", err);

    // 🔥 Fallback response
    const { products } = req.body || {};

    let fallback = "⚠ AI unavailable. Showing basic insights.\n\n";

    if (products && products.length > 0) {
      const top = products[0]?.name || "your products";

      fallback += `📊 Insight:\nTop product appears to be ${top}.\n\n`;
      fallback += `📈 Trend:\nInventory-based analysis active.\n\n`;
      fallback += `💡 Suggestion:\nFocus on restocking fast-moving items.`;
    }

    res.status(200).json({
      answer: fallback
    });
  }
});

// ✅ Server start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});