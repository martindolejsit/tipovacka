import AdminPanel from './AdminPanel'
import { stageOptions } from './stages'

function AdminPage({
  session,
  currentUserName,
  isAdmin,
  adminStatusLoaded,
  selectedStage,
  selectedRound,
  availableSelections,
  matches,
  loadingMatches,
  onLogout,
  onSelectStage,
  onSelectRound,
  onMatchCreated,
  onMatchUpdated,
  onMatchDeleted,
}) {
  if (!adminStatusLoaded) {
    return (
      <div className="admin-page">
        <div className="loading-state admin-page-loading">
          Ověřuji oprávnění…
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="access-denied-card">
          <span className="section-kicker">ADMINISTRACE</span>
          <h1>Přístup zamítnut</h1>
          <p>
            Tato stránka je dostupná pouze administrátorům.
          </p>
          <a className="primary-link-button" href="/">
            Zpět na tipovačku
          </a>
        </div>
      </div>
    )
  }

  const availableStages = stageOptions.filter((stage) =>
    availableSelections.some(
      (selection) => selection.stage === stage.value
    )
  )

  const availableRounds = [
    ...new Set(
      availableSelections
        .filter(
          (selection) => selection.stage === selectedStage
        )
        .map((selection) => selection.round)
    ),
  ].sort((a, b) => a - b)

  const selectedRoundIndex =
    availableRounds.indexOf(selectedRound)

  const previousRound =
    selectedRoundIndex > 0
      ? availableRounds[selectedRoundIndex - 1]
      : null

  const nextRound =
    selectedRoundIndex >= 0 &&
    selectedRoundIndex < availableRounds.length - 1
      ? availableRounds[selectedRoundIndex + 1]
      : null

  return (
    <div className="app-page admin-page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img
              className="brand-logo"
              src="/logo.png"
              alt="Tipovačka"
            />
            <div>
              <span className="brand-kicker">CHANCE LIGA</span>
              <strong>Administrace</strong>
            </div>
          </div>

          <div className="user-menu">
            <div className="user-copy">
              <span>Administrátor</span>
              <strong>
                {currentUserName || session.user.email}
              </strong>
            </div>

            <a className="ghost-button nav-link-button" href="/">
              Tipovačka
            </a>

            <a
              className="ghost-button nav-link-button"
              href="/results"
            >
              Výsledky
            </a>

            <button
              className="ghost-button"
              onClick={onLogout}
            >
              Odhlásit
            </button>
          </div>
        </div>
      </header>

      <main className="main-shell admin-main-shell">
        <section className="admin-heading-card">
          <div>
            <span className="section-kicker">SPRÁVA SOUTĚŽE</span>
            <h1>Administrace zápasů</h1>
            <p>
              Přidávání zápasů, změna termínů, výsledků a stavů.
            </p>
          </div>
        </section>

        <section className="admin-round-card">
          <div
            className="stage-tabs admin-stage-tabs"
            role="tablist"
            aria-label="Část soutěže"
          >
            {availableStages.map((stage) => (
              <button
                key={stage.value}
                type="button"
                className={`stage-tab ${
                  selectedStage === stage.value ? 'active' : ''
                }`}
                onClick={() => onSelectStage(stage.value)}
              >
                {stage.label}
              </button>
            ))}
          </div>

          <div className="round-toolbar">
            <button
              className="round-arrow"
              type="button"
              onClick={() =>
                previousRound && onSelectRound(previousRound)
              }
              disabled={previousRound === null}
              aria-label="Předchozí kolo"
            >
              ‹
            </button>

            <div className="round-title">
              <span className="section-kicker">UPRAVOVANÉ KOLO</span>
              <div className="round-select-row">
                <h2>
                  {selectedRound !== null
                    ? `${selectedRound}. kolo`
                    : 'Načítám kolo…'}
                </h2>

                <select
                  className="round-select"
                  value={selectedRound ?? ''}
                  onChange={(e) =>
                    onSelectRound(Number(e.target.value))
                  }
                >
                  {availableRounds.map((round) => (
                    <option key={round} value={round}>
                      {round}. kolo
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="round-arrow"
              type="button"
              onClick={() =>
                nextRound && onSelectRound(nextRound)
              }
              disabled={nextRound === null}
              aria-label="Další kolo"
            >
              ›
            </button>
          </div>
        </section>

        {loadingMatches && (
          <div className="loading-state match-loading">
            Načítám zápasy…
          </div>
        )}

        {!loadingMatches && (
          <section className="admin-shell standalone-admin-shell">
            <AdminPanel
              matches={matches}
              selectedStage={selectedStage}
              selectedRound={selectedRound}
              onMatchCreated={onMatchCreated}
              onMatchUpdated={onMatchUpdated}
              onMatchDeleted={onMatchDeleted}
            />
          </section>
        )}
      </main>
    </div>
  )
}

export default AdminPage
