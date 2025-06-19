import cors from "cors";
import express from "express";
import fs from "fs/promises";
import helmet from "helmet";
import path from "path";
import { claudeRouter } from "./routes/claude";
import { gitRouter } from "./routes/git";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure repos directory exists
const ensureReposDirectory = async () => {
  const reposPath = path.join(process.cwd(), "repos");
  try {
    await fs.access(reposPath);
  } catch {
    await fs.mkdir(reposPath, { recursive: true });
    console.log("Created repos directory");
  }
};

// Routes
app.use("/git", gitRouter);
app.use("/claude", claudeRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
);

const startServer = async () => {
  try {
    await ensureReposDirectory();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(
        `📁 Repos will be cloned to: ${path.join(process.cwd(), "repos")}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
