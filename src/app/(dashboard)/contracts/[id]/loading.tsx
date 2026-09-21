export default function ContractLoading() {
  return (
    <main aria-busy="true" aria-label="Loading contract" className="route-loading-shell">
      <div className="route-loading-title" />
      <div className="card route-loading-card route-loading-card--detail" />
      <div className="card route-loading-card route-loading-card--body" />
    </main>
  );
}
