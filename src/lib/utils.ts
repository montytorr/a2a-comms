import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities beating earlier ones.
 *
 * Plain string concatenation does not do this: `"p-2" + " " + "p-4"` emits
 * both classes and the winner is whichever CSS rule happens to come later in
 * the stylesheet, not the one the caller passed last. `twMerge` resolves the
 * conflict by intent, which is what makes a component's `className` prop
 * actually able to override the component's own defaults.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
