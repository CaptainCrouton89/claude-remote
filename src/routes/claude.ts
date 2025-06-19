import express, { Request, Response } from "express";
import { cloneOrGetRepository } from "../services/gitService.js";
import {
  processPrompt,
  createSession,
  getSession,
  deleteSession,
  getAllSessions,
  type ClaudePromptRequest,
  type CreateSessionRequest,
  type SessionResponse,
} from "../services/claudeService.js";

export const claudeRouter = express.Router();

// Create new conversation session
claudeRouter.post(
  "/sessions",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const request: CreateSessionRequest = req.body;
      let cwd = process.cwd();
      let repoContext: string | undefined;

      if (request.repo) {
        console.log("Creating session with repository:", request.repo);

        const cloneResult = await cloneOrGetRepository(request.repo);

        if (!cloneResult.success) {
          res.status(400).json({
            error: "Failed to access repository",
            details: cloneResult.error,
          });
          return;
        }

        cwd = cloneResult.path;
        repoContext = request.repo;
        console.log(`Session will use repository at: ${cwd}`);

        if (!cloneResult.alreadyExists) {
          console.log(
            `Repository cloned successfully: ${cloneResult.repoName}`
          );
        }
      }

      const session = createSession(cwd, repoContext);
      
      const response: SessionResponse = {
        session,
        message: "Session created successfully",
      };

      res.status(201).json(response);
    } catch (error) {
      console.error("Create session error:", error);
      res.status(500).json({
        error: "Failed to create session",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get session conversation history
claudeRouter.get(
  "/sessions/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;

      if (!sessionId) {
        res.status(400).json({ error: "Session ID is required" });
        return;
      }

      const session = getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json(session);
    } catch (error) {
      console.error("Get session error:", error);
      res.status(500).json({
        error: "Failed to get session",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Delete session
claudeRouter.delete(
  "/sessions/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;

      if (!sessionId) {
        res.status(400).json({ error: "Session ID is required" });
        return;
      }

      const deleted = deleteSession(sessionId);

      if (!deleted) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json({ message: "Session deleted successfully" });
    } catch (error) {
      console.error("Delete session error:", error);
      res.status(500).json({
        error: "Failed to delete session",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// List all sessions
claudeRouter.get(
  "/sessions",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = getAllSessions();
      res.json({ sessions, count: sessions.length });
    } catch (error) {
      console.error("List sessions error:", error);
      res.status(500).json({
        error: "Failed to list sessions",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Process prompt (modified to support session context)
claudeRouter.post(
  "/prompt",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const request: ClaudePromptRequest = req.body;

      if (!request.prompt) {
        res.status(400).json({ error: "Prompt is required" });
        return;
      }

      console.log("Received Claude prompt:", request.prompt);
      
      // If sessionId is provided, validate it exists
      if (request.sessionId) {
        const session = getSession(request.sessionId);
        if (!session) {
          res.status(404).json({ error: "Session not found" });
          return;
        }
        console.log(`Using session: ${request.sessionId}`);
      }

      let cwd = process.cwd();

      // Handle repository context (only if not using session)
      if (request.repo && !request.sessionId) {
        console.log("Target repository:", request.repo);

        const cloneResult = await cloneOrGetRepository(request.repo);

        if (!cloneResult.success) {
          res.status(400).json({
            error: "Failed to access repository",
            details: cloneResult.error,
          });
          return;
        }

        cwd = cloneResult.path;
        console.log(`Using repository at: ${cwd}`);

        if (!cloneResult.alreadyExists) {
          console.log(
            `Repository cloned successfully: ${cloneResult.repoName}`
          );
        }
      }

      const response = await processPrompt(request, cwd);
      res.json(response);
    } catch (error) {
      console.error("Claude prompt error:", error);
      res.status(500).json({
        error: "Failed to process prompt",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
