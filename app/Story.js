"use client";

const row = { borderTop: "1px solid rgba(128,128,128,0.35)", padding: "12px 0" };

export default function Story() {
  return (
    <div style={{ marginTop: "40px", maxWidth: "640px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>What Plyde does for you</h2>
      <p className="note" style={{ margin: "0 0 12px" }}>
        An example for a freelance web designer.
      </p>

      <div style={row}>
        <p style={{ margin: "0 0 4px" }}>
          <b>1. It learns what you sell</b>
        </p>
        <p className="note-s" style={{ margin: 0 }}>
          Plyde reads your website and works out your services and what makes you different.
        </p>
      </div>

      <div style={row}>
        <p style={{ margin: "0 0 4px" }}>
          <b>2. It works out who buys it</b>
        </p>
        <p className="note-s" style={{ margin: 0 }}>
          Local restaurants (91% fit) · Boutique gyms (84%) · Dental clinics (78%)
        </p>
      </div>

      <div style={row}>
        <p style={{ margin: "0 0 4px" }}>
          <b>3. It finds the people</b>
        </p>
        <p className="note-s" style={{ margin: 0 }}>
          Real companies, the owner or marketing lead when their site names one, and a public
          email address that passes a check.
        </p>
      </div>

      <div style={row}>
        <p style={{ margin: "0 0 4px" }}>
          <b>4. It writes a personal email</b>
        </p>
        <p className="note-s" style={{ margin: 0 }}>
          Each draft mentions something real from that company's own site. No generic pitch.
        </p>
      </div>

      <div style={row}>
        <p style={{ margin: "0 0 4px" }}>
          <b>5. You approve, Plyde sends</b>
        </p>
        <p className="note-s" style={{ margin: 0 }}>
          Read the list, tap one button, and the emails go out one at a time from your own Gmail.
          You choose how many per day.
        </p>
      </div>

      <div style={row}>
        <p style={{ margin: "0 0 4px" }}>
          <b>6. It helps you book the call</b>
        </p>
        <p className="note-s" style={{ margin: 0 }}>
          Your Calendly or Cal.com link goes in every email, booked calls show on your dashboard,
          and follow-ups are drafted for you to approve.
        </p>
      </div>

      <p className="note-s" style={{ marginTop: "12px" }}>
        Pay only for the emails you send. New accounts start with free credits.
      </p>
    </div>
  );
            }
