"use client";

import Link from "next/link";
import "./flow.css";
import markImg from "./mark-white.png";
import wordImg from "./word-white.png";

export default function Header({ gmail, name, onDisconnect }) {
  return (
    <header className="bar">
      <Link href="/" className="brand">
        <img className="mark" src={markImg.src} alt="" />
        <img className="word" src={wordImg.src} alt="Plyde" />
      </Link>
      {gmail.loaded && gmail.connected && (
        <div className="status">
          {name ? name + ", " : ""}
          {gmail.email}{" "}
          <button className="textbtn" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </header>
  );
    }
