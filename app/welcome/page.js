"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../Header";
import useGmail from "../useGmail";

export default function Welcome() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      setName(localStorage.getItem("plyde_name") || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  function save(e) {
    e.preventDefault();
    const n = name.trim().slice(0, 60);
    if (!n) return;
    try {
      localStorage.setItem("plyde_name", n);
    } catch {}
    router.push("/");
  }

  return (
    <>
      <Header gmail={gmail} name="" onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">What name should go on your emails?</h1>
        <p className="lead">You only set this once. Plyde signs every message with it.</p>
        <form className="ask" onSubmit={save}>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Your name"
          />
          <button type="submit" disabled={!name.trim()}>
            Continue
          </button>
        </form>
      </section>
    </>
  );
    }
