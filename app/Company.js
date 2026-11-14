"use client";

import { card, ghost, LABELS, STAGES, scoreColor } from "./ui";
import Drafts from "./Drafts";

export default function Company({ d, copy, copied, gmail, onSent, sentInfo }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
        <strong style={{ wordBreak: "break-all" }}>{d.site}</strong>
        <span
          style={{
            background: scoreColor(d.fit_score),
            color: "#0F172A",
            fontWeight: 700,
            borderRadius: "8px",
            padding: "2px 10px",
            height: "fit-content",
          }}
        >
          {d.fit_score}%
        </span>
      </div>
      <p style={{ margin: "6px 0 0", color: "#94A3B8", fontSize: "13px" }}>
        {STAGES[d.stage] || "Growing"} (AI guess: {d.stage_evidence})
      </p>
      <p style={{ color: "#CBD5E1", margin: "10px 0 6px", lineHeight: 1.5 }}>
        {d.company_summary}
      </p>
      <p style={{ color: "#94A3B8", margin: "0 0 6px", fontSize: "14px", lineHeight: 1.5 }}>
        <strong style={{ color: "#CBD5E1" }}>Why they might need you: </strong>
        {d.fit_reason}
      </p>
      <p style={{ color: "#94A3B8", margin: "0 0 12px", fontSize: "14px" }}>
        <strong style={{ color: "#CBD5E1" }}>Evidence: </strong>
        {d.evidence} (AI confidence: {d.confidence})
      </p>

      <div style={{ fontSize: "14px", marginBottom: "12px" }}>
        <strong style={{ color: "#CBD5E1" }}>Public contact: </strong>
        {d.emails && d.emails.length > 0 ? (
          d.emails.map((m) => (
            <div key={m.email} style={{ color: "#94A3B8" }}>
              {m.email}{" "}
              <a href={m.source} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                (source)
              </a>
            </div>
          ))
        ) : (
          <span style={{ color: "#94A3B8" }}>
            No public email found.{" "}
            {d.contact_page && (
              <a href={d.contact_page} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                Their contact page
              </a>
            )}
          </span>
        )}
        {d.socials && Object.keys(d.socials).length > 0 && (
          <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {Object.keys(d.socials).map((k) => (
              <a key={k} href={d.socials[k]} target="_blank" rel="noreferrer" style={ghost}>
                {LABELS[k]}
              </a>
            ))}
          </div>
        )}
      </div>

      <Drafts
        d={d}
        copy={copy}
        copied={copied}
        gmail={gmail}
        onSent={onSent}
        sentInfo={sentInfo}
      />
    </div>
  );
  }
