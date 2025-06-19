import express, { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import simpleGit from "simple-git";

export const gitRouter = express.Router();

interface GitInitRequest {
  url: string;
}

gitRouter.post("/init", async (req: Request, res: Response): Promise<void> => {
  try {
    const { url }: GitInitRequest = req.body;

    if (!url) {
      res.status(400).json({ error: "Git URL is required" });
      return;
    }

    // Validate URL format (basic validation)
    const urlPattern =
      /^(https?:\/\/|git@)[\w\-.]+(:\d+)?\/([\w\-./]+)(\.git)?$/;
    if (!urlPattern.test(url)) {
      res.status(400).json({ error: "Invalid git URL format" });
      return;
    }

    // Extract repository name from URL
    const repoName =
      url.split("/").pop()?.replace(".git", "") || "unknown-repo";
    const reposPath = path.join(process.cwd(), "repos");
    const targetPath = path.join(reposPath, repoName);

    // Check if directory already exists
    try {
      await fs.access(targetPath);
      res.status(409).json({
        error: "Repository already exists",
        path: targetPath,
      });
      return;
    } catch {
      // Directory doesn't exist, proceed with cloning
    }

    console.log(`Cloning repository: ${url} to ${targetPath}`);

    const git = simpleGit();
    await git.clone(url, targetPath);

    console.log(`Successfully cloned repository: ${repoName}`);

    res.json({
      message: "Repository cloned successfully",
      repoName,
      path: targetPath,
      url,
    });
  } catch (error) {
    console.error("Git clone error:", error);
    res.status(500).json({
      error: "Failed to clone repository",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
