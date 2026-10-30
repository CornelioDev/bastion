// SPDX-License-Identifier: MIT OR Apache-2.0

// Helpers shared by the components; the shadcn-vue CLI imports them from
// `@/lib/utils` (components.json, `aliases.utils`).

/**
 * Joins class names, dropping falsy ones, and resolves conflicting Tailwind
 * classes so that the last one wins: `cn("px-2", isWide && "px-4")`.
 */
export { cn } from "cn";
