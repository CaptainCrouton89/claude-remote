import express, { Request, Response } from "express";
import { cloneOrGetRepository, getRepositoryPath } from "../services/gitService";
import simpleGit from "simple-git";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";

export const gitRouter = express.Router();

interface GitInitRequest {
  url: string;
}

interface GitSaveRequest {
  message: string;
  repo: string;
}

interface GitRepoRequest {
  repo: string;
}

interface GitBranchRequest {
  repo: string;
  branch?: string;
}

interface GitPullRequest {
  repo: string;
  remote?: string;
  branch?: string;
}

interface GitResetRequest {
  repo: string;
  mode?: 'soft' | 'mixed' | 'hard';
  target?: string;
}

interface FileUpdateRequest {
  content: string;
}

const DEFAULT_REPOS_PATH = path.join(process.cwd(), "repos");

gitRouter.get("/repos", async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if repos directory exists
    try {
      await fs.access(DEFAULT_REPOS_PATH);
    } catch {
      res.json({
        repositories: [],
        totalCount: 0
      });
      return;
    }

    // Read all directories in repos folder
    const entries = await fs.readdir(DEFAULT_REPOS_PATH, { withFileTypes: true });
    const repoDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

    const repositories = await Promise.allSettled(
      repoDirs.map(async (repoName) => {
        const repoPath = path.join(DEFAULT_REPOS_PATH, repoName);
        const git = simpleGit(repoPath);

        try {
          // Check if it's a valid git repository
          const isRepo = await git.checkIsRepo();
          if (!isRepo) {
            return {
              name: repoName,
              path: repoPath,
              isGitRepo: false,
              error: "Not a git repository"
            };
          }

          // Get repository information
          const [status, remotes, log] = await Promise.all([
            git.status(),
            git.getRemotes(true),
            git.log({ maxCount: 1 })
          ]);

          const lastCommit = log.latest;

          return {
            name: repoName,
            path: repoPath,
            isGitRepo: true,
            currentBranch: status.current,
            trackingBranch: status.tracking,
            ahead: status.ahead,
            behind: status.behind,
            hasChanges: status.files.length > 0,
            staged: status.staged.length,
            modified: status.modified.length,
            notAdded: status.not_added.length,
            deleted: status.deleted.length,
            remotes: remotes.map(remote => ({
              name: remote.name,
              refs: remote.refs
            })),
            lastCommit: lastCommit ? {
              hash: lastCommit.hash,
              date: lastCommit.date,
              message: lastCommit.message,
              author: lastCommit.author_name,
              email: lastCommit.author_email
            } : null
          };
        } catch (error) {
          return {
            name: repoName,
            path: repoPath,
            isGitRepo: false,
            error: error instanceof Error ? error.message : "Unknown error"
          };
        }
      })
    );

    // Process results and separate successful from failed
    const repos = repositories.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: 'unknown',
          path: 'unknown',
          isGitRepo: false,
          error: result.reason instanceof Error ? result.reason.message : "Failed to read repository"
        };
      }
    });

    res.json({
      repositories: repos,
      totalCount: repos.length,
      validGitRepos: repos.filter(repo => repo.isGitRepo).length,
      reposPath: DEFAULT_REPOS_PATH
    });
  } catch (error) {
    console.error("List repositories error:", error);
    res.status(500).json({
      error: "Failed to list repositories",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.post("/init", async (req: Request, res: Response): Promise<void> => {
  try {
    const { url }: GitInitRequest = req.body;

    if (!url) {
      res.status(400).json({ error: "Git URL is required" });
      return;
    }

    const result = await cloneOrGetRepository(url);

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

// Helper function to resolve repository path
async function resolveRepoPath(repo: string): Promise<{ success: boolean; path?: string; error?: string }> {
  if (repo.includes("://") || repo.startsWith("git@")) {
    const result = await cloneOrGetRepository(repo);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, path: result.path };
  }
  
  const repoPath = getRepositoryPath(repo);
  return { success: true, path: repoPath };
}

// Helper function to safely resolve file paths within repository
function safeResolveFilePath(repoPath: string, filePath: string): { success: boolean; fullPath?: string; error?: string } {
  try {
    // Remove leading slash and resolve path
    const cleanFilePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fullPath = path.resolve(repoPath, cleanFilePath);
    
    // Ensure the resolved path is within the repository
    const normalizedRepoPath = path.resolve(repoPath);
    const normalizedFullPath = path.resolve(fullPath);
    
    if (!normalizedFullPath.startsWith(normalizedRepoPath + path.sep) && normalizedFullPath !== normalizedRepoPath) {
      return { 
        success: false, 
        error: "Path traversal detected - file must be within repository" 
      };
    }
    
    return { success: true, fullPath: normalizedFullPath };
  } catch (error) {
    return { 
      success: false, 
      error: `Invalid file path: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

// Helper function to determine if a file is binary
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`file --mime-type "${filePath}"`);
    return !stdout.includes('text/') && !stdout.includes('application/json') && !stdout.includes('application/javascript');
  } catch {
    // Fallback: check file extension
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.txt', '.js', '.ts', '.json', '.md', '.html', '.css', '.xml', '.yml', '.yaml', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.php', '.rb', '.sh', '.sql'];
    return !textExtensions.includes(ext);
  }
}

// Helper function to get MIME type
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.yml': 'application/x-yaml',
    '.yaml': 'application/x-yaml',
    '.py': 'text/x-python',
    '.java': 'text/x-java-source',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.php': 'text/x-php',
    '.rb': 'text/x-ruby',
    '.sh': 'text/x-shellscript',
    '.sql': 'text/x-sql'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

// Helper function to recursively list directory contents
async function listDirectoryRecursive(dirPath: string, relativeTo: string = dirPath): Promise<any[]> {
  const items: any[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip .git directory and other hidden files/directories
      if (entry.name.startsWith('.')) {
        continue;
      }
      
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(relativeTo, fullPath);
      
      if (entry.isDirectory()) {
        const children = await listDirectoryRecursive(fullPath, relativeTo);
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children: children
        });
      } else {
        const stats = await fs.stat(fullPath);
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          mimeType: getMimeType(entry.name)
        });
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
  
  return items;
}

gitRouter.get("/status/:repo", async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = req.params.repo;
    
    if (!repo) {
      res.status(400).json({ error: "Repository parameter is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repo);
    
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    const [status, branches, remotes] = await Promise.all([
      git.status(),
      git.branch(['-a']),
      git.getRemotes(true)
    ]);

    res.json({
      repository: repo,
      path: resolveResult.path,
      status: {
        current: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        deleted: status.deleted,
        renamed: status.renamed,
        files: status.files
      },
      branches: {
        current: branches.current,
        all: branches.all,
        local: branches.branches
      },
      remotes: remotes
    });
  } catch (error) {
    console.error("Git status error:", error);
    res.status(500).json({
      error: "Failed to get repository status",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.post("/pull", async (req: Request, res: Response): Promise<void> => {
  try {
    const { repo, remote = 'origin', branch }: GitPullRequest = req.body;
    
    if (!repo) {
      res.status(400).json({ error: "Repository is required" });
      return;
    }

    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    const pullArgs = branch ? [remote, branch] : [remote];
    const result = await git.pull(...pullArgs);

    res.json({
      message: "Pull completed successfully",
      repository: repo,
      summary: result.summary,
      files: result.files,
      insertions: result.insertions,
      deletions: result.deletions
    });
  } catch (error) {
    console.error("Git pull error:", error);
    res.status(500).json({
      error: "Failed to pull changes",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.post("/branch", async (req: Request, res: Response): Promise<void> => {
  try {
    const { repo, branch }: GitBranchRequest = req.body;
    
    if (!repo) {
      res.status(400).json({ error: "Repository is required" });
      return;
    }

    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    if (branch) {
      // Create and checkout new branch
      await git.checkoutLocalBranch(branch);
      res.json({
        message: `Created and switched to branch '${branch}'`,
        repository: repo,
        branch: branch
      });
    } else {
      // List branches
      const branches = await git.branch(['-a']);
      res.json({
        repository: repo,
        current: branches.current,
        branches: branches.all,
        local: branches.branches
      });
    }
  } catch (error) {
    console.error("Git branch error:", error);
    res.status(500).json({
      error: "Failed to handle branch operation",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.post("/checkout", async (req: Request, res: Response): Promise<void> => {
  try {
    const { repo, branch }: GitBranchRequest = req.body;
    
    if (!repo || !branch) {
      res.status(400).json({ error: "Repository and branch are required" });
      return;
    }

    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    await git.checkout(branch);
    
    res.json({
      message: `Switched to branch '${branch}'`,
      repository: repo,
      branch: branch
    });
  } catch (error) {
    console.error("Git checkout error:", error);
    res.status(500).json({
      error: "Failed to checkout branch",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.get("/log/:repo", async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = req.params.repo;
    const limit = parseInt(req.query.limit as string) || 10;
    
    if (!repo) {
      res.status(400).json({ error: "Repository parameter is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    const log = await git.log({ maxCount: limit });
    
    res.json({
      repository: repo,
      commits: log.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author_name: commit.author_name,
        author_email: commit.author_email
      }))
    });
  } catch (error) {
    console.error("Git log error:", error);
    res.status(500).json({
      error: "Failed to get commit history",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.post("/reset", async (req: Request, res: Response): Promise<void> => {
  try {
    const { repo, mode = 'mixed', target = 'HEAD' }: GitResetRequest = req.body;
    
    if (!repo) {
      res.status(400).json({ error: "Repository is required" });
      return;
    }

    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    const resetOptions = [`--${mode}`, target];
    await git.reset(resetOptions);
    
    res.json({
      message: `Reset to ${target} with ${mode} mode`,
      repository: repo,
      mode: mode,
      target: target
    });
  } catch (error) {
    console.error("Git reset error:", error);
    res.status(500).json({
      error: "Failed to reset repository",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.get("/diff/:repo", async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = req.params.repo;
    const staged = req.query.staged === 'true';
    
    if (!repo) {
      res.status(400).json({ error: "Repository parameter is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const git = simpleGit(resolveResult.path);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      res.status(400).json({ error: "Not a git repository" });
      return;
    }

    const diff = staged ? await git.diff(['--staged']) : await git.diff();
    
    res.json({
      repository: repo,
      staged: staged,
      diff: diff
    });
  } catch (error) {
    console.error("Git diff error:", error);
    res.status(500).json({
      error: "Failed to get diff",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

gitRouter.delete("/repo/:repo", async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = req.params.repo;
    
    if (!repo) {
      res.status(400).json({ error: "Repository parameter is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repo);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }

    const fs = await import('fs/promises');
    await fs.rm(resolveResult.path!, { recursive: true, force: true });
    
    res.json({
      message: `Repository '${repo}' deleted successfully`,
      repository: repo,
      path: resolveResult.path
    });
  } catch (error) {
    console.error("Repository deletion error:", error);
    res.status(500).json({
      error: "Failed to delete repository",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// GET /repos/:name/files - Browse repository file structure
gitRouter.get("/repos/:name/files", async (req: Request, res: Response): Promise<void> => {
  try {
    const repoName = req.params.name;
    
    if (!repoName) {
      res.status(400).json({ error: "Repository name is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repoName);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }
    
    // Verify repository exists
    try {
      await fs.access(resolveResult.path!);
    } catch {
      res.status(404).json({ error: `Repository '${repoName}' not found` });
      return;
    }
    
    const files = await listDirectoryRecursive(resolveResult.path!);
    
    res.json({
      repository: repoName,
      path: resolveResult.path,
      files: files
    });
  } catch (error) {
    console.error("File listing error:", error);
    res.status(500).json({
      error: "Failed to list repository files",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// GET /repos/:name/files/* - Read specific file content
gitRouter.get("/repos/:name/files/*", async (req: Request, res: Response): Promise<void> => {
  try {
    const repoName = req.params.name;
    const filePath = req.params[0]; // Gets everything after /files/
    
    if (!repoName) {
      res.status(400).json({ error: "Repository name is required" });
      return;
    }
    
    if (!filePath) {
      res.status(400).json({ error: "File path is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repoName);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }
    
    const safePathResult = safeResolveFilePath(resolveResult.path!, filePath);
    if (!safePathResult.success) {
      res.status(400).json({ error: safePathResult.error });
      return;
    }
    
    try {
      const stats = await fs.stat(safePathResult.fullPath!);
      
      if (stats.isDirectory()) {
        res.status(400).json({ error: "Path is a directory, not a file" });
        return;
      }
      
      // Check if file is binary
      const isBinary = await isBinaryFile(safePathResult.fullPath!);
      const mimeType = getMimeType(safePathResult.fullPath!);
      
      if (isBinary) {
        res.status(400).json({ 
          error: "Binary file content cannot be displayed as text",
          mimeType: mimeType,
          size: stats.size
        });
        return;
      }
      
      const content = await fs.readFile(safePathResult.fullPath!, 'utf-8');
      
      res.json({
        repository: repoName,
        filePath: filePath,
        content: content,
        mimeType: mimeType,
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        res.status(404).json({ error: `File '${filePath}' not found` });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("File read error:", error);
    res.status(500).json({
      error: "Failed to read file",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// PUT /repos/:name/files/* - Update specific file content
gitRouter.put("/repos/:name/files/*", async (req: Request, res: Response): Promise<void> => {
  try {
    const repoName = req.params.name;
    const filePath = req.params[0]; // Gets everything after /files/
    const { content }: FileUpdateRequest = req.body;
    
    if (!repoName) {
      res.status(400).json({ error: "Repository name is required" });
      return;
    }
    
    if (!filePath) {
      res.status(400).json({ error: "File path is required" });
      return;
    }
    
    if (content === undefined) {
      res.status(400).json({ error: "File content is required" });
      return;
    }
    
    const resolveResult = await resolveRepoPath(repoName);
    if (!resolveResult.success) {
      res.status(400).json({ error: resolveResult.error });
      return;
    }
    
    const safePathResult = safeResolveFilePath(resolveResult.path!, filePath);
    if (!safePathResult.success) {
      res.status(400).json({ error: safePathResult.error });
      return;
    }
    
    // Ensure parent directory exists
    const parentDir = path.dirname(safePathResult.fullPath!);
    await fs.mkdir(parentDir, { recursive: true });
    
    // Check if file exists to determine if this is create vs update
    let isNewFile = false;
    try {
      await fs.access(safePathResult.fullPath!);
    } catch {
      isNewFile = true;
    }
    
    // Write the file
    await fs.writeFile(safePathResult.fullPath!, content, 'utf-8');
    
    const stats = await fs.stat(safePathResult.fullPath!);
    const mimeType = getMimeType(safePathResult.fullPath!);
    
    res.json({
      message: isNewFile ? "File created successfully" : "File updated successfully",
      repository: repoName,
      filePath: filePath,
      mimeType: mimeType,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: isNewFile
    });
  } catch (error) {
    console.error("File update error:", error);
    res.status(500).json({
      error: "Failed to update file",
      details: error instanceof Error ? error.message : "Unknown error"
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
      const result = await cloneOrGetRepository(repo);
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