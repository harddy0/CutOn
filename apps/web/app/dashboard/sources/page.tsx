export default function SourcesPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-ink">Documents</h1>
        <p className="text-sm font-mono text-ink-muted">Uploaded PDFs and text files — parsed, chunked, and embedded.</p>
      </div>

      <div className="rounded-[4px] bg-surface border-2 border-ink p-8 shadow-hard text-center">
        <p className="text-sm font-mono font-bold text-ink-muted">Upload your first PDF or TXT document to get started.</p>
      </div>
    </div>
  );
}
