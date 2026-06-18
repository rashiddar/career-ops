---
name: karpathy-guidelines
description: Behavioral guidelines from Andrej Karpathy to reduce common LLM coding mistakes
metadata:
  type: feedback
---

Apply Karpathy's coding guidelines during implementation:
1. **Be surgical** - make minimal, precise changes. Don't refactor unrelated code.
2. **Surface assumptions** - ask about unclear requirements before implementing.
3. **Don't overcomplicate** - simplest correct solution wins. No premature abstractions.
4. **Verifiable success criteria** - define how we'll know the change works.
5. **Write defensive code** - handle edge cases, especially at system boundaries.
6. **Prefer flat over nested** - flat code is easier to read and debug.
7. **One thing at a time** - focus on completing one task before moving to the next.
8. **If it's not tested, it's broken** - tests are not optional for non-trivial changes.
