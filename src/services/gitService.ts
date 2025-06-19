import fs from "fs/promises";
import path from "path";
import simpleGit from "simple-git";

export interface CloneResult {
  success: boolean;
  repoName: string;
  path: string;
  url: string;
  alreadyExists?: boolean;
  error?: string;
}

export class GitService {
  private reposPath: string;

  constructor(reposPath?: string) {
    this.reposPath = reposPath || path.join(process.cwd(), "repos");
  }

  /**
   * Validates if a URL is a valid git repository URL
   */
  private isValidGitUrl(url: string): boolean {
    const urlPattern =
      /^(https?:\/\/|git@)[\w\-.]+(\:\d+)?\/([[\w\-./]+)(\\.git)?$/;
    return urlPattern.test(url);
  }

  /**
   * Extracts repository name from git URL
   */
  private extractRepoName(url: string): string {
    return url.split("/").pop()?.replace(".git", "") || "unknown-repo";
  }

  /**
   * Ensures the repos directory exists
   */
  private async ensureReposDirectory(): Promise<void> {
    try {
      await fs.access(this.reposPath);
    } catch {
      await fs.mkdir(this.reposPath, { recursive: true });
    }
  }

  /**
   * Checks if a repository already exists locally
   */
  async repositoryExists(repoName: string): Promise<boolean> {
    const targetPath = path.join(this.reposPath, repoName);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the local path for a repository
   */
  getRepositoryPath(repoName: string): string {
    return path.join(this.reposPath, repoName);
  }

  /**
   * Clones a repository or returns existing path if already cloned
   */
  async cloneOrGetRepository(url: string): Promise<CloneResult> {
    if (!this.isValidGitUrl(url)) {
      return {
        success: false,
        repoName: "",
        path: "",
        url,
        error: "Invalid git URL format",
      };
    }

    const repoName = this.extractRepoName(url);
    const targetPath = this.getRepositoryPath(repoName);

    // Check if repository already exists
    if (await this.repositoryExists(repoName)) {
      return {
        success: true,
        repoName,
        path: targetPath,
        url,
        alreadyExists: true,
      };
    }

    try {
      await this.ensureReposDirectory();
      
      console.log(`Cloning repository: ${url} to ${targetPath}`);
      const git = simpleGit();
      await git.clone(url, targetPath);
      
      console.log(`Successfully cloned repository: ${repoName}`);

      return {
        success: true,
        repoName,
        path: targetPath,
        url,
        alreadyExists: false,
      };
    } catch (error) {
      console.error("Git clone error:", error);
      return {
        success: false,
        repoName,
        path: targetPath,
        url,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Force clone a repository (removes existing if present)
   */
  async forceCloneRepository(url: string): Promise<CloneResult> {
    if (!this.isValidGitUrl(url)) {
      return {
        success: false,
        repoName: "",
        path: "",
        url,
        error: "Invalid git URL format",
      };
    }

    const repoName = this.extractRepoName(url);
    const targetPath = this.getRepositoryPath(repoName);

    try {
      // Remove existing directory if it exists
      if (await this.repositoryExists(repoName)) {
        await fs.rm(targetPath, { recursive: true, force: true });
      }

      await this.ensureReposDirectory();
      
      console.log(`Force cloning repository: ${url} to ${targetPath}`);
      const git = simpleGit();
      await git.clone(url, targetPath);
      
      console.log(`Successfully force cloned repository: ${repoName}`);

      return {
        success: true,
        repoName,
        path: targetPath,
        url,
        alreadyExists: false,
      };
    } catch (error) {
      console.error("Git force clone error:", error);
      return {
        success: false,
        repoName,
        path: targetPath,
        url,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Export a default instance
export const gitService = new GitService();