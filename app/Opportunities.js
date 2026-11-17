"use client";

import "./opps.css";

export default function Opportunities({ opps, activeIndex, busy, onPick, note, onRetry }) {
  if (!opps || opps.length === 0) return null;
  return (
    <>
      <h2>Where your service is needed</h2>
      <p className="sub">
        Plyde looked beyond the obvious buyers. Industries marked Hidden are ones where the need is
        real but easy to miss. These are informed guesses from AI and web search, so check them
        before you build outreach around them. Tap one to search it.
      </p>
      {note && (
        <p className="msg">
          {note}{" "}
          <button className="btn" disabled={busy} onClick={onRetry}>
            Try industry mapping again
          </button>
        </p>
      )}
      {opps.map((o, i) => (
        <div key={o.name} className={"opp" + (i === activeIndex ? " on" : "")}>
          <div className="head">
            <h3>{o.name}</h3>
            <span className="tag">{o.fit_score} fit</span>
            {o.obviousness === "hidden" && <span className="hid">Hidden</span>}
            {i === activeIndex && <span className="tag">Searching now</span>}
          </div>
          {o.buyer && (
            <p>
              <span className="k">Decision makers: </span>
              {o.buyer}
            </p>
          )}
          {o.pain && (
            <p>
              <span className="k">Why they need it: </span>
              {o.pain}
            </p>
          )}
          {o.use && (
            <p>
              <span className="k">How they would use it: </span>
              {o.use}
            </p>
          )}
          {o.trigger && (
            <p>
              <span className="k">What makes it urgent: </span>
              {o.trigger}
            </p>
          )}
          <p>
            <button className="btn" disabled={busy} onClick={() => onPick(i)}>
              Find companies in this industry
            </button>
          </p>
        </div>
      ))}
    </>
  );
}
