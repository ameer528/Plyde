"use client";

import { useState, useEffect } from "react";

const FROM = "businesses";
const TO = "clients";

export default function Rewrite() {
  const [text, setText] = useState(FROM);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(TO);
      return;
    }
    const timers = [];
    let t = 2800;
    for (let i = FROM.length - 1; i >= 0; i--) {
      const next = FROM.slice(0, i);
      timers.push(
        setTimeout(() => {
          setWorking(true);
          setText(next);
        }, t)
      );
      t += 45;
    }
    t += 150;
    for (let i = 1; i <= TO.length; i++) {
      const next = TO.slice(0, i);
      timers.push(setTimeout(() => setText(next), t));
      t += 75;
    }
    timers.push(setTimeout(() => setWorking(false), t + 400));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <span>
      {text}
      <span className={"caret" + (working ? " on" : "")} aria-hidden="true" />
    </span>
  );
}
