export function WorkspaceLoading() {
  return <section className="workspace-loading" aria-busy="true" aria-label="Loading workspace">
    <p role="status">Loading your workspace…</p>
    <div className="skeleton skeleton-title" aria-hidden="true"/>
    <div className="skeleton skeleton-intro" aria-hidden="true"/>
    <div className="skeleton-grid" aria-hidden="true">{[0,1,2,3].map(n=><div className="skeleton skeleton-metric" key={n}/>)}</div>
    <div className="skeleton skeleton-panel" aria-hidden="true"/>
  </section>;
}
