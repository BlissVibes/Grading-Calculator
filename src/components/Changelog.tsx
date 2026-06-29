import { CHANGELOG } from '../changelog';

interface Props {
  onBack: () => void;
}

export default function Changelog({ onBack }: Props) {
  return (
    <div className="app">
      <main className="app-main">
        <div className="changelog">
          <div className="changelog__header">
            <a
              href="/"
              className="changelog__back"
              onClick={(e) => { e.preventDefault(); onBack(); }}
            >
              ← Back to calculator
            </a>
            <h1 className="changelog__title">Changelog</h1>
            <p className="changelog__subtitle">Recent changes to the Grading Calculator</p>
          </div>

          {CHANGELOG.map((release, i) => (
            <section className="changelog-release" key={`${release.version ?? release.date}-${i}`}>
              <div className="changelog-release__head">
                <span className="changelog-release__date">{release.date}</span>
                {release.version && (
                  <span className="changelog-release__version">v{release.version}</span>
                )}
              </div>
              <ul className="changelog-release__items">
                {release.items.map((item, j) => (
                  <li className="changelog-item" key={j}>
                    {item.time && <span className="changelog-item__time">{item.time}</span>}
                    <span className="changelog-item__text">{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="changelog__footer">
            <a
              href="/"
              className="changelog__back"
              onClick={(e) => { e.preventDefault(); onBack(); }}
            >
              ← Back to calculator
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
