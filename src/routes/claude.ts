import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import express, { Request, Response } from "express";
import { gitService } from "../services/gitService";

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

      let cwd = process.cwd();

      if (repo) {
        console.log("Target repository:", repo);

        // Try to clone or get the repository
        const cloneResult = await gitService.cloneOrGetRepository(repo);

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

      const messages: SDKMessage[] = [];

      for await (const message of query({
        prompt: prompt,
        abortController: new AbortController(),
        options: {
          maxTurns: 20,
          cwd: cwd,
          allowedTools: [
            "Read",
            "Write",
            "Edit",
            "MultiEdit",
            "Bash",
            "Glob",
            "Grep",
            "LS",
            "Git",
          ],
          permissionMode: "acceptEdits",
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
