"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Header from "../Header";
import useGmail from "../useGmail";
import useName from "../useName";

export default function Welcome() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const { name, loaded, save } = useName(gmail.connected);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  useEffect(() => {
    if (loaded && name) router.replace("/");
  }, [loaded, name, router]);

  async function submit(e) {
    e.preventDefault();
    const n = input.trim();
    if (!n) return;
    await save(n);
    router.push("/");
  }

  return (
    <>
      <Header gmail={gmail} name="" onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">What name should go on your emails?</h1>
        <p className="lead">
          You only set this once. It follows your account, so you won't be asked again on another
          device.
        </p>
        <form className="ask" onSubmit={submit}>
          <input
            type="text"
            placeholder="Your name"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Your name"
          />
          <button type="submit" disabled={!input.trim()}>
            Continue
          </button>
        </form>
      </section>
    </>
  );
              }
