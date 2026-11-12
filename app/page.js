
import logo from "./logo-icon.png";
import Analyzer from "./Analyzer";

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
          padding: "48px 0 24px",
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
          Enter your website. Plyde works out who is likely to buy from you and
          writes the first email.
        </p>
        <Analyzer />
      </section>
    </main>
  );
            }
