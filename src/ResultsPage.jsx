import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { getStageOrder, stageLabels, stageOptions } from './stages'
import Topbar from './Topbar'

const rankLabels = ['🥇', '🥈', '🥉']

const pointLabels = {
  5: 'Přesný tip',
  3: 'Správný výsledek + blízké skóre',
  2: 'Správný výsledek',
  0: 'Bez bodu',
}

function ResultsPage({
  session,
  currentUserName,
  isAdmin,
  onLogout,
}) {
  const [availableSelections, setAvailableSelections] = useState([])
  const [selectedStage, setSelectedStage] = useState(null)
  const [selectedRound, setSelectedRound] = useState(null)
  const [matches, setMatches] = useState([])
  const [predictionsByMatch, setPredictionsByMatch] = useState({})
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [message, setMessage] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)

  useEffect(() => {
    async function loadLeaderboard() {
      if (!session) {
        setLeaderboard([])
        setLoadingLeaderboard(false)
        return
      }

      setLoadingLeaderboard(true)

      const { data: totals, error: totalsError } = await supabase
        .from('leaderboard_totals')
        .select(`
          user_id,
          total_points,
          exact_tips,
          correct_tips,
          tip_count
        `)
        .order('total_points', { ascending: false })
        .order('exact_tips', { ascending: false })

      if (totalsError) {
        console.error(totalsError)
        setLoadingLeaderboard(false)
        return
      }

      const userIds = totals.map((row) => row.user_id)

      if (userIds.length === 0) {
        setLeaderboard([])
        setLoadingLeaderboard(false)
        return
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)

      if (profilesError) {
        console.error(profilesError)
        setLoadingLeaderboard(false)
        return
      }

      const profileMap = Object.fromEntries(
        profiles.map((profile) => [
          profile.id,
          profile.display_name,
        ])
      )

      setLeaderboard(
        totals.map((row) => ({
          ...row,
          display_name:
            profileMap[row.user_id] ?? 'Neznámý hráč',
        }))
      )
      setLoadingLeaderboard(false)
    }

    loadLeaderboard()
  }, [session])

  useEffect(() => {
    async function loadHistoryIndex() {
      if (!session) {
        return
      }

      setLoadingIndex(true)
      setMessage('')

      const { data: season, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()

      if (seasonError) {
        console.error(seasonError)
        setMessage('Nepodařilo se načíst aktivní sezonu.')
        setLoadingIndex(false)
        return
      }

      const { data, error } = await supabase
        .from('matches')
        .select(`
          stage,
          round,
          kickoff_at
        `)
        .eq('season_id', season.id)
        .eq('status', 'finished')
        .order('kickoff_at')

      if (error) {
        console.error(error)
        setMessage('Nepodařilo se načíst seznam odehraných kol.')
        setLoadingIndex(false)
        return
      }

      const grouped = new Map()

      data.forEach((match) => {
        const stage = match.stage ?? 'regular'
        const key = `${stage}:${match.round}`
        const kickoff = new Date(match.kickoff_at).getTime()

        if (!grouped.has(key)) {
          grouped.set(key, {
            stage,
            round: match.round,
            latestKickoff: kickoff,
          })
          return
        }

        const current = grouped.get(key)

        if (kickoff > current.latestKickoff) {
          current.latestKickoff = kickoff
        }
      })

      const selections = [...grouped.values()].sort((a, b) => {
        if (a.latestKickoff !== b.latestKickoff) {
          return a.latestKickoff - b.latestKickoff
        }

        const stageDifference =
          getStageOrder(a.stage) - getStageOrder(b.stage)

        if (stageDifference !== 0) {
          return stageDifference
        }

        return a.round - b.round
      })

      setAvailableSelections(selections)

      if (selections.length === 0) {
        setSelectedStage(null)
        setSelectedRound(null)
        setLoadingIndex(false)
        return
      }

      const latest = selections[selections.length - 1]

      setSelectedStage(latest.stage)
      setSelectedRound(latest.round)
      setLoadingIndex(false)
    }

    loadHistoryIndex()
  }, [session])

  useEffect(() => {
    async function loadResults() {
      if (
        !session ||
        selectedStage === null ||
        selectedRound === null
      ) {
        setMatches([])
        setPredictionsByMatch({})
        return
      }

      setLoadingResults(true)
      setMessage('')

      const { data: season, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()

      if (seasonError) {
        console.error(seasonError)
        setMessage('Nepodařilo se načíst aktivní sezonu.')
        setLoadingResults(false)
        return
      }

      const { data: matchesData, error: matchesError } =
        await supabase
          .from('matches')
          .select(`
            id,
            stage,
            round,
            kickoff_at,
            home_score,
            away_score,
            status,
            home_team:teams!matches_home_team_id_fkey (
              id,
              name,
              short_name,
              logo_url
            ),
            away_team:teams!matches_away_team_id_fkey (
              id,
              name,
              short_name,
              logo_url
            )
          `)
          .eq('season_id', season.id)
          .eq('stage', selectedStage)
          .eq('round', selectedRound)
          .eq('status', 'finished')
          .order('kickoff_at')

      if (matchesError) {
        console.error(matchesError)
        setMessage('Nepodařilo se načíst výsledky zápasů.')
        setLoadingResults(false)
        return
      }

      setMatches(matchesData)

      const matchIds = matchesData.map((match) => match.id)

      if (matchIds.length === 0) {
        setPredictionsByMatch({})
        setLoadingResults(false)
        return
      }

      const { data: predictionsData, error: predictionsError } =
        await supabase
          .from('predictions')
          .select(`
            id,
            match_id,
            user_id,
            home_score,
            away_score,
            points
          `)
          .in('match_id', matchIds)

      if (predictionsError) {
        console.error(predictionsError)
        setMessage(
          'Nepodařilo se načíst tipy hráčů. Zkontroluj RLS policy pro historické tipy.'
        )
        setPredictionsByMatch({})
        setLoadingResults(false)
        return
      }

      const userIds = [
        ...new Set(
          predictionsData.map((prediction) => prediction.user_id)
        ),
      ]

      let profileMap = new Map()

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } =
          await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds)

        if (profilesError) {
          console.error(profilesError)
          setMessage('Nepodařilo se načíst jména hráčů.')
          setLoadingResults(false)
          return
        }

        profileMap = new Map(
          profilesData.map((profile) => [
            profile.id,
            profile.display_name,
          ])
        )
      }

      const groupedPredictions = {}

      matchIds.forEach((matchId) => {
        groupedPredictions[matchId] = []
      })

      predictionsData.forEach((prediction) => {
        if (!groupedPredictions[prediction.match_id]) {
          groupedPredictions[prediction.match_id] = []
        }

        groupedPredictions[prediction.match_id].push({
          ...prediction,
          display_name:
            profileMap.get(prediction.user_id) ?? 'Neznámý hráč',
        })
      })

      Object.values(groupedPredictions).forEach((predictions) => {
        predictions.sort((a, b) => {
          if (b.points !== a.points) {
            return b.points - a.points
          }

          return a.display_name.localeCompare(
            b.display_name,
            'cs'
          )
        })
      })

      setPredictionsByMatch(groupedPredictions)
      setLoadingResults(false)
    }

    loadResults()
  }, [session, selectedStage, selectedRound])

  const availableStages = useMemo(
    () =>
      stageOptions.filter((stage) =>
        availableSelections.some(
          (selection) => selection.stage === stage.value
        )
      ),
    [availableSelections]
  )

  const availableRounds = useMemo(
    () =>
      [
        ...new Set(
          availableSelections
            .filter(
              (selection) =>
                selection.stage === selectedStage
            )
            .map((selection) => selection.round)
        ),
      ].sort((a, b) => a - b),
    [availableSelections, selectedStage]
  )

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

  function selectStage(stage) {
    const rounds = availableSelections
      .filter((selection) => selection.stage === stage)
      .sort((a, b) => a.round - b.round)

    if (rounds.length === 0) {
      return
    }

    setSelectedStage(stage)
    setSelectedRound(rounds[rounds.length - 1].round)
  }

  function formatKickoff(kickoffAt) {
    return new Intl.DateTimeFormat('cs-CZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Prague',
    }).format(new Date(kickoffAt))
  }

  return (
    <div className="app-page results-page">
      <Topbar
        page="results"
        title="Výsledky tipování"
        session={session}
        currentUserName={currentUserName}
        isAdmin={isAdmin}
        onLogout={onLogout}
      />

      <main className="main-shell results-main-shell">
        <section className="results-heading-card">
          <div>
            <span className="section-kicker">
              HISTORIE TIPŮ
            </span>
            <h1>Výsledky tipování</h1>
            <p>
              Po dohrání zápasu jsou vidět tipy všech hráčů,
              skutečný výsledek i získané body.
            </p>

            <div
              className="points-legend"
              aria-label="Legenda bodování"
            >
              <span className="points-legend-item">
                <span className="history-points history-points-5">
                  5 b
                </span>
                Přesně
              </span>

              <span className="points-legend-item">
                <span className="history-points history-points-3">
                  3 b
                </span>
                Blízké skóre
              </span>

              <span className="points-legend-item">
                <span className="history-points history-points-2">
                  2 b
                </span>
                Správný vítěz / remíza
              </span>

              <span className="points-legend-item">
                <span className="history-points history-points-0">
                  0 b
                </span>
                Bez bodu
              </span>
            </div>
          </div>
        </section>

        <section className="leaderboard-card">
          <div className="section-heading">
            <div>
              <h2>CELKOVÉ POŘADÍ</h2>
            </div>

            <span className="section-meta">
              {leaderboard.length} hráčů
            </span>
          </div>

          {loadingLeaderboard && (
            <div className="loading-state">Načítám pořadí…</div>
          )}

          {!loadingLeaderboard && leaderboard.length === 0 && (
            <div className="empty-state">
              Zatím tu nejsou žádné výsledky.
            </div>
          )}

          {!loadingLeaderboard && leaderboard.length > 0 && (
            <div className="leaderboard-wrap">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Poř.</th>
                    <th>Hráč</th>
                    <th>Body</th>
                    <th>Přesně</th>
                    <th>Správně</th>
                    <th>Tipů</th>
                  </tr>
                </thead>

                <tbody>
                  {leaderboard.map((player, index) => (
                    <tr
                      key={player.user_id}
                      className={
                        index < 3
                          ? `rank-row rank-${index + 1}`
                          : ''
                      }
                    >
                      <td>
                        <span className="rank">
                          {rankLabels[index] ?? `${index + 1}.`}
                        </span>
                      </td>
                      <td>
                        <strong>{player.display_name}</strong>
                      </td>
                      <td>
                        <strong className="points">
                          {player.total_points}
                        </strong>
                      </td>
                      <td>{player.exact_tips}</td>
                      <td>{player.correct_tips}</td>
                      <td>{player.tip_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {loadingIndex && (
          <div className="loading-state">
            Načítám odehraná kola…
          </div>
        )}

        {!loadingIndex && availableSelections.length === 0 && (
          <div className="empty-state">
            Zatím nejsou dohrané žádné zápasy.
          </div>
        )}

        {!loadingIndex && availableSelections.length > 0 && (
          <>
            <section className="results-filter-card">
              <div
                className="stage-tabs"
                role="tablist"
                aria-label="Část soutěže"
              >
                {availableStages.map((stage) => (
                  <button
                    key={stage.value}
                    type="button"
                    className={`stage-tab ${
                      selectedStage === stage.value
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => selectStage(stage.value)}
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
                    previousRound !== null &&
                    setSelectedRound(previousRound)
                  }
                  disabled={previousRound === null}
                  aria-label="Předchozí kolo"
                >
                  ‹
                </button>

                <div className="round-title">
                  <span className="section-kicker">
                    {stageLabels[selectedStage] ??
                      'ODEHRANÉ ZÁPASY'}
                  </span>

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
                        setSelectedRound(
                          Number(e.target.value)
                        )
                      }
                      aria-label="Vybrat kolo"
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
                    nextRound !== null &&
                    setSelectedRound(nextRound)
                  }
                  disabled={nextRound === null}
                  aria-label="Další kolo"
                >
                  ›
                </button>
              </div>
            </section>

            {message && (
              <div className="results-message">
                {message}
              </div>
            )}

            {loadingResults && (
              <div className="loading-state">
                Načítám tipy hráčů…
              </div>
            )}

            {!loadingResults && matches.length > 0 && (
              <section className="results-matches-grid">
                {matches.map((match) => {
                  const predictions =
                    predictionsByMatch[match.id] ?? []

                  return (
                    <article
                      key={match.id}
                      className="result-match-card"
                    >
                      <div className="result-match-meta">
                        <span>
                          {formatKickoff(match.kickoff_at)}
                        </span>
                        <span className="status-pill status-pill-finished">
                          Dohráno
                        </span>
                      </div>

                      <div className="result-scoreboard">
                        <div className="result-team result-team-home">
                          {match.home_team.logo_url ? (
                            <img
                              className="result-team-logo"
                              src={match.home_team.logo_url}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span className="team-code">
                              {match.home_team.short_name}
                            </span>
                          )}
                          <strong>
                            {match.home_team.name}
                          </strong>
                        </div>

                        <div
                          className="result-final-score"
                          aria-label="Konečný výsledek"
                        >
                          <strong>
                            {match.home_score ?? '–'}
                          </strong>
                          <span>:</span>
                          <strong>
                            {match.away_score ?? '–'}
                          </strong>
                        </div>

                        <div className="result-team result-team-away">
                          {match.away_team.logo_url ? (
                            <img
                              className="result-team-logo"
                              src={match.away_team.logo_url}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span className="team-code">
                              {match.away_team.short_name}
                            </span>
                          )}
                          <strong>
                            {match.away_team.name}
                          </strong>
                        </div>
                      </div>

                      <div className="prediction-history">
                        <div className="prediction-history-heading">
                          <strong>Tipy hráčů</strong>
                          <span>
                            {predictions.length}{' '}
                            {predictions.length === 1
                              ? 'tip'
                              : predictions.length >= 2 &&
                                  predictions.length <= 4
                                ? 'tipy'
                                : 'tipů'}
                          </span>
                        </div>

                        {predictions.length === 0 ? (
                          <div className="result-no-tips">
                            Tento zápas nikdo netipoval.
                          </div>
                        ) : (
                          <div className="prediction-history-table-wrap">
                            <table className="prediction-history-table">
                              <thead>
                                <tr>
                                  <th>Hráč</th>
                                  <th>Tip</th>
                                  <th>Body</th>
                                </tr>
                              </thead>
                              <tbody>
                                {predictions.map((prediction) => (
                                  <tr key={prediction.id}>
                                    <td>
                                      <strong>
                                        {prediction.display_name}
                                      </strong>
                                    </td>
                                    <td>
                                      <span className="history-tip-score">
                                        {prediction.home_score}
                                        <span>:</span>
                                        {prediction.away_score}
                                      </span>
                                    </td>
                                    <td>
                                      <span
                                        className={`history-points history-points-${prediction.points}`}
                                        title={
                                          pointLabels[
                                            prediction.points
                                          ] ?? ''
                                        }
                                      >
                                        {prediction.points} b
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default ResultsPage