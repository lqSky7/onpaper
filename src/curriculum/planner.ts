// Curriculum Planner & Unit Generator
// Strictly adheres to Blueprint Section 6, 7, and 8

import * as crypto from "node:crypto";
import { FileItem, SymbolItem, Concept, LearningUnit } from "../contracts/index.js";

const ROLE_LEARNING_ORDER: Record<string, number> = {
  model: 1,
  config: 2,
  entry_point: 3,
  utility: 4,
  service: 5,
  persistence: 6,
  handler: 7,
  test: 8,
};

export class CurriculumPlanner {
  public static planCurriculum(
    projectId: string,
    files: FileItem[],
    symbols: SymbolItem[],
    concepts: Concept[]
  ): LearningUnit[] {
    const units: LearningUnit[] = [];

    // Filter to source files
    const sourceFiles = files.filter(
      (f) => f.generatedStatus === "source" && !f.relativePath.startsWith(".")
    );

    // Group or pair files logically per Section 6.5
    const pairs = this.createFilePairings(sourceFiles);

    // Sort pairings by natural chronological learning order
    pairs.sort((a, b) => {
      const orderA = Math.min(...a.map((f) => ROLE_LEARNING_ORDER[f.role] || 5));
      const orderB = Math.min(...b.map((f) => ROLE_LEARNING_ORDER[f.role] || 5));
      if (orderA !== orderB) return orderA - orderB;
      // Tie-breaking: smaller total file size, stable path ordering
      const sizeA = a.reduce((sum, f) => sum + (f.sizeClass === "small" ? 1 : f.sizeClass === "medium" ? 2 : 3), 0);
      const sizeB = b.reduce((sum, f) => sum + (f.sizeClass === "small" ? 1 : f.sizeClass === "medium" ? 2 : 3), 0);
      if (sizeA !== sizeB) return sizeA - sizeB;
      return a[0].relativePath.localeCompare(b[0].relativePath);
    });

    let position = 1;
    for (const pair of pairs) {
      const unitId = crypto.randomUUID();
      const filePaths = pair.map((f) => f.relativePath);
      const fileFingerprints: Record<string, string> = {};
      pair.forEach((f) => {
        fileFingerprints[f.relativePath] = f.contentFingerprint;
      });

      const assignedConcepts = this.assignConceptsForFiles(pair, concepts, position);
      const title = this.generateUnitTitle(pair, position);
      const selectionReason = this.generateSelectionReason(pair, position);
      const objectives = this.generateObjectives(pair, assignedConcepts);

      const unit: LearningUnit = {
        unitId,
        projectId,
        title,
        fileIds: pair.map((f) => f.fileId),
        fileFingerprints,
        conceptIds: assignedConcepts.map((c) => c.conceptId),
        prerequisiteIds: position === 1 ? [] : [units[position - 2].unitId],
        objectives,
        selectionReason,
        curriculumPosition: position,
        difficulty: Number((1.0 + position * 0.2).toFixed(1)),
        status: position === 1 ? "active" : "planned",
        createdAt: new Date().toISOString(),
      };

      units.push(unit);
      position += 1;
    }

    return units;
  }

  private static createFilePairings(files: FileItem[]): FileItem[][] {
    const paired: FileItem[][] = [];
    const used = new Set<string>();

    const models = files.filter((f) => f.role === "model");
    const services = files.filter((f) => f.role === "service");
    const handlers = files.filter((f) => f.role === "handler");
    const tests = files.filter((f) => f.role === "test");

    // 1. Pair model + service if related
    for (const m of models) {
      if (used.has(m.fileId)) continue;
      const base = this.getBaseName(m.relativePath);
      const matchedService = services.find((s) => !used.has(s.fileId) && this.getBaseName(s.relativePath).includes(base));
      if (matchedService) {
        paired.push([m, matchedService]);
        used.add(m.fileId);
        used.add(matchedService.fileId);
      }
    }

    // 2. Pair handler + service
    for (const h of handlers) {
      if (used.has(h.fileId)) continue;
      const base = this.getBaseName(h.relativePath);
      const matchedService = services.find((s) => !used.has(s.fileId) && this.getBaseName(s.relativePath).includes(base));
      if (matchedService) {
        paired.push([h, matchedService]);
        used.add(h.fileId);
        used.add(matchedService.fileId);
      }
    }

    // 3. Pair function/service + unit test
    for (const t of tests) {
      if (used.has(t.fileId)) continue;
      const testBase = this.getBaseName(t.relativePath).replace(/_test|test|\.test|\.spec/, "");
      const matched = files.find((f) => !used.has(f.fileId) && f.role !== "test" && this.getBaseName(f.relativePath).includes(testBase));
      if (matched) {
        paired.push([matched, t]);
        used.add(matched.fileId);
        used.add(t.fileId);
      }
    }

    // 4. Remaining individual or paired files
    const remaining = files.filter((f) => !used.has(f.fileId));
    for (let i = 0; i < remaining.length; i += 2) {
      if (i + 1 < remaining.length && remaining[i].role === remaining[i + 1].role) {
        paired.push([remaining[i], remaining[i + 1]]);
      } else {
        paired.push([remaining[i]]);
        if (i + 1 < remaining.length) {
          paired.push([remaining[i + 1]]);
        }
      }
    }

    return paired;
  }

  private static getBaseName(relPath: string): string {
    const filename = relPath.split("/").pop() || "";
    return filename.split(".")[0].toLowerCase();
  }

  private static assignConceptsForFiles(pair: FileItem[], concepts: Concept[], position: number): Concept[] {
    if (position === 1) {
      return concepts.slice(0, 2);
    }
    const startIdx = Math.min(position - 1, concepts.length - 2);
    return concepts.slice(startIdx, startIdx + 3);
  }

  private static generateUnitTitle(pair: FileItem[], position: number): string {
    const names = pair.map((f) => f.relativePath.split("/").pop()).join(" & ");
    return `Unit ${position}: ${names}`;
  }

  private static generateSelectionReason(pair: FileItem[], position: number): string {
    const roles = pair.map((f) => f.role).join(", ");
    return `Selected based on natural learning progression (position ${position}) covering roles: ${roles}. Establishes core understanding before dependent layers.`;
  }

  private static generateObjectives(pair: FileItem[], concepts: Concept[]): string[] {
    const objectives: string[] = [
      `Understand the syntax constructs and structure in ${pair.map((f) => f.relativePath).join(", ")}.`,
      ...concepts.map((c) => `Master concept: ${c.name}.`),
      `Articulate architectural tradeoffs and explain execution flow during technical interview.`,
    ];
    return objectives;
  }
}
