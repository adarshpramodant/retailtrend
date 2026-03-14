import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(".")); // serve frontend files

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/api/ai", async (req, res) => {

  try {

    const { question, products } = req.body;

    if(!question){
      return res.json({ answer: "No question provided." });
    }

    const prompt = `
You are a retail analytics AI.

Store data:
${JSON.stringify(products)}

User question:
${question}

Give a short helpful business insight.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role:"system", content:"You are a retail analytics assistant." },
        { role:"user", content: prompt }
      ]
    });

    const answer = response.choices[0].message.content;

    res.json({ answer });

  } catch (err) {

    console.error("AI ERROR:", err);

    res.json({
      answer: "⚠ AI service temporarily unavailable. Please try again."
    });

  }

});
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});