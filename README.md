# OnPaper

Project-Based Technical Interview Readiness Platform.

OnPaper turns any existing software project into a structured, stateful interview-preparation curriculum. Designed for agentic IDEs, local offline-first execution, serverless cloud synchronization with zero idle cost, and companion review on iOS.

---

## Key Features

- **Local Core & Offline-First State**: High-performance SQLite engine (`.interview-prep/state/learning.db`) tracking curriculum units, sessions, questions, attempts, mistakes, and FSRS spaced repetition cards.
- **Repository Structural Analyzer**: Scans projects across multiple languages (TypeScript, Go, Python, Swift, Rust, Java), extracting domain models, services, handlers, tests, and syntax constructs.
- **Natural Chronological Curriculum Planner**: Orders learning units based on architectural dependencies and cognitive load rather than raw commit history.
- **Structured 20-Point Interview Rubric**: Evaluates conceptual accuracy, syntax understanding, execution reasoning, design tradeoffs, and communication quality.
- **Temporary Sandbox Exercises**: Generates coding exercises in `.interview-prep/exercises/`, validates solutions in a non-destructive sandbox, commits grades durably, and verifies deletion.
- **FSRS-4.5 Spaced Repetition Engine**: Calculates mathematically optimal review intervals for concepts and identified misconceptions across `Again`, `Hard`, `Good`, and `Easy` ratings.
- **AWS Serverless Cloud Backend (Minimal Cost / Zero Idle Compute)**:
  - API Gateway HTTP API (`/v1/*`)
  - Node.js ARM64 Lambda handlers (`onpaper-api`, `onpaper-reminders`)
  - DynamoDB Single-Table Design (`onpaper-data`, On-Demand Pay-Per-Request)
  - Cognito User Pool (`onpaper-users`, 50k MAUs Free Tier)
  - S3 Export Bucket (`onpaper-exports-*`, 7-day lifecycle expiration)
  - EventBridge scheduled reminder evaluation
- **Companion iOS Integration in Traverse**: Dedicated tab and views for Daily Progress, Projects, Sessions History with Rubrics, Mistakes Tracker, Concept Mastery, and FSRS Flashcard Revisions.
- **Canonical Skill & IDE Adapters**: Ready-to-use skills and adapters for Antigravity, Zed, and Codex.

---

## Directory Structure

```text
onpaper/
├── .github/workflows/deploy.yml       # GitHub Actions CI/CD Pipeline
├── PROJECT_IMPLEMENTATION_BLUEPRINT.md# Canonical Product & System Blueprint
├── backend/
│   ├── src/
│   │   ├── api-handler.ts             # API Gateway HTTP API Lambda Router
│   │   ├── dynamodb.ts                # DynamoDB Single-Table Data Layer
│   │   └── reminder-handler.ts        # EventBridge Scheduled Reminder Lambda
│   ├── deploy.ts                      # Automated AWS Serverless Deployer
│   └── aws-exports.json               # Deployed AWS Infrastructure Endpoints
├── bin/
│   └── onpaper.js                     # CLI Executable Entry Point
├── skills/
│   ├── onpaper/SKILL.md               # Canonical Interview Readiness Skill
│   └── adapters/
│       ├── antigravity.md             # Antigravity IDE Adapter
│       ├── zed.md                     # Zed IDE Adapter
│       └── codex.md                   # Codex IDE Adapter
├── src/
│   ├── contracts/index.ts             # Shared Domain Types & JSON Schemas
│   ├── core/
│   │   ├── database.ts                # Local & Global SQLite Database Managers
│   │   ├── fsrs.ts                    # FSRS Spaced Repetition Engine
│   │   └── guards.ts                  # Safety & Traversal Policy Guards
│   ├── curriculum/
│   │   ├── analyzer.ts                # Multi-Language Structural Scanner
│   │   └── planner.ts                 # Natural Chronological Curriculum Planner
│   ├── exercises/
│   │   └── manager.ts                 # Sandbox Exercise Lifecycle Manager
│   ├── grading/
│   │   └── grader.ts                  # 20-pt and 100-pt Rubric Graders
│   ├── sync/
│   │   └── client.ts                  # Offline Outbox & Cloud Sync Client
│   └── cli/
│       └── index.ts                   # CLI Command-Line Tool
└── tests/
    ├── core.test.ts                   # Core Integration Tests
    ├── curriculum.test.ts             # Curriculum & Analysis Tests
    ├── grading_rubrics.test.ts        # Rubric & Misconception Tests
    ├── fsrs_advanced.test.ts          # FSRS Mathematical Progression Tests
    ├── cloud_sync.test.ts             # Cloud Sync & Outbox Tests
    ├── guards_security.test.ts        # Security & Traversal Guard Tests
    ├── exercise_lifecycle_stress.test.ts # Exercise Sandbox Stress Tests
    └── session_state_machine.test.ts  # Session State Machine Tests
```

---

## CLI Usage

### 1. Initialize a Project
```bash
npx onpaper init --name "My Project"
```

### 2. Check Learning Progress
```bash
npx onpaper status
```

### 3. Restore State at Start of Chat
```bash
npx onpaper restore
```

### 4. Start Next Unit
```bash
npx onpaper start-unit
```

### 5. Generate & Submit Interview Questions
```bash
npx onpaper ask-questions <unitId>
npx onpaper submit-answers -q <questionId> -s <sessionId> -a "<student answer>"
```

### 6. Sandbox Coding Exercises
```bash
npx onpaper create-exercise <unitId>
npx onpaper submit-exercise <exerciseId> --explanation "<explanation>"
```

### 7. Spaced Repetition Reviews
```bash
npx onpaper reviews due
npx onpaper reviews submit <cardId> <Again|Hard|Good|Easy>
```

### 8. Synchronize with Cloud
```bash
npx onpaper sync
```

---

## Testing

Run all 19 unit and integration test suites:

```bash
npm test
```

---

## Deployment

Deploy or update the serverless backend to AWS:

```bash
npm run deploy:backend
```

---

## License

MIT License.
