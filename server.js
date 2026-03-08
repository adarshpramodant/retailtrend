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

  const { question, products } = req.body;

  const prompt = `
You are a retail analytics AI.

Store data:
${JSON.stringify(products)}

User question:
${question}

Give helpful business insights.
`;

  try {

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are a retail analytics expert." },
        { role: "user", content: prompt }
      ]
    });

    res.json({
      answer: completion.choices[0].message.content
    });

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "AI request failed" });

  }

});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});