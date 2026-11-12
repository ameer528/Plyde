"use client";

import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const box = {
  width: "100%",
  padding: "14px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "#1E293B",
  color: "#F8FAFC",
  fontSize: "16px",
  boxSizing: "border-box",
};

const button = {
  width: "100%",
  padding: "14px",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
  color: "#F8FAFC",
  fontSize: "16px",
  fontWeight: 600,
  cursor: "pointer",
};

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session ? data.session.user : null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session ? session.user : null);
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else if (!data.session) {
        setMessage("Account created. Check your email to confirm it, then log in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setMessage(error.message);
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMessage("");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        color: "#F8FAFC",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <h1 style={{ textAlign: "center", marginTop: 0 }}>Plyde</h1>

        {user ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#94A3B8" }}>You are logged in as</p>
            <p style={{ fontWeight: 600, wordBreak: "break-all" }}>
              {user.email}
            </p>
            <button style={button} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 style={{ textAlign: "center", fontSize: "20px" }}>
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h2>
            <input
              style={box}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              style={box}
              type="password"
              placeholder="Password (6+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button style={button} type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : mode === "signup"
                ? "Sign up"
                : "Log in"}
            </button>
            {message && (
              <p style={{ color: "#F59E0B", textAlign: "center" }}>{message}</p>
            )}
            <p
              style={{
                textAlign: "center",
                color: "#94A3B8",
                cursor: "pointer",
              }}
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setMessage("");
              }}
            >
              {mode === "signup"
                ? "Already have an account? Log in"
                : "New here? Create an account"}
            </p>
          </form>
        )}
      </div>
    </main>
  );
        }
