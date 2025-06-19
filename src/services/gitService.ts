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

const DEFAULT_REPOS_PATH = path.join(process.cwd(), "repos");

function isValidGitUrl(url: string): boolean {
  const urlPattern =
    /^(https?:\/\/|git@)[\w\-.]+(\:\d+)?\/([[\w\-./]+)(\\.git)?$/;
  return urlPattern.test(url);
}

function extractRepoName(url: string): string {
  return url.split("/").pop()?.replace(".git", "") || "unknown-repo";
}

async function ensureReposDirectory(
  reposPath: string = DEFAULT_REPOS_PATH
): Promise<void> {
  try {
    await fs.access(reposPath);
  } catch {
    await fs.mkdir(reposPath, { recursive: true });
  }
}

export async function repositoryExists(
  repoName: string,
  reposPath: string = DEFAULT_REPOS_PATH
): Promise<boolean> {
  const targetPath = path.join(reposPath, repoName);
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function getRepositoryPath(
  repoName: string,
  reposPath: string = DEFAULT_REPOS_PATH
): string {
  return path.join(reposPath, repoName);
}

export async function cloneOrGetRepository(
  url: string,
  reposPath: string = DEFAULT_REPOS_PATH
): Promise<CloneResult> {
  if (!isValidGitUrl(url)) {
    return {
      success: false,
      repoName: "",
      path: "",
      url,
      error: "Invalid git URL format",
    };
  }

  const repoName = extractRepoName(url);
  const targetPath = getRepositoryPath(repoName, reposPath);

  if (await repositoryExists(repoName, reposPath)) {
    return {
      success: true,
      repoName,
      path: targetPath,
      url,
      alreadyExists: true,
    };
  }

  try {
    await ensureReposDirectory(reposPath);

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

export async function forceCloneRepository(
  url: string,
  reposPath: string = DEFAULT_REPOS_PATH
): Promise<CloneResult> {
  if (!isValidGitUrl(url)) {
    return {
      success: false,
      repoName: "",
      path: "",
      url,
      error: "Invalid git URL format",
    };
  }

  const repoName = extractRepoName(url);
  const targetPath = getRepositoryPath(repoName, reposPath);

  try {
    if (await repositoryExists(repoName, reposPath)) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }

    await ensureReposDirectory(reposPath);

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
