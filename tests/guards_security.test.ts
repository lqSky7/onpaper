// Security & Policy Guard Engine Tests
// Strictly adheres to Blueprint Section 3.4, 11.2, 13.5, 17.3, and 31

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { PolicyGuard } from "../src/core/guards.js";

test("Security: Relative path validation & traversal prevention", () => {
  const repoRoot = "/Users/developer/my-project";

  // Valid relative paths
  assert.equal(PolicyGuard.validateRelativePath(repoRoot, "src/index.ts"), "src/index.ts");
  assert.equal(PolicyGuard.validateRelativePath(repoRoot, "internal/auth/service.go"), "internal/auth/service.go");

  // Invalid / traversal paths
  assert.throws(() => PolicyGuard.validateRelativePath(repoRoot, "/etc/shadow"), /Absolute paths are prohibited/);
  assert.throws(() => PolicyGuard.validateRelativePath(repoRoot, "../../secret.key"), /Path traversal is prohibited/);
  assert.throws(() => PolicyGuard.validateRelativePath(repoRoot, "src/../../outside"), /Path traversal is prohibited/);
});

test("Security: Git ignore verification & auto-remediation", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-git-guard-"));

  // Ensure git ignored adds entry if missing
  PolicyGuard.ensureGitIgnored(tmpDir);

  const gitignorePath = path.join(tmpDir, ".gitignore");
  assert.ok(fs.existsSync(gitignorePath));
  const content = fs.readFileSync(gitignorePath, "utf-8");
  assert.ok(content.includes(".interview-prep/"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Security: Destructive git command rejection", () => {
  assert.throws(() => PolicyGuard.assertSafeGitCommand("git push origin main"), /Destructive git command rejected/);
  assert.throws(() => PolicyGuard.assertSafeGitCommand("git clean -fd"), /Destructive git command rejected/);
  assert.throws(() => PolicyGuard.assertSafeGitCommand("git reset --hard HEAD~1"), /Destructive git command rejected/);
  assert.throws(() => PolicyGuard.assertSafeGitCommand("git rebase master"), /Destructive git command rejected/);

  // Safe commands should not throw
  assert.doesNotThrow(() => PolicyGuard.assertSafeGitCommand("git status"));
  assert.doesNotThrow(() => PolicyGuard.assertSafeGitCommand("git diff"));
  assert.doesNotThrow(() => PolicyGuard.assertSafeGitCommand("git log -n 5"));
});

test("Security: Environment variable sanitization", () => {
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
  process.env.GITHUB_TOKEN = "test-gh-token";
  process.env.SAFE_VAR = "hello";

  const sanitized = PolicyGuard.sanitizeEnvironment();

  assert.equal(sanitized.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(sanitized.GITHUB_TOKEN, undefined);
  assert.equal(sanitized.SAFE_VAR, "hello");
});
