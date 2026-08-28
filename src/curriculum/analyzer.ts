// Repository Structural Analyzer & Concept Extractor
// Strictly adheres to Blueprint Section 5 and 6

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { FileItem, SymbolItem, Concept } from "../contracts/index.js";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".interview-prep",
  ".next",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".DS_Store",
  ".idea",
  ".vscode",
]);

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".go": "go",
  ".py": "python",
  ".swift": "swift",
  ".rs": "rust",
  ".java": "java",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
};

export class RepositoryAnalyzer {
  public static analyzeRepository(repoRoot: string, projectId: string): {
    files: FileItem[];
    symbols: SymbolItem[];
    primaryLanguages: string[];
    frameworks: string[];
  } {
    const files: FileItem[] = [];
    const symbols: SymbolItem[] = [];
    const langCounts: Record<string, number> = {};
    const frameworkSet = new Set<string>();

    this.walkDirectory(repoRoot, repoRoot, (relPath, fullPath) => {
      const ext = path.extname(relPath).toLowerCase();
      const lang = LANGUAGE_EXTENSIONS[ext] || "unknown";

      if (lang !== "unknown") {
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const contentHash = crypto.createHash("sha256").update(content).digest("hex");
      const stat = fs.statSync(fullPath);

      const sizeClass: "small" | "medium" | "large" =
        stat.size < 5000 ? "small" : stat.size < 30000 ? "medium" : "large";

      const role = this.classifyRole(relPath, content);
      const fileId = crypto.randomUUID();

      // Extract symbols & frameworks
      const fileSymbols = this.extractSymbols(fileId, relPath, lang, content);
      symbols.push(...fileSymbols);

      this.detectFrameworks(content, relPath, frameworkSet);

      const structureFingerprint = crypto
        .createHash("sha256")
        .update(fileSymbols.map((s) => `${s.kind}:${s.name}`).join(";"))
        .digest("hex");

      const fileItem: FileItem = {
        fileId,
        projectId,
        relativePath: relPath,
        language: lang,
        role,
        contentFingerprint: contentHash,
        structureFingerprint,
        sizeClass,
        generatedStatus: "source",
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      files.push(fileItem);
    });

    const primaryLanguages = Object.entries(langCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l)
      .slice(0, 3);

    return {
      files,
      symbols,
      primaryLanguages: primaryLanguages.length > 0 ? primaryLanguages : ["unknown"],
      frameworks: Array.from(frameworkSet),
    };
  }

  private static walkDirectory(
    currentDir: string,
    repoRoot: string,
    callback: (relPath: string, fullPath: string) => void
  ) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(repoRoot, fullPath);

      if (entry.isDirectory()) {
        this.walkDirectory(fullPath, repoRoot, callback);
      } else if (entry.isFile()) {
        callback(relPath, fullPath);
      }
    }
  }

  private static classifyRole(relPath: string, content: string): string {
    const lower = relPath.toLowerCase();
    if (lower.includes("test") || lower.includes("spec")) return "test";
    if (lower.endsWith("main.go") || lower.endsWith("index.ts") || lower.endsWith("app.ts") || lower.endsWith("main.py") || lower.endsWith("App.swift")) {
      return "entry_point";
    }
    if (lower.includes("model") || lower.includes("schema") || lower.includes("type") || lower.includes("entity")) {
      return "model";
    }
    if (lower.includes("service") || lower.includes("manager") || lower.includes("core") || lower.includes("logic")) {
      return "service";
    }
    if (lower.includes("repo") || lower.includes("store") || lower.includes("db") || lower.includes("storage")) {
      return "persistence";
    }
    if (lower.includes("handler") || lower.includes("controller") || lower.includes("api") || lower.includes("route")) {
      return "handler";
    }
    if (lower.includes("config") || lower.includes("setting") || lower.includes("env")) {
      return "config";
    }
    return "utility";
  }

  private static extractSymbols(fileId: string, relPath: string, lang: string, content: string): SymbolItem[] {
    const lines = content.split("\n");
    const symbols: SymbolItem[] = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // TypeScript / JavaScript
      if (lang === "typescript" || lang === "javascript") {
        const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
        if (funcMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: funcMatch[1],
            kind: "function",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: trimmed.startsWith("export") ? "public" : "internal",
            dependencies: [],
          });
        }

        const classMatch = trimmed.match(/^(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
        if (classMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: classMatch[1],
            kind: "class",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: trimmed.startsWith("export") ? "public" : "internal",
            dependencies: [],
          });
        }

        const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
        if (ifaceMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: ifaceMatch[1],
            kind: "interface",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: trimmed.startsWith("export") ? "public" : "internal",
            dependencies: [],
          });
        }
      }

      // Go
      if (lang === "go") {
        const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
        if (funcMatch) {
          const isPublic = /^[A-Z]/.test(funcMatch[1]);
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: funcMatch[1],
            kind: "function",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: isPublic ? "public" : "internal",
            dependencies: [],
          });
        }

        const typeMatch = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
        if (typeMatch) {
          const isPublic = /^[A-Z]/.test(typeMatch[1]);
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: typeMatch[1],
            kind: typeMatch[2] === "struct" ? "struct" : "interface",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: isPublic ? "public" : "internal",
            dependencies: [],
          });
        }
      }

      // Python
      if (lang === "python") {
        const defMatch = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\(/);
        if (defMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: defMatch[1],
            kind: "function",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: defMatch[1].startsWith("_") ? "private" : "public",
            dependencies: [],
          });
        }

        const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
        if (classMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: classMatch[1],
            kind: "class",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: classMatch[1].startsWith("_") ? "private" : "public",
            dependencies: [],
          });
        }
      }

      // Swift
      if (lang === "swift") {
        const funcMatch = trimmed.match(/^(?:public\s+|private\s+|internal\s+)?func\s+([a-zA-Z0-9_]+)/);
        if (funcMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: funcMatch[1],
            kind: "function",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: trimmed.startsWith("public") ? "public" : trimmed.startsWith("private") ? "private" : "internal",
            dependencies: [],
          });
        }

        const structMatch = trimmed.match(/^(?:public\s+|private\s+|internal\s+)?(?:struct|class|enum)\s+([a-zA-Z0-9_]+)/);
        if (structMatch) {
          symbols.push({
            symbolId: crypto.randomUUID(),
            fileId,
            name: structMatch[1],
            kind: "struct",
            signatureDigest: crypto.createHash("sha256").update(trimmed).digest("hex"),
            startLine: lineNum,
            endLine: lineNum,
            visibility: trimmed.startsWith("public") ? "public" : trimmed.startsWith("private") ? "private" : "internal",
            dependencies: [],
          });
        }
      }
    });

    return symbols;
  }

  private static detectFrameworks(content: string, relPath: string, set: Set<string>) {
    if (content.includes("from 'react'") || content.includes('from "react"') || content.includes("import React")) {
      set.add("react");
    }
    if (content.includes("from 'express'") || content.includes('from "express"') || content.includes("require('express')")) {
      set.add("express");
    }
    if (content.includes("import SwiftUI")) {
      set.add("swiftui");
    }
    if (content.includes("github.com/gin-gonic/gin")) {
      set.add("gin");
    }
    if (content.includes("from fastapi") || content.includes("import FastAPI")) {
      set.add("fastapi");
    }
  }

  public static generateStandardConcepts(primaryLanguage: string): Concept[] {
    const concepts: Concept[] = [
      {
        conceptId: "core/variables-types",
        name: "Variables and Type System",
        category: "syntax",
        languageScope: "general",
        prerequisiteIds: [],
        difficulty: 1.0,
        taxonomyVersion: "v1.0",
      },
      {
        conceptId: "core/functions-control-flow",
        name: "Functions and Control Flow",
        category: "syntax",
        languageScope: "general",
        prerequisiteIds: ["core/variables-types"],
        difficulty: 1.2,
        taxonomyVersion: "v1.0",
      },
      {
        conceptId: "core/domain-models",
        name: "Domain Structs and Data Models",
        category: "semantics",
        languageScope: "general",
        prerequisiteIds: ["core/variables-types"],
        difficulty: 1.5,
        taxonomyVersion: "v1.0",
      },
      {
        conceptId: "core/error-handling",
        name: "Error Handling and Propagation",
        category: "semantics",
        languageScope: "general",
        prerequisiteIds: ["core/functions-control-flow"],
        difficulty: 1.8,
        taxonomyVersion: "v1.0",
      },
      {
        conceptId: "core/interfaces-abstractions",
        name: "Interfaces, Protocols and Abstractions",
        category: "architecture",
        languageScope: "general",
        prerequisiteIds: ["core/domain-models"],
        difficulty: 2.2,
        taxonomyVersion: "v1.0",
      },
      {
        conceptId: "core/state-persistence",
        name: "State Management and Persistence",
        category: "architecture",
        languageScope: "general",
        prerequisiteIds: ["core/interfaces-abstractions", "core/error-handling"],
        difficulty: 2.5,
        taxonomyVersion: "v1.0",
      },
      {
        conceptId: "core/testing-boundaries",
        name: "Unit Testing and Mocking Boundaries",
        category: "testing",
        languageScope: "general",
        prerequisiteIds: ["core/interfaces-abstractions"],
        difficulty: 2.0,
        taxonomyVersion: "v1.0",
      },
    ];

    if (primaryLanguage === "go") {
      concepts.push(
        {
          conceptId: "go/goroutines-channels",
          name: "Goroutines, Channels and Concurrency",
          category: "semantics",
          languageScope: "go",
          prerequisiteIds: ["core/functions-control-flow"],
          difficulty: 2.8,
          taxonomyVersion: "v1.0",
        },
        {
          conceptId: "go/nil-interface-confusion",
          name: "Interface Values and Nil Semantics",
          category: "semantics",
          languageScope: "go",
          prerequisiteIds: ["core/interfaces-abstractions"],
          difficulty: 2.6,
          taxonomyVersion: "v1.0",
        }
      );
    } else if (primaryLanguage === "typescript" || primaryLanguage === "javascript") {
      concepts.push(
        {
          conceptId: "ts/async-await-promises",
          name: "Asynchronous Concurrency and Event Loop",
          category: "semantics",
          languageScope: "typescript",
          prerequisiteIds: ["core/functions-control-flow"],
          difficulty: 2.3,
          taxonomyVersion: "v1.0",
        },
        {
          conceptId: "ts/generics-type-narrowing",
          name: "Generics and Discriminated Unions",
          category: "syntax",
          languageScope: "typescript",
          prerequisiteIds: ["core/interfaces-abstractions"],
          difficulty: 2.5,
          taxonomyVersion: "v1.0",
        }
      );
    }

    return concepts;
  }
}
