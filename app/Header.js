"use client";

import Link from "next/link";
import "./flow.css";
import "./header.css";
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
        <nav className="hnav">
          <Link href="/profile" className="plink">
            Profile
          </Link>
          <div className="status">
            {name ? name + ", " : ""}
            {gmail.email}{" "}
            <button className="textbtn" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
