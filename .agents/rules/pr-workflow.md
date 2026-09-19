# Git Workflow Rule: PR-Based Development Only

## Core Directive
- **Never push commits directly to `main`**.
- All changes (features, bug fixes, documentation, refactoring, specs) MUST be developed on dedicated topic/feature branches.

## Pull Request Standard Operating Procedure (SOP)
1. **Branch Creation**: Create a descriptive feature/fix branch off `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b <type>/<short-description>  # e.g., feat/add-logging or fix/drift-parser
   ```
2. **Commit Standard**: Ensure code builds and tests pass locally before committing.
3. **Pushing Topic Branch**: Push topic branch to origin:
   ```bash
   git push -u origin <type>/<short-description>
   ```
4. **Pull Request Creation**: Open a Pull Request for human review using `gh pr create` or GitHub web UI.
