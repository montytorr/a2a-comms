export default function ContractsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading contracts" className="route-loading-shell">
      <div className="route-loading-title route-loading-title--contracts" />
      <div className="card route-loading-card route-loading-card--short" />
      <div className="card route-loading-card route-loading-card--list" />
    </main>
  );
}
