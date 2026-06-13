// Minimal ambient types for jest-axe@9, which ships no declarations of its own.
// We assert on `results.violations` directly (see the a11y tests), so we deliberately
// avoid @types/jest-axe — it augments the jest matcher namespace (toHaveNoViolations),
// not vitest's. Shared across packages/react and registry via each tsconfig's `include`.
declare module "jest-axe" {
  export function axe(
    html: Element | string,
    options?: Record<string, unknown>,
  ): Promise<{ violations: unknown[] }>;
}
