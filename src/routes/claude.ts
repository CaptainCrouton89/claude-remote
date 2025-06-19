import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import express, { Request, Response } from "express";

export const claudeRouter = express.Router();

interface ClaudePromptRequest {
  prompt: string;
  repo?: string;
  continue?: boolean;
}

claudeRouter.post(
  "/prompt",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        prompt,
        repo,
        continue: continuePrompt,
      }: ClaudePromptRequest = req.body;

      if (!prompt) {
        res.status(400).json({ error: "Prompt is required" });
        return;
      }

      console.log("Received Claude prompt:", prompt);
      if (repo) {
        console.log("Target repository:", repo);
      }

      // Set working directory if repo is provided
      const cwd = repo || process.cwd();

      const messages: SDKMessage[] = [];

      for await (const message of query({
        prompt: prompt,
        abortController: new AbortController(),
        options: {
          maxTurns: 20,
          cwd: cwd,
          allowedTools: ["Read", "Write", "Bash"],
          permissionMode: "acceptEdits",
          executableArgs: ["-p", "--output-format json"],
          continue: continuePrompt,
        },
      })) {
        messages.push(message);
      }

      res.json({
        message: "Prompt processed successfully",
        timestamp: new Date().toISOString(),
        promptLength: prompt.length,
        response: messages,
        workingDirectory: cwd,
        messages: messages.length,
      });
    } catch (error) {
      console.error("Claude prompt error:", error);
      res.status(500).json({
        error: "Failed to process prompt",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
