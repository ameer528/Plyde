"use client";

import { LABELS, STAGES, socialLabel } from "./ui";
import Drafts from "./Drafts";

export default function Company({ d, copy, copied, gmail, onSent, sentInfo }) {
  const socialKeys = Object.keys(d.socials || {});
  const people = Array.isArray(d.people) ? d.people : [];
  return (
    <article className="company">
      <div className="score">
        {d.fit_score}
        <small>fit</small>
      </div>
      <div className="c-body">
        <div className="c-head">
          <h3 className="c-name">{d.site}</h3>
          <span className="tag">{STAGES[d.stage] || "Growing"}</span>
          {d.industry && <span className="tag">{d.industry}</span>}
        </div>
        <p>{d.company_summary}</p>
        <p>
          <strong>Why they may need you. </strong>
          {d.fit_reason}
        </p>
        <p className="fine">
          Evidence: {d.evidence}. Stage clue: {d.stage_evidence}. AI confidence: {d.confidence}.
        </p>

        <div className="contact">
          <strong style={{ color: "#000" }}>Decision makers</strong>
          {people.length > 0 ? (
            people.map((p) => (
              <div key={p.name}>
                {p.name}, {p.title}{" "}
                {p.linkedin && (
                  <a href={p.linkedin} target="_blank" rel="noreferrer">
                    LinkedIn
                  </a>
                )}{" "}
                {p.email && <span>{p.email}</span>}{" "}
                <a href={p.source} target="_blank" rel="noreferrer">
                  (source)
                </a>
              </div>
            ))
          ) : (
            <div>No named decision maker is published on their site.</div>
          )}

          <div style={{ marginTop: "10px" }}>
            {d.emails && d.emails.length > 0 ? (
              d.emails.map((m) => (
                <div key={m.email}>
                  Email: {m.email}{" "}
                  <a href={m.source} target="_blank" rel="noreferrer">
                    (source)
                  </a>
                </div>
              ))
            ) : (
              <div>
                No public email found.{" "}
                {d.contact_page && (
                  <a href={d.contact_page} target="_blank" rel="noreferrer">
                    Their contact page
                  </a>
                )}
              </div>
            )}
          </div>

          {socialKeys.length > 0 ? (
            <div className="handles">
              {socialKeys.map((k) => (
                <a key={k} className="handle" href={d.socials[k]} target="_blank" rel="noreferrer">
                  <b>{LABELS[k]}</b>
                  <span>{socialLabel(k, d.socials[k])}</span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: "8px" }}>No social accounts are linked on their site.</div>
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
    </article>
  );
            }
