export default function HomePage() {
  return (
    <main className="shell">
      <section className="status-card" aria-labelledby="page-title">
        <p className="eyebrow">Rekad Mail</p>
        <h1 id="page-title">Mail client foundation</h1>
        <p>
          The JMAP connection is being verified before mailbox data is shown.
        </p>
        <p className="status-note">
          Phase 0 includes a server-side smoke command. No mailbox data is
          loaded in this page.
        </p>
      </section>
    </main>
  );
}
