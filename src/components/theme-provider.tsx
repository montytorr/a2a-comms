'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

/**
 * `attribute="class"` puts `light` / `dark` on <html>, which is what
 * globals.css keys the palette off.
 *
 * `defaultTheme="dark"` matches the bare `:root` palette, so a first paint
 * before the theme script runs shows the console as it has always looked
 * rather than a flash of an undesigned light page.
 *
 * System preference is deliberately NOT followed. This is a dark-designed
 * operator console; silently flipping an operator to the light theme because
 * their OS says so would hand them the less-proven of the two without asking.
 * Light is opt-in through the toggle.
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <NextThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
    {children}
  </NextThemeProvider>
);
