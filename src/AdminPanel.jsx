import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { stageOptions } from './stages'

const statusOptions = [
  { value: 'scheduled', label: 'Naplánováno' },
  { value: 'live', label: 'Probíhá' },
  { value: 'finished', label: 'Dohráno' },
  { value: 'postponed', label: 'Odloženo' },
  { value: 'cancelled', label: 'Zrušeno' },
]

function emptyPredictionValue() {
  return {
    user_id: '',
    prediction_id: null,
    home_score: '',
    away_score: '',
    points: null,
    existing: false,
    loading: false,
    saving: false,
    message: '',
  }
}

function AdminPanel({
  matches,
  selectedStage,
  selectedRound,
  onMatchUpdated,
  onMatchCreated,
  onMatchDeleted,
}) {
  const [values, setValues] = useState({})
  const [predictionValues, setPredictionValues] = useState({})
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [activeSeasonId, setActiveSeasonId] = useState(null)

  const [newMatch, setNewMatch] = useState({
    stage: selectedStage ?? 'regular',
    round: selectedRound?.toString() ?? '',
    home_team_id: '',
    away_team_id: '',
    date: '',
    time: '',
  })

  const [newMatchMessage, setNewMatchMessage] = useState('')

  useEffect(() => {
    const initialValues = {}

    matches.forEach((match) => {
      const kickoff = new Date(match.kickoff_at)

      const year = kickoff.getFullYear()
      const month = String(kickoff.getMonth() + 1).padStart(2, '0')
      const day = String(kickoff.getDate()).padStart(2, '0')
      const hours = String(kickoff.getHours()).padStart(2, '0')
      const minutes = String(kickoff.getMinutes()).padStart(2, '0')

      initialValues[match.id] = {
        home_score: match.home_score ?? '',
        away_score: match.away_score ?? '',
        status: match.status,
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        saving: false,
        deleting: false,
        message: '',
      }
    })

    setValues(initialValues)
  }, [matches])

  useEffect(() => {
    setPredictionValues((current) => {
      const next = {}

      matches.forEach((match) => {
        next[match.id] =
          current[match.id] ?? emptyPredictionValue()
      })

      return next
    })
  }, [matches])

  useEffect(() => {
    setNewMatch((current) => ({
      ...current,
      stage: selectedStage ?? current.stage ?? 'regular',
      round:
        selectedRound !== null && selectedRound !== undefined
          ? selectedRound.toString()
          : current.round,
    }))
  }, [selectedStage, selectedRound])

  useEffect(() => {
    async function loadAdminData() {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, short_name, logo_url')
        .order('name')

      if (teamsError) {
        console.error(teamsError)
      } else {
        setTeams(teamsData ?? [])
      }

      const { data: playersData, error: playersError } =
        await supabase
          .from('profiles')
          .select('id, display_name')
          .order('display_name')

      if (playersError) {
        console.error(playersError)
      } else {
        setPlayers(
          (playersData ?? []).filter(
            (player) => player.display_name?.trim()
          )
        )
      }

      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()

      if (seasonError) {
        console.error(seasonError)
      } else {
        setActiveSeasonId(seasonData.id)
      }
    }

    loadAdminData()
  }, [])

  function changeValue(matchId, field, value) {
    setValues((current) => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        [field]: value,
        message: '',
      },
    }))
  }

  function changePredictionValue(matchId, field, value) {
    setPredictionValues((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] ?? emptyPredictionValue()),
        [field]: value,
        message: '',
      },
    }))
  }

  async function selectPredictionPlayer(matchId, userId) {
    if (!userId) {
      setPredictionValues((current) => ({
        ...current,
        [matchId]: emptyPredictionValue(),
      }))
      return
    }

    setPredictionValues((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] ?? emptyPredictionValue()),
        user_id: userId,
        prediction_id: null,
        home_score: '',
        away_score: '',
        points: null,
        existing: false,
        loading: true,
        saving: false,
        message: '',
      },
    }))

    const { data, error } = await supabase
      .from('predictions')
      .select('id, home_score, away_score, points')
      .eq('match_id', matchId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error(error)

      setPredictionValues((current) => ({
        ...current,
        [matchId]: {
          ...(current[matchId] ?? emptyPredictionValue()),
          user_id: userId,
          loading: false,
          message: 'Tip hráče se nepodařilo načíst.',
        },
      }))

      return
    }

    setPredictionValues((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] ?? emptyPredictionValue()),
        user_id: userId,
        prediction_id: data?.id ?? null,
        home_score: data?.home_score ?? '',
        away_score: data?.away_score ?? '',
        points: data?.points ?? null,
        existing: Boolean(data),
        loading: false,
        saving: false,
        message: '',
      },
    }))
  }

  async function createMatch(e) {
    e.preventDefault()
    setNewMatchMessage('')

    if (!activeSeasonId) {
      setNewMatchMessage('Aktivní sezóna nebyla nalezena.')
      return
    }

    if (
      !newMatch.stage ||
      !newMatch.round ||
      !newMatch.home_team_id ||
      !newMatch.away_team_id ||
      !newMatch.date ||
      !newMatch.time
    ) {
      setNewMatchMessage('Vyplň všechna pole.')
      return
    }

    if (newMatch.home_team_id === newMatch.away_team_id) {
      setNewMatchMessage('Domácí a hosté musí být různé týmy.')
      return
    }

    const round = Number(newMatch.round)

    if (!Number.isInteger(round) || round < 1) {
      setNewMatchMessage('Zadej platné číslo kola.')
      return
    }

    const kickoff = new Date(`${newMatch.date}T${newMatch.time}:00`)

    if (Number.isNaN(kickoff.getTime())) {
      setNewMatchMessage('Neplatné datum nebo čas.')
      return
    }

    const { error } = await supabase
      .from('matches')
      .insert({
        season_id: activeSeasonId,
        stage: newMatch.stage,
        round,
        home_team_id: Number(newMatch.home_team_id),
        away_team_id: Number(newMatch.away_team_id),
        kickoff_at: kickoff.toISOString(),
        status: 'scheduled',
      })

    if (error) {
      console.error(error)
      setNewMatchMessage('Zápas se nepodařilo vytvořit.')
      return
    }

    onMatchCreated?.(newMatch.stage, round)

    setNewMatch({
      stage: newMatch.stage,
      round: round.toString(),
      home_team_id: '',
      away_team_id: '',
      date: '',
      time: '',
    })

    setNewMatchMessage('Zápas vytvořen ✓')
  }

  async function saveResult(match) {
    const value = values[match.id]

    if (!value) return

    let homeScore = null
    let awayScore = null

    if (
      value.status === 'finished' ||
      value.status === 'live'
    ) {
      homeScore = Number(value.home_score)
      awayScore = Number(value.away_score)

      if (
        value.home_score === '' ||
        value.away_score === '' ||
        !Number.isInteger(homeScore) ||
        !Number.isInteger(awayScore) ||
        homeScore < 0 ||
        awayScore < 0
      ) {
        changeValue(match.id, 'message', 'Zadej platné skóre.')
        return
      }
    }

    if (!value.date || !value.time) {
      changeValue(
        match.id,
        'message',
        'Vyplň datum a čas zápasu.'
      )
      return
    }

    const kickoff = new Date(`${value.date}T${value.time}:00`)

    if (Number.isNaN(kickoff.getTime())) {
      changeValue(
        match.id,
        'message',
        'Neplatné datum nebo čas.'
      )
      return
    }

    setValues((current) => ({
      ...current,
      [match.id]: {
        ...current[match.id],
        saving: true,
        message: '',
      },
    }))

    const { error } = await supabase
      .from('matches')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: value.status,
        kickoff_at: kickoff.toISOString(),
      })
      .eq('id', match.id)

    if (error) {
      console.error(error)

      setValues((current) => ({
        ...current,
        [match.id]: {
          ...current[match.id],
          saving: false,
          message: 'Chyba při ukládání.',
        },
      }))

      return
    }

    setValues((current) => ({
      ...current,
      [match.id]: {
        ...current[match.id],
        saving: false,
        message: 'Uloženo ✓',
      },
    }))

    onMatchUpdated?.({
      ...match,
      home_score: homeScore,
      away_score: awayScore,
      status: value.status,
      kickoff_at: kickoff.toISOString(),
    })
  }

  async function savePrediction(match) {
    const prediction =
      predictionValues[match.id] ?? emptyPredictionValue()

    if (!prediction.user_id) {
      changePredictionValue(
        match.id,
        'message',
        'Nejdřív vyber hráče.'
      )
      return
    }

    const homeScore = Number(prediction.home_score)
    const awayScore = Number(prediction.away_score)

    if (
      prediction.home_score === '' ||
      prediction.away_score === '' ||
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      changePredictionValue(
        match.id,
        'message',
        'Zadej platný tip.'
      )
      return
    }

    setPredictionValues((current) => ({
      ...current,
      [match.id]: {
        ...(current[match.id] ?? emptyPredictionValue()),
        saving: true,
        message: '',
      },
    }))

    let data
    let error

    if (prediction.prediction_id) {
      const response = await supabase
        .from('predictions')
        .update({
          home_score: homeScore,
          away_score: awayScore,
        })
        .eq('id', prediction.prediction_id)
        .select('id, home_score, away_score, points')
        .single()

      data = response.data
      error = response.error
    } else {
      const response = await supabase
        .from('predictions')
        .insert({
          match_id: match.id,
          user_id: prediction.user_id,
          home_score: homeScore,
          away_score: awayScore,
        })
        .select('id, home_score, away_score, points')
        .single()

      data = response.data
      error = response.error
    }

    if (error) {
      console.error(error)

      setPredictionValues((current) => ({
        ...current,
        [match.id]: {
          ...(current[match.id] ?? emptyPredictionValue()),
          saving: false,
          message: 'Tip se nepodařilo uložit.',
        },
      }))

      return
    }

    setPredictionValues((current) => ({
      ...current,
      [match.id]: {
        ...(current[match.id] ?? emptyPredictionValue()),
        prediction_id: data.id,
        home_score: data.home_score,
        away_score: data.away_score,
        points: data.points,
        existing: true,
        loading: false,
        saving: false,
        message: 'Tip uložen ✓',
      },
    }))
  }

  async function deleteMatch(match) {
    const confirmed = window.confirm(
      `Opravdu chceš smazat zápas ${match.home_team.name} – ${match.away_team.name}?`
    )

    if (!confirmed) return

    setValues((current) => ({
      ...current,
      [match.id]: {
        ...current[match.id],
        deleting: true,
        message: '',
      },
    }))

    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', match.id)

    if (error) {
      console.error(error)

      setValues((current) => ({
        ...current,
        [match.id]: {
          ...current[match.id],
          deleting: false,
          message: 'Zápas se nepodařilo smazat.',
        },
      }))

      return
    }

    onMatchDeleted?.(match.id, match.round)
  }

  return (
    <div className="admin-panel">
      <section className="admin-panel-section">
        <div className="admin-panel-heading">
          <div>
            <span className="section-kicker">NOVÝ ZÁPAS</span>
            <h2>Přidat nový zápas</h2>
          </div>
        </div>

        <form
          className="match-card admin-create-match-card"
          onSubmit={createMatch}
        >
          <div className="match-card-top admin-create-top">
            <div className="admin-create-stage-round">
              <label className="admin-inline-field admin-stage-field">
                <span>Část soutěže</span>
                <select
                  value={newMatch.stage}
                  onChange={(e) =>
                    setNewMatch({
                      ...newMatch,
                      stage: e.target.value,
                    })
                  }
                  required
                >
                  {stageOptions.map((stage) => (
                    <option
                      key={stage.value}
                      value={stage.value}
                    >
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-inline-field admin-round-field">
                <span>Kolo</span>
                <input
                  type="number"
                  min="1"
                  value={newMatch.round}
                  onChange={(e) =>
                    setNewMatch({
                      ...newMatch,
                      round: e.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>

            <span className="status-pill status-pill-scheduled">
              Naplánováno
            </span>
          </div>

          <div className="admin-new-teams">
            <label className="admin-team-select">
              <span>Domácí</span>
              <select
                value={newMatch.home_team_id}
                onChange={(e) =>
                  setNewMatch({
                    ...newMatch,
                    home_team_id: e.target.value,
                  })
                }
                required
              >
                <option value="">Vyber tým</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <span className="admin-vs">VS</span>

            <label className="admin-team-select">
              <span>Hosté</span>
              <select
                value={newMatch.away_team_id}
                onChange={(e) =>
                  setNewMatch({
                    ...newMatch,
                    away_team_id: e.target.value,
                  })
                }
                required
              >
                <option value="">Vyber tým</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-match-footer">
            <div className="admin-datetime-fields">
              <label className="admin-compact-field">
                <span>Datum</span>
                <input
                  type="date"
                  value={newMatch.date}
                  onChange={(e) =>
                    setNewMatch({
                      ...newMatch,
                      date: e.target.value,
                    })
                  }
                  required
                />
              </label>

              <label className="admin-compact-field">
                <span>Čas</span>
                <input
                  type="time"
                  value={newMatch.time}
                  onChange={(e) =>
                    setNewMatch({
                      ...newMatch,
                      time: e.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>

            <button className="admin-save-button" type="submit">
              Přidat zápas
            </button>
          </div>

          {newMatchMessage && (
            <p
              className={
                newMatchMessage.includes('✓')
                  ? 'admin-card-message success'
                  : 'admin-card-message error'
              }
            >
              {newMatchMessage}
            </p>
          )}
        </form>
      </section>

      <section className="admin-panel-section">
        <div className="admin-panel-heading">
          <div>
            <span className="section-kicker">ZÁPASY KOLA</span>
            <h2>Upravit zápasy a tipy</h2>
          </div>

          <span className="section-meta">
            {matches.length} zápasů
          </span>
        </div>

        <div className="admin-matches-grid">
          {matches.map((match) => {
            const value = values[match.id]
            const prediction =
              predictionValues[match.id] ??
              emptyPredictionValue()

            if (!value) return null

            const kickoffPassed =
              new Date(match.kickoff_at).getTime() <= Date.now()

            return (
              <article
                key={match.id}
                className={`match-card admin-match-card status-${value.status}`}
              >
                <div className="match-card-top admin-edit-top">
                  <div className="admin-datetime-fields admin-datetime-fields-top">
                    <input
                      aria-label="Datum zápasu"
                      type="date"
                      value={value.date}
                      onChange={(e) =>
                        changeValue(
                          match.id,
                          'date',
                          e.target.value
                        )
                      }
                    />

                    <input
                      aria-label="Čas zápasu"
                      type="time"
                      value={value.time}
                      onChange={(e) =>
                        changeValue(
                          match.id,
                          'time',
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <select
                    className={`admin-status-select status-select-${value.status}`}
                    value={value.status}
                    onChange={(e) =>
                      changeValue(
                        match.id,
                        'status',
                        e.target.value
                      )
                    }
                    aria-label="Stav zápasu"
                  >
                    {statusOptions.map((status) => (
                      <option
                        key={status.value}
                        value={status.value}
                      >
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="teams admin-teams">
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
                    <span>VS</span>
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

                <div className="admin-match-footer">
                  <div className="admin-score-editor">
                    <span className="admin-control-label">
                      Výsledek
                    </span>

                    <div className="score-inputs">
                      <input
                        type="number"
                        min="0"
                        value={value.home_score}
                        onChange={(e) =>
                          changeValue(
                            match.id,
                            'home_score',
                            e.target.value
                          )
                        }
                        aria-label={`Výsledek ${match.home_team.name}`}
                      />

                      <strong>:</strong>

                      <input
                        type="number"
                        min="0"
                        value={value.away_score}
                        onChange={(e) =>
                          changeValue(
                            match.id,
                            'away_score',
                            e.target.value
                          )
                        }
                        aria-label={`Výsledek ${match.away_team.name}`}
                      />
                    </div>
                  </div>

                  <div className="admin-card-actions">
                    <button
                      className="admin-save-button"
                      type="button"
                      onClick={() => saveResult(match)}
                      disabled={value.saving || value.deleting}
                    >
                      {value.saving
                        ? 'Ukládám…'
                        : 'Uložit změny'}
                    </button>

                    <button
                      className="admin-delete-button"
                      type="button"
                      onClick={() => deleteMatch(match)}
                      disabled={value.saving || value.deleting}
                    >
                      {value.deleting
                        ? 'Mažu…'
                        : 'Smazat'}
                    </button>
                  </div>
                </div>

                {value.message && (
                  <p
                    className={
                      value.message.includes('✓')
                        ? 'admin-card-message success'
                        : 'admin-card-message error'
                    }
                  >
                    {value.message}
                  </p>
                )}

                <div className="admin-prediction-editor">
                  <div className="admin-prediction-heading">
                    <div>
                      <span className="admin-control-label">
                        Tip za hráče
                      </span>
                      <strong>Administrátorský tip</strong>
                    </div>

                    <div className="admin-prediction-badges">
                      {kickoffPassed && (
                        <span className="admin-after-kickoff-warning">
                          Po výkopu – admin override
                        </span>
                      )}

                      {prediction.existing && (
                        <span className="admin-existing-tip-badge">
                          Existující tip
                          {prediction.points !== null
                            ? ` · ${prediction.points} b`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="admin-prediction-controls">
                    <label className="admin-player-field">
                      <span>Hráč</span>
                      <select
                        value={prediction.user_id}
                        onChange={(e) =>
                          selectPredictionPlayer(
                            match.id,
                            e.target.value
                          )
                        }
                        disabled={
                          prediction.loading ||
                          prediction.saving
                        }
                      >
                        <option value="">Vyber hráče</option>
                        {players.map((player) => (
                          <option
                            key={player.id}
                            value={player.id}
                          >
                            {player.display_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="admin-prediction-score">
                      <span>Tip</span>

                      <div className="admin-prediction-score-inputs">
                        <input
                          type="number"
                          min="0"
                          value={prediction.home_score}
                          onChange={(e) =>
                            changePredictionValue(
                              match.id,
                              'home_score',
                              e.target.value
                            )
                          }
                          disabled={
                            !prediction.user_id ||
                            prediction.loading ||
                            prediction.saving
                          }
                          aria-label={`Tip hráče - ${match.home_team.name}`}
                        />

                        <strong>:</strong>

                        <input
                          type="number"
                          min="0"
                          value={prediction.away_score}
                          onChange={(e) =>
                            changePredictionValue(
                              match.id,
                              'away_score',
                              e.target.value
                            )
                          }
                          disabled={
                            !prediction.user_id ||
                            prediction.loading ||
                            prediction.saving
                          }
                          aria-label={`Tip hráče - ${match.away_team.name}`}
                        />
                      </div>
                    </div>

                    <button
                      className="admin-tip-save-button"
                      type="button"
                      onClick={() => savePrediction(match)}
                      disabled={
                        !prediction.user_id ||
                        prediction.loading ||
                        prediction.saving
                      }
                    >
                      {prediction.loading
                        ? 'Načítám…'
                        : prediction.saving
                          ? 'Ukládám…'
                          : prediction.existing
                            ? 'Upravit tip'
                            : 'Uložit tip'}
                    </button>
                  </div>

                  {prediction.message && (
                    <p
                      className={
                        prediction.message.includes('✓')
                          ? 'admin-prediction-message success'
                          : 'admin-prediction-message error'
                      }
                    >
                      {prediction.message}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default AdminPanel