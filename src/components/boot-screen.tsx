'use client';

import { useState, useEffect, useRef } from 'react';

export const BootScreen = () => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const innerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const outer = setTimeout(() => {
      setFading(true);
      innerTimer.current = setTimeout(() => setVisible(false), 300);
    }, 800);
    return () => {
      clearTimeout(outer);
      clearTimeout(innerTimer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div id="boot-screen" className={fading ? 'fade-out' : ''}>
      <span>booting control plane</span>&nbsp;<span className="blink">_</span>
    </div>
  );
};
