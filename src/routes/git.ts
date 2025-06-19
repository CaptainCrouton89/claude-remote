import express, { Request, Response } from "express";
import { gitService } from "../services/gitService";
import simpleGit from "simple-git";

export const gitRouter = express.Router();

interface GitInitRequest {
  url: string;
}

interface GitSaveRequest {
  message: string;
  repo: string;
}

gitRouter.post("/init", async (req: Request, res: Response): Promise<void> => {
  try {
    const { url }: GitInitRequest = req.body;

    if (!url) {
      res.status(400).json({ error: "Git URL is required" });
      return;
    }

    const result = await gitService.cloneOrGetRepository(url);

    if (!result.success) {
      res.status(400).json({
        error: result.error || "Failed to clone repository",
      });
      return;
    }

    if (result.alreadyExists) {
      res.status(409).json({
        error: "Repository already exists",
        repoName: result.repoName,
        path: result.path,
        url: result.url,
      });
      return;
    }

    res.json({
      message: "Repository cloned successfully",
      repoName: result.repoName,
      path: result.path,
      url: result.url,
    });
  } catch (error) {
    console.error("Git clone error:", error);
    res.status(500).json({
      error: "Failed to clone repository",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

gitRouter.post("/save", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, repo }: GitSaveRequest = req.body;

    if (!message) {
      res.status(400).json({ error: "Commit message is required" });
      return;
    }

    if (!repo) {
      res.status(400).json({ error: "Repository path or URL is required" });
      return;
    }

    // If repo looks like a URL, try to get the local path
    let repoPath = repo;
    if (repo.includes("://") || repo.startsWith("git@")) {
      const result = await gitService.cloneOrGetRepository(repo);
      if (!result.success) {
        res.status(400).json({
          error: "Failed to access repository",
          details: result.error,
        });
        return;
      }
      repoPath = result.path;
    }

    console.log(`Saving changes to repository: ${repoPath}`);

    const git = simpleGit(repoPath);

    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    // Add all changes
    await git.add(".");
    console.log("Added all changes to staging");

    // Check if there are any changes to commit
    const status = await git.status();
    if (status.files.length === 0) {
      res.json({
        message: "No changes to commit",
        repoPath,
      });
      return;
    }

    // Commit changes
    const commitResult = await git.commit(message);
    console.log(`Committed changes: ${commitResult.commit}`);

    // Push changes
    await git.push();
    console.log("Pushed changes to remote");

    res.json({
      message: "Changes saved successfully",
      repoPath,
      commit: commitResult.commit,
      summary: commitResult.summary,
      changedFiles: status.files.length,
    });
  } catch (error) {
    console.error("Git save error:", error);
    res.status(500).json({
      error: "Failed to save changes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});