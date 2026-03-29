import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(".")); // serve frontend files

// ✅ Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ AI Route
app.post("/api/ai", async (req, res) => {
  try {
    const { question, products } = req.body;

    // ✅ Validate input
    if (!question) {
      return res.status(400).json({
        error: "No question provided"
      });
    }

    // ✅ Limit data (prevent overload)
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

    // ✅ Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-pro"
    });

    const result = await model.generateContent(prompt);

    const answer = result.response.text();

    // ✅ Send response
    res.status(200).json({ answer });

  } catch (err) {
    console.error("AI ERROR:", err);

    // 🔥 Fallback (if AI fails)
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
  console.log(`Server running on http://localhost:${PORT}`);
});