import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import AdminPanel from './AdminPanel'

const statusLabels = {
  scheduled: 'Naplánováno',
  live: 'Probíhá',
  finished: 'Dohráno',
  postponed: 'Odloženo',
  cancelled: 'Zrušeno',
}

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
  const [selectedRound, setSelectedRound] = useState(4)
  const [availableRounds, setAvailableRounds] = useState([])
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0)

  // =========================
  // AUTH
  // =========================

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // =========================
  // ZÁPASY + EXISTUJÍCÍ TIPY
  // =========================

  useEffect(() => {
    async function loadData() {
      if (!session) {
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
          round,
          kickoff_at,
          home_score,
          away_score,
          status,
          home_team:teams!matches_home_team_id_fkey (
            id,
            name,
            short_name
          ),
          away_team:teams!matches_away_team_id_fkey (
            id,
            name,
            short_name
          )
        `)
        .eq('season_id', season.id)
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
}, [session, selectedRound, matchesRefreshKey])

  // =========================
  // REGISTRACE
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
}, [session])

useEffect(() => {
  async function loadAdminStatus() {
    if (!session) {
      setIsAdmin(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()

    if (error) {
      console.error(error)
      setIsAdmin(false)
      return
    }

    setIsAdmin(data.is_admin === true)
  }

  loadAdminStatus()
}, [session])


useEffect(() => {
  async function loadAvailableRounds() {
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
      .select('round')
      .eq('season_id', season.id)
      .order('round')

    if (error) {
      console.error(error)
      return
    }

    const rounds = [...new Set(data.map((match) => match.round))]

    setAvailableRounds(rounds)

    if (
      rounds.length > 0 &&
      !rounds.includes(selectedRound)
    ) {
      setSelectedRound(rounds[0])
    }
  }

  loadAvailableRounds()
}, [])

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

  // =========================
  // LOGIN
  // =========================

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
  // ZMĚNA TIPU
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

  // =========================
  // ULOŽENÍ TIPU
  // =========================

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

    // Existující tip = UPDATE
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

    // Nový tip = INSERT
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

  // =========================
  // LOGIN SCREEN
  // =========================

  if (!session) {
    return (
      <div>
        <h1>Chance Liga Tipovačka</h1>

        <h2>Registrace</h2>

        <form onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Jméno"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />

          <br />

          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <br />

          <input
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <br />

          <button type="submit">
            Registrovat
          </button>
        </form>

        <h2>Přihlášení</h2>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <br />

          <input
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <br />

          <button type="submit">
            Přihlásit
          </button>
        </form>

        <p>{message}</p>
      </div>
    )
  }

  // =========================
  // TIPOVAČKA
  // =========================

  return (
    <div>
      <h1>Chance Liga Tipovačka</h1>

      <p>
        Přihlášen: <strong>{session.user.email}</strong>
      </p>

      <button onClick={handleLogout}>
        Odhlásit
      </button>

      <hr />
	  <h2>Pořadí</h2>

{!loadingLeaderboard && leaderboard.length > 0 && (
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Hráč</th>
        <th>Body</th>
        <th>Přesně</th>
        <th>Správně</th>
        <th>Tipů</th>
      </tr>
    </thead>

    <tbody>
      {leaderboard.map((player, index) => (
        <tr key={player.user_id}>
          <td>{index + 1}.</td>

          <td>
            <strong>{player.display_name}</strong>
          </td>

          <td>
            <strong>{player.total_points}</strong>
          </td>

          <td>{player.exact_tips}</td>

          <td>{player.correct_tips}</td>

          <td>{player.tip_count}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}



<h2>{selectedRound}. kolo</h2>

<select
  value={selectedRound}
  onChange={(e) => setSelectedRound(Number(e.target.value))}
>
  {availableRounds.map((round) => (
    <option key={round} value={round}>
      {round}. kolo
    </option>
  ))}
</select>

      {loadingMatches && (
        <p>Načítám zápasy...</p>
      )}

      {!loadingMatches && matches.length === 0 && (
        <p>Žádné zápasy.</p>
      )}

      {matches.map((match) => {
        const tip = tips[match.id]

        const locked =
          match.status !== 'scheduled' ||
          new Date(match.kickoff_at) <= new Date()

        return (
          <div key={match.id}>
            <h3>
              {match.home_team.name}
              {' – '}
              {match.away_team.name}
            </h3>

            <p>
              {new Date(match.kickoff_at).toLocaleString(
                'cs-CZ',
                {
                  timeZone: 'Europe/Prague',
                  weekday: 'short',
                  day: 'numeric',
                  month: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }
              )}
            </p>

            <p>
              {statusLabels[match.status] ?? match.status}
            </p>

            {match.status === 'finished' && (
              <p>
                Výsledek:{' '}
                <strong>
                  {match.home_score}:{match.away_score}
                </strong>
              </p>
            )}

            {!locked && tip && (
              <>
                <div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tip.home_score}
                    onChange={(e) =>
                      handleTipChange(
                        match.id,
                        'home_score',
                        e.target.value
                      )
                    }
                    style={{ width: '60px' }}
                  />

                  <strong> : </strong>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tip.away_score}
                    onChange={(e) =>
                      handleTipChange(
                        match.id,
                        'away_score',
                        e.target.value
                      )
                    }
                    style={{ width: '60px' }}
                  />
                </div>

                <br />

                <button
                  onClick={() => saveTip(match)}
                  disabled={tip.saving}
                >
                  {tip.saving
                    ? 'Ukládám...'
                    : tip.predictionId
                      ? 'Upravit tip'
                      : 'Uložit tip'}
                </button>

                {tip.message && (
                  <p>{tip.message}</p>
                )}
              </>
            )}

            {locked && (
              <p>
                <strong>Tipování uzavřeno</strong>
              </p>
            )}

            <hr />
          </div>
        )
      })}
{isAdmin && (
  <AdminPanel
  matches={matches}
  onMatchCreated={(round) => {
    setAvailableRounds((currentRounds) => {
      const rounds = [...new Set([...currentRounds, round])]
      return rounds.sort((a, b) => a - b)
    })

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
  }}
/>
)}
    </div>
  )
}

export default App