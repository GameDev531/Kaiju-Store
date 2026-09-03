/**
 * Route-level loading state. Announced to assistive technology, so a slow page
 * is not silence for a screen-reader user.
 */
export default function Loading() {
  return (
    <div className="wrap section" role="status" aria-live="polite">
      <span className="sr-only">Carregando a página…</span>
      <div className="skeleton" style={{ height: 42, width: "45%" }} />
      <div className="skeleton" style={{ height: 16, width: "70%", marginTop: "1.5rem" }} />
      <div className="skeleton" style={{ height: 16, width: "58%", marginTop: "0.75rem" }} />
      <div className="grid-products" style={{ marginTop: "3rem" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="skeleton" style={{ aspectRatio: "3 / 4" }} />
            <div className="skeleton" style={{ height: 14, marginTop: "0.75rem", width: "80%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
