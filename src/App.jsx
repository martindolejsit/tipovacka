import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import AdminPage from './AdminPage'
import ResultsPage from './ResultsPage'
import Topbar from './Topbar'
import './App.css'
import { getStageOrder, stageLabels, stageOptions } from './stages'

const statusLabels = {
  scheduled: 'Naplánováno',
  live: 'Probíhá',
  finished: 'Dohráno',
  postponed: 'Odloženo',
  cancelled: 'Zrušeno',
}

const rankLabels = ['🥇', '🥈', '🥉']

function App() {
  const [session, setSession] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')

  const [matches, setMatches] = useState([])
  const [tips, setTips] = useState({})
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [leaderboard, setLeaderboard] = useState([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminStatusLoaded, setAdminStatusLoaded] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const [selectedStage, setSelectedStage] = useState(null)
  const [selectedRound, setSelectedRound] = useState(null)
  const [selectionManuallyChanged, setSelectionManuallyChanged] = useState(false)
  const [availableSelections, setAvailableSelections] = useState([])
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0)
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0)

  // =========================
  // AUTH
  // =========================

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  // =========================
  // ZÁPASY + EXISTUJÍCÍ TIPY
  // =========================

  useEffect(() => {
    async function loadData() {
      if (!session || selectedStage === null || selectedRound === null) {
        setMatches([])
        setTips({})
        return
      }

      setLoadingMatches(true)

      const { data: season, error: seasonError } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('is_active', true)
        .single()

      if (seasonError) {
        console.error(seasonError)
        setLoadingMatches(false)
        return
      }

      const { data: matchesData, error: matchesError } = await supabase
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
        .order('kickoff_at')

      if (matchesError) {
        console.error(matchesError)
        setLoadingMatches(false)
        return
      }

      setMatches(matchesData)

      const matchIds = matchesData.map((match) => match.id)

      let predictionsData = []

      if (matchIds.length > 0) {
        const { data, error } = await supabase
          .from('predictions')
          .select(`
            id,
            match_id,
            home_score,
            away_score
          `)
          .eq('user_id', session.user.id)
          .in('match_id', matchIds)

        if (error) {
          console.error(error)
        } else {
          predictionsData = data
        }
      }

      const loadedTips = {}

      matchesData.forEach((match) => {
        const existingPrediction = predictionsData.find(
          (prediction) => prediction.match_id === match.id
        )

        loadedTips[match.id] = {
          predictionId: existingPrediction?.id ?? null,
          home_score:
            existingPrediction?.home_score?.toString() ?? '',
          away_score:
            existingPrediction?.away_score?.toString() ?? '',
          message: '',
          saving: false,
        }
      })

      setTips(loadedTips)
      setLoadingMatches(false)
    }

    loadData()
  }, [session, selectedStage, selectedRound, matchesRefreshKey])

  // =========================
  // LEADERBOARD
  // =========================

  useEffect(() => {
    async function loadLeaderboard() {
      if (!session) {
        setLeaderboard([])
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

      const result = totals.map((row) => ({
        ...row,
        display_name:
          profileMap[row.user_id] ?? 'Neznámý hráč',
      }))

      setLeaderboard(result)
      setLoadingLeaderboard(false)
    }

    loadLeaderboard()
  }, [session, leaderboardRefreshKey])

  // =========================
  // ADMIN STATUS
  // =========================

  useEffect(() => {
    async function loadAdminStatus() {
      setAdminStatusLoaded(false)

      if (!session) {
        setIsAdmin(false)
        setCurrentUserName('')
        setAdminStatusLoaded(true)
        return
      }

      const { data, error } = await supabase
		.from('profiles')
		.select('is_admin, display_name')
		.eq('id', session.user.id)
		.single()

      if (error) {
        console.error(error)
        setIsAdmin(false)
        setCurrentUserName('')
        setAdminStatusLoaded(true)
        return
      }

      setIsAdmin(data.is_admin === true)
      setCurrentUserName(data.display_name ?? '')
      setAdminStatusLoaded(true)
    }

    loadAdminStatus()
  }, [session])

  // =========================
  // AUTOMATICKÝ VÝBĚR FÁZE + KOLA
  // =========================

  useEffect(() => {
    async function loadAvailableSelections() {
      const { data: season, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()

      if (seasonError) {
        console.error(seasonError)
        return
      }

      const { data, error } = await supabase
        .from('matches')
        .select(`
          stage,
          round,
          kickoff_at,
          status
        `)
        .eq('season_id', season.id)
        .order('kickoff_at')

      if (error) {
        console.error(error)
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
            kickoffTimes: [],
            hasLive: false,
          })
        }

        const group = grouped.get(key)

        if (
          Number.isFinite(kickoff) &&
          match.status !== 'cancelled' &&
          match.status !== 'postponed'
        ) {
          group.kickoffTimes.push(kickoff)
        }

        if (match.status === 'live') {
          group.hasLive = true
        }
      })

      const selections = [...grouped.values()]
        .map((group) => {
          const kickoffTimes = group.kickoffTimes.sort(
            (a, b) => a - b
          )

          if (kickoffTimes.length === 0) {
            return null
          }

          return {
            stage: group.stage,
            round: group.round,
            firstKickoff: kickoffTimes[0],
            lastKickoff:
              kickoffTimes[kickoffTimes.length - 1],
            hasLive: group.hasLive,
          }
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.firstKickoff !== b.firstKickoff) {
            return a.firstKickoff - b.firstKickoff
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
        return
      }

      const now = Date.now()
      const matchDurationBuffer = 3 * 60 * 60 * 1000

      const liveSelection = selections.find(
        (selection) => selection.hasLive
      )

      const activeSelection = selections.find(
        (selection) =>
          now >= selection.firstKickoff &&
          now <=
            selection.lastKickoff + matchDurationBuffer
      )

      const nextSelection = selections.find(
        (selection) => selection.firstKickoff > now
      )

      const defaultSelection =
        liveSelection ??
        activeSelection ??
        nextSelection ??
        selections[selections.length - 1]

      const currentSelectionExists = selections.some(
        (selection) =>
          selection.stage === selectedStage &&
          selection.round === selectedRound
      )

      if (
        selectionManuallyChanged &&
        currentSelectionExists
      ) {
        return
      }

      setSelectedStage(defaultSelection.stage)
      setSelectedRound(defaultSelection.round)
    }

    loadAvailableSelections()

    const interval = setInterval(
      loadAvailableSelections,
      5 * 60 * 1000
    )

    return () => clearInterval(interval)
  }, [
    matchesRefreshKey,
    selectionManuallyChanged,
    selectedStage,
    selectedRound,
  ])

  // =========================
  // AUTH AKCE
  // =========================

  async function handleRegister(e) {
    e.preventDefault()
    setMessage('Registruji...')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setMessage('Chyba: ' + error.message)
      return
    }

    setMessage('Registrace proběhla. Zkontroluj e-mail.')
  }

  async function handleLogin(e) {
    e.preventDefault()
    setMessage('Přihlašuji...')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage('Chyba: ' + error.message)
      return
    }

    setMessage('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // =========================
  // TIPY
  // =========================

  function handleTipChange(matchId, field, value) {
    setTips((currentTips) => ({
      ...currentTips,
      [matchId]: {
        ...currentTips[matchId],
        [field]: value,
        message: '',
      },
    }))
  }

  async function saveTip(match) {
    const tip = tips[match.id]

    if (!tip) return

    const homeScore = Number(tip.home_score)
    const awayScore = Number(tip.away_score)

    if (
      tip.home_score === '' ||
      tip.away_score === '' ||
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      setTips((currentTips) => ({
        ...currentTips,
        [match.id]: {
          ...currentTips[match.id],
          message: 'Zadej platné skóre.',
        },
      }))

      return
    }

    setTips((currentTips) => ({
      ...currentTips,
      [match.id]: {
        ...currentTips[match.id],
        saving: true,
        message: '',
      },
    }))

    if (tip.predictionId) {
      const { error } = await supabase
        .from('predictions')
        .update({
          home_score: homeScore,
          away_score: awayScore,
        })
        .eq('id', tip.predictionId)
        .eq('user_id', session.user.id)

      if (error) {
        console.error(error)

        setTips((currentTips) => ({
          ...currentTips,
          [match.id]: {
            ...currentTips[match.id],
            saving: false,
            message: 'Tip se nepodařilo uložit.',
          },
        }))

        return
      }

      setTips((currentTips) => ({
        ...currentTips,
        [match.id]: {
          ...currentTips[match.id],
          saving: false,
          message: 'Tip uložen ✓',
        },
      }))

      return
    }

    const { data, error } = await supabase
      .from('predictions')
      .insert({
        match_id: match.id,
        user_id: session.user.id,
        home_score: homeScore,
        away_score: awayScore,
      })
      .select('id')
      .single()

    if (error) {
      console.error(error)

      setTips((currentTips) => ({
        ...currentTips,
        [match.id]: {
          ...currentTips[match.id],
          saving: false,
          message: 'Tip se nepodařilo uložit.',
        },
      }))

      return
    }

    setTips((currentTips) => ({
      ...currentTips,
      [match.id]: {
        ...currentTips[match.id],
        predictionId: data.id,
        saving: false,
        message: 'Tip uložen ✓',
      },
    }))
  }

  function selectStage(stage) {
    const stageSelections = availableSelections
      .filter((selection) => selection.stage === stage)
      .sort((a, b) => a.round - b.round)

    if (stageSelections.length === 0) {
      return
    }

    const now = Date.now()
    const matchDurationBuffer = 3 * 60 * 60 * 1000

    const liveSelection = stageSelections.find(
      (selection) => selection.hasLive
    )

    const activeSelection = stageSelections.find(
      (selection) =>
        now >= selection.firstKickoff &&
        now <=
          selection.lastKickoff + matchDurationBuffer
    )

    const nextSelection = stageSelections.find(
      (selection) => selection.firstKickoff > now
    )

    const targetSelection =
      liveSelection ??
      activeSelection ??
      nextSelection ??
      stageSelections[stageSelections.length - 1]

    setSelectedStage(stage)
    setSelectedRound(targetSelection.round)
    setSelectionManuallyChanged(true)
  }

  function selectRound(round) {
    setSelectedRound(round)
    setSelectionManuallyChanged(true)
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

  const selectedRoundIndex = availableRounds.indexOf(selectedRound)

  const previousRound =
    selectedRoundIndex > 0
      ? availableRounds[selectedRoundIndex - 1]
      : null

  const nextRound =
    selectedRoundIndex >= 0 &&
    selectedRoundIndex < availableRounds.length - 1
      ? availableRounds[selectedRoundIndex + 1]
      : null

  function formatKickoff(kickoffAt) {
    return new Date(kickoffAt).toLocaleString('cs-CZ', {
      timeZone: 'Europe/Prague',
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // =========================
  // LOGIN SCREEN
  // =========================

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-shell">
          <div className="auth-brand">
            <span className="brand-kicker">FOTBALOVÁ TIPOVAČKA</span>
            <h1>Chance Liga</h1>
            <p>
              Tipuj výsledky, sbírej body a porovnej se s ostatními.
            </p>
          </div>

          <div className="auth-grid">
            <form className="auth-card" onSubmit={handleLogin}>
              <div>
                <span className="section-kicker">VÍTEJ ZPĚT</span>
                <h2>Přihlášení</h2>
              </div>

              <label>
                E-mail
                <input
                  type="email"
                  placeholder="tvuj@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label>
                Heslo
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              <button className="primary-button" type="submit">
                Přihlásit
              </button>
            </form>

            <form className="auth-card auth-card-secondary" onSubmit={handleRegister}>
              <div>
                <span className="section-kicker">NOVÝ HRÁČ</span>
                <h2>Registrace</h2>
              </div>

              <label>
                Jméno
                <input
                  type="text"
                  placeholder="Jak se zobrazíš v tabulce"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  placeholder="tvuj@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label>
                Heslo
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              <button className="secondary-button" type="submit">
                Vytvořit účet
              </button>
            </form>
          </div>

          {message && <p className="auth-message">{message}</p>}
        </div>
      </div>
    )
  }

  // =========================
  // SAMOSTATNÁ ADMIN STRÁNKA
  // =========================

  const isAdminPage = window.location.pathname === '/admin'
  const isResultsPage = window.location.pathname === '/results'

  if (isResultsPage) {
    return (
      <ResultsPage
        session={session}
        currentUserName={currentUserName}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />
    )
  }

  if (isAdminPage) {
    return (
      <AdminPage
        session={session}
        isAdmin={isAdmin}
        adminStatusLoaded={adminStatusLoaded}
        currentUserName={currentUserName}
        selectedStage={selectedStage}
        selectedRound={selectedRound}
        availableSelections={availableSelections}
        matches={matches}
        loadingMatches={loadingMatches}
        onLogout={handleLogout}
        onSelectStage={selectStage}
        onSelectRound={selectRound}
        onMatchCreated={(stage, round) => {
          setSelectionManuallyChanged(true)
          setSelectedStage(stage)
          setSelectedRound(round)
          setMatchesRefreshKey((current) => current + 1)
        }}
        onMatchUpdated={(updatedMatch) => {
          setMatches((currentMatches) =>
            currentMatches.map((match) =>
              match.id === updatedMatch.id
                ? updatedMatch
                : match
            )
          )

          setLeaderboardRefreshKey((current) => current + 1)
        }}
        onMatchDeleted={(matchId) => {
          setMatches((currentMatches) =>
            currentMatches.filter(
              (match) => match.id !== matchId
            )
          )

          setMatchesRefreshKey((current) => current + 1)
          setLeaderboardRefreshKey((current) => current + 1)
        }}
      />
    )
  }

  // =========================
  // HLAVNÍ STRÁNKA
  // =========================

  return (
    <div className="app-page">
      <Topbar
        page="home"
        title="Tipovačka"
        session={session}
        currentUserName={currentUserName}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />

      <main className="main-shell">
        <section className="leaderboard-card">
          <div className="section-heading">
            <div>
              <span className="section-kicker">CELKOVÉ POŘADÍ</span>
              <h2>Leaderboard</h2>
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

        <section className="round-section">
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
                  selectedStage === stage.value ? 'active' : ''
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
              onClick={() => previousRound && selectRound(previousRound)}
              disabled={previousRound === null}
              aria-label="Předchozí kolo"
            >
              ‹
            </button>

            <div className="round-title">
              <span className="section-kicker">
                {selectedStage
                  ? stageLabels[selectedStage] ?? 'ZÁPASY'
                  : 'ZÁPASY'}
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
                    selectRound(Number(e.target.value))
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
              onClick={() => nextRound && selectRound(nextRound)}
              disabled={nextRound === null}
              aria-label="Další kolo"
            >
              ›
            </button>
          </div>

          {loadingMatches && (
            <div className="loading-state match-loading">
              Načítám zápasy…
            </div>
          )}

          {!loadingMatches && matches.length === 0 && (
            <div className="empty-state">
              V tomto kole nejsou žádné zápasy.
            </div>
          )}

          <div className="matches-grid">
            {matches.map((match) => {
              const tip = tips[match.id]

              const locked =
                match.status !== 'scheduled' ||
                new Date(match.kickoff_at) <= new Date()

              const hasSavedTip =
                tip &&
                tip.home_score !== '' &&
                tip.away_score !== ''

              return (
                <article
                  key={match.id}
                  className={`match-card status-${match.status}`}
                >
                  <div className="match-card-top">
                    <span className="kickoff">
                      {formatKickoff(match.kickoff_at)}
                    </span>

                    <span className={`status-pill status-pill-${match.status}`}>
                      {statusLabels[match.status] ?? match.status}
                    </span>
                  </div>

                  <div className="teams">
                    <div className="team team-home">
                      {match.home_team.logo_url ? (
                        <img
                          className="team-logo"
                          src={match.home_team.logo_url}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="team-code">
                          {match.home_team.short_name}
                        </span>
                      )}
                      <strong>{match.home_team.name}</strong>
                    </div>

                    <div className="versus">
                      {match.status === 'finished' ? (
                        <span className="final-score">
                          {match.home_score}:{match.away_score}
                        </span>
                      ) : (
                        <span>VS</span>
                      )}
                    </div>

                    <div className="team team-away">
                      {match.away_team.logo_url ? (
                        <img
                          className="team-logo"
                          src={match.away_team.logo_url}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="team-code">
                          {match.away_team.short_name}
                        </span>
                      )}
                      <strong>{match.away_team.name}</strong>
                    </div>
                  </div>

                  {!locked && tip && (
                    <div className="tip-area">
                      <span className="tip-label">Tvůj tip</span>

                      <div className="score-inputs">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Tip ${match.home_team.name}`}
                          value={tip.home_score}
                          onChange={(e) =>
                            handleTipChange(
                              match.id,
                              'home_score',
                              e.target.value
                            )
                          }
                        />

                        <strong>:</strong>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Tip ${match.away_team.name}`}
                          value={tip.away_score}
                          onChange={(e) =>
                            handleTipChange(
                              match.id,
                              'away_score',
                              e.target.value
                            )
                          }
                        />
                      </div>

                      <button
                        className="tip-button"
                        onClick={() => saveTip(match)}
                        disabled={tip.saving}
                      >
                        {tip.saving
                          ? 'Ukládám…'
                          : tip.predictionId
                            ? 'Upravit tip'
                            : 'Uložit tip'}
                      </button>

                      {tip.message && (
                        <p
                          className={
                            tip.message.includes('✓')
                              ? 'tip-message success'
                              : 'tip-message error'
                          }
                        >
                          {tip.message}
                        </p>
                      )}
                    </div>
                  )}

                  {locked && (
                    <div className="locked-area">
                      {hasSavedTip && (
                        <div className="saved-tip">
                          <span>Tvůj tip</span>
                          <strong>
                            {tip.home_score}:{tip.away_score}
                          </strong>
                        </div>
                      )}

                      <span className="locked-label">
                        Tipování uzavřeno
                      </span>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>

      </main>
    </div>
  )
}

export default App
