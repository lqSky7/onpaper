// Curriculum & Repository Analysis Integration Tests
// Strictly adheres to Blueprint Section 5, 6, 7, and 34

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RepositoryAnalyzer } from "../src/curriculum/analyzer.js";
import { CurriculumPlanner } from "../src/curriculum/planner.js";

test("Curriculum: Multi-Language repository scanning and symbol extraction", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-repo-test-"));

  // Create simulated Go and TypeScript project structure
  fs.mkdirSync(path.join(tmpDir, "models"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "services"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "handlers"), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, "models", "user.go"),
    `package models\n\ntype User struct {\n\tID int\n\tName string\n}\n`,
    "utf-8"
  );

  fs.writeFileSync(
    path.join(tmpDir, "services", "user_service.go"),
    `package services\n\nimport "models"\n\nfunc CreateUser(name string) (*models.User, error) {\n\treturn &models.User{ID: 1, Name: name}, nil\n}\n`,
    "utf-8"
  );

  fs.writeFileSync(
    path.join(tmpDir, "handlers", "user_handler.go"),
    `package handlers\n\nimport "services"\n\nfunc HandleCreateUser() error {\n\t_, err := services.CreateUser("test")\n\treturn err\n}\n`,
    "utf-8"
  );

  const { files, symbols, primaryLanguages } = RepositoryAnalyzer.analyzeRepository(tmpDir, "proj-sim-1");

  assert.equal(files.length, 3);
  assert.equal(primaryLanguages[0], "go");
  assert.ok(symbols.length >= 3);

  const concepts = RepositoryAnalyzer.generateStandardConcepts("go");
  const units = CurriculumPlanner.planCurriculum("proj-sim-1", files, symbols, concepts);

  assert.ok(units.length >= 2);
  // First unit should contain model / service before handler
  assert.ok(units[0].fileFingerprints["models/user.go"] || units[0].fileFingerprints["services/user_service.go"]);
  assert.equal(units[0].curriculumPosition, 1);
  assert.equal(units[0].status, "active");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Curriculum: Cognitive load scoring and pairing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-pairing-test-"));
  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, "src", "auth.ts"), `export function login() { return true; }\n`, "utf-8");
  fs.writeFileSync(path.join(tmpDir, "src", "auth.test.ts"), `import { login } from "./auth.js";\n`, "utf-8");
  fs.writeFileSync(path.join(tmpDir, "src", "user.ts"), `export interface User { id: string; }\n`, "utf-8");

  const { files, symbols, primaryLanguages } = RepositoryAnalyzer.analyzeRepository(tmpDir, "proj-sim-2");
  const concepts = RepositoryAnalyzer.generateStandardConcepts(primaryLanguages[0]);
  const units = CurriculumPlanner.planCurriculum("proj-sim-2", files, symbols, concepts);

  assert.ok(units.length >= 1);
  // Test file should pair with its corresponding source file
  const testUnit = units.find((u) => u.fileIds.length === 2);
  assert.ok(testUnit);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
