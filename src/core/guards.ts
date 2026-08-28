// Policy and Safety Guard Engine
// Strictly adheres to Blueprint Section 3.4, 11.2, 13.5, and 17.3

import * as path from "node:path";
import * as fs from "node:fs";
import { execSync } from "node:child_process";

export class PolicyGuard {
  public static validateRelativePath(repoRoot: string, targetPath: string): string {
    if (path.isAbsolute(targetPath)) {
      throw new Error(`Absolute paths are prohibited in durable records: "${targetPath}"`);
    }

    const normalized = path.normalize(targetPath);
    if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) {
      throw new Error(`Path traversal is prohibited: "${targetPath}"`);
    }

    const fullPath = path.resolve(repoRoot, normalized);
    const resolvedRepoRoot = path.resolve(repoRoot);

    if (!fullPath.startsWith(resolvedRepoRoot)) {
      throw new Error(`Path escapes repository boundary: "${targetPath}"`);
    }

    return normalized;
  }

  public static validateExercisePath(repoRoot: string, exerciseDir: string): string {
    const relative = this.validateRelativePath(repoRoot, exerciseDir);
    const expectedPrefix = path.normalize(".interview-prep/exercises");
    if (!relative.startsWith(expectedPrefix)) {
      throw new Error(`Exercise must be located inside "${expectedPrefix}", got "${relative}"`);
    }
    return relative;
  }

  public static ensureGitIgnored(repoRoot: string): boolean {
    this.addGitIgnoreEntry(repoRoot, ".interview-prep/");
    return true;
  }

  private static addGitIgnoreEntry(repoRoot: string, entry: string) {
    const gitignorePath = path.join(repoRoot, ".gitignore");
    let content = "";
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, "utf-8");
    }

    if (!content.includes(".interview-prep")) {
      const updated = content.length > 0 && !content.endsWith("\n") ? `${content}\n${entry}\n` : `${content}${entry}\n`;
      fs.writeFileSync(gitignorePath, updated, "utf-8");
    }
  }

  public static assertSafeGitCommand(command: string) {
    const destructive = [
      "push",
      "clean",
      "reset",
      "rebase",
      "checkout -f",
      "restore --staged",
      "branch -D",
      "commit --amend",
    ];

    const lower = command.toLowerCase();
    for (const pattern of destructive) {
      if (lower.includes(`git ${pattern}`) || lower.includes(`git  ${pattern}`)) {
        throw new Error(`Destructive git command rejected by policy: "${command}"`);
      }
    }
  }

  public static sanitizeEnvironment(): NodeJS.ProcessEnv {
    const safeEnv = { ...process.env };
    const sensitiveKeys = [
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "AWS_SECURITY_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "NPM_TOKEN",
      "COGNITO_CLIENT_SECRET",
    ];

    for (const key of sensitiveKeys) {
      delete safeEnv[key];
    }

    return safeEnv;
  }
}
