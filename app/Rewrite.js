"use client";

import { useState, useEffect } from "react";

const WORDS = ["businesses", "clients"];
const HOLD = 2800;
const ERASE = 45;
const TYPE = 75;
const GAP = 150;

const hidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

export default function Rewrite() {
  const [text, setText] = useState(WORDS[0]);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer;
    let cancelled = false;
    let index = 0;

    function wait(ms) {
      return new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      });
    }

    async function loop() {
      while (!cancelled) {
        await wait(HOLD);
        if (cancelled) return;
        const current = WORDS[index];
        const next = WORDS[(index + 1) % WORDS.length];

        setWorking(true);
        for (let i = current.length - 1; i >= 0; i--) {
          setText(current.slice(0, i));
          await wait(ERASE);
          if (cancelled) return;
        }
        await wait(GAP);
        for (let i = 1; i <= next.length; i++) {
          setText(next.slice(0, i));
          await wait(TYPE);
          if (cancelled) return;
        }
        index = (index + 1) % WORDS.length;
        setWorking(false);
      }
    }

    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <span aria-hidden="true">
        {text}
        <span className={"caret" + (working ? " on" : "")} />
      </span>
      <span style={hidden}>businesses</span>
    </>
  );
}
