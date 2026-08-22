---
date: 2026-08-21
kind: fixed
---

Nothing on screen changes with this one. It is the scaffolding underneath: the
design system's button styling is now read from the component that defines it
rather than kept as a second copy, the code that ships with the design system is
type-checked instead of exempted, and the screenshot tests can no longer report
themselves green without actually comparing anything.

That last one had been hiding a real fault in code that had never been checked —
an import of a package the project does not have. It is fixed.
