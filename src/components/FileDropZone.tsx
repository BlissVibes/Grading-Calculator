import { useState, useRef, useCallback } from 'react';

interface Props {
  onImport: (content: string, filename: string) => void;
}

export default function FileDropZone({ onImport }: Props) {
  const [active, setActive] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList) => {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            onImport(reader.result, file.name);
          }
        };
        reader.readAsText(file);
      });
    },
    [onImport]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setActive(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handlePasteSubmit = () => {
    if (pasteText.trim()) {
      onImport(pasteText.trim(), 'pasted-export.txt');
      setPasteText('');
      setShowPaste(false);
    }
  };

  return (
    <div
      className={`drop-zone ${active ? 'drop-zone--active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setActive(true); }}
      onDragLeave={() => setActive(false)}
      onDrop={handleDrop}
    >
      <div className="drop-zone__main" onClick={() => inputRef.current?.click()}>
        <div className="drop-zone__icon">+</div>
        <div className="drop-zone__text">
          Drop CSV files here or <span className="drop-zone__link">browse</span>
        </div>
        <div className="drop-zone__hint">
          Supports Collectr CSV, TCGPlayer CSV, and TCGPlayer text exports
        </div>
      </div>

      {/* Explicit button for mobile – some browsers don't forward clicks from divs to hidden inputs */}
      <button
        className="drop-zone__paste-btn drop-zone__paste-btn--primary"
        style={{ marginTop: 12, width: '100%' }}
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
      >
        Choose File
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <button
        className={`drop-zone__paste-toggle ${showPaste ? 'drop-zone__paste-toggle--active' : ''}`}
        onClick={() => setShowPaste(!showPaste)}
      >
        {showPaste ? 'Hide text import' : 'Or paste a TCGPlayer text export'}
      </button>

      {showPaste && (
        <div className="drop-zone__paste-area">
          <textarea
            className="drop-zone__paste-textarea"
            rows={6}
            placeholder={'Paste your TCGPlayer text export here...\nExample: 1 Charizard ex [PRE] 230 (Holo Rare, NM) $42.50 each'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="drop-zone__paste-actions">
            <button
              className="drop-zone__paste-btn"
              onClick={() => { setPasteText(''); setShowPaste(false); }}
            >
              Cancel
            </button>
            <button
              className="drop-zone__paste-btn drop-zone__paste-btn--primary"
              disabled={!pasteText.trim()}
              onClick={handlePasteSubmit}
            >
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
