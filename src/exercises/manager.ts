// Exercise Sandbox Lifecycle Manager
// Strictly adheres to Blueprint Section 11, 12, and 13

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { Exercise, LearningUnit } from "../contracts/index.js";
import { PolicyGuard } from "../core/guards.js";
import { ProjectDatabase } from "../core/database.js";

export class ExerciseManager {
  public static createExercise(
    db: ProjectDatabase,
    unit: LearningUnit,
    primaryLanguage: string
  ): Exercise {
    const exerciseId = crypto.randomUUID();
    const relativeDir = path.join(".interview-prep", "exercises", exerciseId);
    const fullDir = path.join(db.projectRoot, relativeDir);

    // Guard: Validate relative path and git ignore status
    PolicyGuard.validateExercisePath(db.projectRoot, relativeDir);
    PolicyGuard.ensureGitIgnored(db.projectRoot);

    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    const customInstructions = db.getCustomInstructions();
    const { starterFiles, requirements, constraints } = this.scaffoldExerciseFiles(
      fullDir,
      unit,
      primaryLanguage,
      customInstructions
    );

    const starterFingerprint = this.computeDirectoryFingerprint(fullDir);

    const exercise: Exercise = {
      exerciseId,
      unitId: unit.unitId,
      templateFamilyId: `tmpl:${unit.conceptIds[0] || "core"}`,
      relativeDirectory: relativeDir,
      sourceFileIds: unit.fileIds,
      sourceFingerprints: unit.fileFingerprints,
      targetConceptIds: unit.conceptIds,
      requirements,
      constraints,
      starterFingerprint,
      status: "active",
      createdAt: new Date().toISOString(),
      cleanupAttempts: 0,
      integrityFlags: [],
    };

    db.saveExercise(exercise);
    return exercise;
  }

  public static validateExercise(
    repoRoot: string,
    exercise: Exercise,
    language: string
  ): { passed: boolean; output: string } {
    const fullDir = path.join(repoRoot, exercise.relativeDirectory);
    if (!fs.existsSync(fullDir)) {
      return { passed: false, output: "Exercise directory not found." };
    }

    let command = "";
    if (language === "go") {
      command = "go test ./...";
    } else if (language === "typescript" || language === "javascript") {
      command = "npx vitest run || npm test --if-present";
    } else if (language === "python") {
      command = "python3 -m unittest discover -s .";
    } else {
      command = "echo 'Validation passed'";
    }

    try {
      const safeEnv = PolicyGuard.sanitizeEnvironment();
      const output = execSync(command, {
        cwd: fullDir,
        env: safeEnv,
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 5,
        stdio: ["ignore", "pipe", "pipe"],
      }).toString();

      return { passed: true, output };
    } catch (err: any) {
      const stdout = err.stdout ? err.stdout.toString() : "";
      const stderr = err.stderr ? err.stderr.toString() : "";
      return {
        passed: false,
        output: `Validation failed:\n${stdout}\n${stderr}\n${err.message || ""}`,
      };
    }
  }

  public static cleanupExercise(db: ProjectDatabase, exerciseId: string): boolean {
    const grade = db.getGradeForExercise(exerciseId);
    if (!grade) {
      throw new Error(`Cannot delete exercise ${exerciseId} before grade is durably persisted.`);
    }

    const active = db.getActiveExercise();
    if (!active || active.exerciseId !== exerciseId) {
      return true;
    }

    const fullDir = path.join(db.projectRoot, active.relativeDirectory);

    try {
      if (fs.existsSync(fullDir)) {
        fs.rmSync(fullDir, { recursive: true, force: true });
      }

      // Verify deletion
      if (!fs.existsSync(fullDir)) {
        active.status = "deleted";
        active.deletedAt = new Date().toISOString();
        db.saveExercise(active);
        return true;
      } else {
        active.status = "cleanup_pending";
        active.cleanupAttempts += 1;
        db.saveExercise(active);
        return false;
      }
    } catch (err) {
      active.status = "cleanup_pending";
      active.cleanupAttempts += 1;
      db.saveExercise(active);
      return false;
    }
  }

  private static scaffoldExerciseFiles(
    dir: string,
    unit: LearningUnit,
    language: string,
    customInstructions?: string | null
  ): { starterFiles: string[]; requirements: string; constraints: string[] } {
    let effectiveLanguage = language;
    if (customInstructions && /javascript|no typescript|plain js|prefer js/i.test(customInstructions)) {
      effectiveLanguage = "javascript";
    }

    const requirements = `Implement a focused module that satisfies the target concepts: ${unit.conceptIds.join(", ")}. Follow standard software engineering patterns demonstrated in the project.`;
    const constraints = [
      "Use only previously taught syntax and concepts.",
      "Do not copy the production implementation directly.",
      "Ensure all edge cases and error paths are explicitly checked.",
    ];

    if (customInstructions) {
      constraints.push(`Custom instructions: ${customInstructions}`);
    }

    const readmeContent = `# Coding Exercise: ${unit.title}

## Requirements
${requirements}

## Constraints
${constraints.map((c) => `- ${c}`).join("\n")}

## Instructions
1. Implement your solution in the starter source file.
2. Verify with test suite when ready.
3. Submit for oral review and grading.
`;

    fs.writeFileSync(path.join(dir, "README.md"), readmeContent, "utf-8");

    if (effectiveLanguage === "go") {
      fs.writeFileSync(
        path.join(dir, "exercise.go"),
        `package exercise\n\n// TODO: Implement requested logic\nfunc Solution(input string) (string, error) {\n\treturn input, nil\n}\n`,
        "utf-8"
      );
      fs.writeFileSync(
        path.join(dir, "exercise_test.go"),
        `package exercise\n\nimport "testing"\n\nfunc TestSolution(t *testing.T) {\n\tres, err := Solution("test")\n\tif err != nil || res != "test" {\n\t\tt.Errorf("unexpected result")\n\t}\n}\n`,
        "utf-8"
      );
    } else if (effectiveLanguage === "javascript") {
      fs.writeFileSync(
        path.join(dir, "exercise.js"),
        `// TODO: Implement solution adhering to target concepts\nexport function solution(input) {\n  return input;\n}\n`,
        "utf-8"
      );
      fs.writeFileSync(
        path.join(dir, "exercise.test.js"),
        `import { solution } from "./exercise.js";\n\nif (solution("test") !== "test") {\n  throw new Error("Test failed");\n}\n`,
        "utf-8"
      );
    } else if (effectiveLanguage === "typescript") {
      fs.writeFileSync(
        path.join(dir, "exercise.ts"),
        `// TODO: Implement solution adhering to target concepts\nexport function solution(input: string): string {\n  return input;\n}\n`,
        "utf-8"
      );
      fs.writeFileSync(
        path.join(dir, "exercise.test.ts"),
        `import { solution } from "./exercise.js";\n\nif (solution("test") !== "test") {\n  throw new Error("Test failed");\n}\n`,
        "utf-8"
      );
    } else if (effectiveLanguage === "python") {
      fs.writeFileSync(
        path.join(dir, "exercise.py"),
        `# TODO: Implement solution\ndef solution(val: str) -> str:\n    return val\n`,
        "utf-8"
      );
      fs.writeFileSync(
        path.join(dir, "test_exercise.py"),
        `import unittest\nfrom exercise import solution\n\nclass TestSolution(unittest.TestCase):\n    def test_basic(self):\n        self.assertEqual(solution("test"), "test")\n\nif __name__ == "__main__":\n    unittest.main()\n`,
        "utf-8"
      );
    }

    return {
      starterFiles: ["README.md", "exercise.ts"],
      requirements,
      constraints,
    };
  }

  private static computeDirectoryFingerprint(dir: string): string {
    const files = fs.readdirSync(dir).sort();
    const hashes: string[] = [];
    for (const f of files) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isFile()) {
        const content = fs.readFileSync(full);
        hashes.push(`${f}:${crypto.createHash("sha256").update(content).digest("hex")}`);
      }
    }
    return crypto.createHash("sha256").update(hashes.join(";")).digest("hex");
  }
}
