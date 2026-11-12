import logo from "./logo-icon.png";

const features = [
  {
    title: "Smart prospecting",
    text: "Add businesses and see why each one might need your service.",
  },
  {
    title: "Personalized outreach",
    text: "Get email drafts based on each prospect's real website.",
  },
  {
    title: "You stay in control",
    text: "Nothing is sent until you review, edit and approve it.",
  },
  {
    title: "Pipeline and follow-ups",
    text: "Track every prospect and never forget a follow-up.",
  },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        color: "#F8FAFC",
        padding: "24px",
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          maxWidth: "960px",
          margin: "0 auto",
        }}
      >
        <img src={logo.src} alt="Plyde logo" width={40} height={40} />
        <span style={{ fontSize: "24px", fontWeight: 700 }}>Plyde</span>
      </nav>

      <section
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "64px 0 48px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(34px, 8vw, 56px)",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Find opportunities.{" "}
          <span style={{ color: "#7C3AED" }}>Close more.</span>
        </h1>
        <p
          style={{
            fontSize: "18px",
            color: "#94A3B8",
            lineHeight: 1.5,
            margin: "20px auto 32px",
            maxWidth: "520px",
          }}
        >
          Plyde helps freelancers and small agencies research prospects and
          write personalized outreach, while you stay in full control.
        </p>
        <a
          href="/login"
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
            color: "#F8FAFC",
            padding: "14px 32px",
            borderRadius: "12px",
            fontWeight: 600,
            fontSize: "16px",
            textDecoration: "none",
          }}
        >
          Get started
        </a>
      </section>

      <section
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          paddingBottom: "48px",
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              background: "#1E293B",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "20px",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "18px" }}>{f.title}</h3>
            <p style={{ margin: 0, color: "#94A3B8", lineHeight: 1.5 }}>
              {f.text}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
