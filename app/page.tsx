export default function Home() {
  return (
    <main className="site-shell">
      <h1 className="sr-only">DevPilot AI software engineering agent</h1>
      <p className="sr-only">Explore a safe interactive demonstration of autonomous engineering missions, integrations, policy controls, and audit trails.</p>
      <iframe
        className="site-frame"
        src="/devpilot.html"
        title="DevPilot AI interactive command center"
      />
    </main>
  );
}
