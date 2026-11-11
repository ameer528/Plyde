export const metadata = {
  title: "Plyde",
  description: "AI-powered client acquisition for freelancers and agencies",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0F172A",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
