import express from "express";
import cors from "cors";
import assistantRoute from "./routes/assistant.js";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

app.use("/api/assistant", assistantRoute);

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.listen(4000, () => {
  console.log("🚀 AI Navigator backend running on port 4000");
});