import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const statusOptions = [
  { value: 'scheduled', label: 'Naplánováno' },
  { value: 'live', label: 'Probíhá' },
  { value: 'finished', label: 'Dohráno' },
  { value: 'postponed', label: 'Odloženo' },
  { value: 'cancelled', label: 'Zrušeno' },
]

function AdminPanel({
  matches,
  onMatchUpdated,
  onMatchCreated,
  onMatchDeleted,
}) {
  const [values, setValues] = useState({})
  const [teams, setTeams] = useState([])
  const [activeSeasonId, setActiveSeasonId] = useState(null)

  const [newMatch, setNewMatch] = useState({
    round: '',
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
    async function loadAdminData() {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .order('name')

      if (teamsError) {
        console.error(teamsError)
      } else {
        setTeams(teamsData ?? [])
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

  async function createMatch(e) {
    e.preventDefault()
    setNewMatchMessage('')

    if (!activeSeasonId) {
      setNewMatchMessage('Aktivní sezóna nebyla nalezena.')
      return
    }

    if (
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

    const kickoff = new Date(
      `${newMatch.date}T${newMatch.time}:00`
    )

    if (Number.isNaN(kickoff.getTime())) {
      setNewMatchMessage('Neplatné datum nebo čas.')
      return
    }

    const { error } = await supabase
      .from('matches')
      .insert({
        season_id: activeSeasonId,
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

    onMatchCreated?.(round)

    setNewMatch({
      round: '',
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
        changeValue(
          match.id,
          'message',
          'Zadej platné skóre.'
        )
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
    <div>
      <hr />

      <h2>Administrace</h2>

      <h3>Přidat nový zápas</h3>

      <form onSubmit={createMatch}>
        <div>
          <label>
            Kolo:
            <br />
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

        <br />

        <div>
          <label>
            Domácí:
            <br />
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
        </div>

        <br />

        <div>
          <label>
            Hosté:
            <br />
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

        <br />

        <div>
          <label>
            Datum:
            <br />
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
        </div>

        <br />

        <div>
          <label>
            Čas:
            <br />
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

        <br />

        <button type="submit">
          Přidat zápas
        </button>

        {newMatchMessage && (
          <p>{newMatchMessage}</p>
        )}
      </form>

      <hr />

      {matches.map((match) => {
        const value = values[match.id]

        if (!value) return null

        return (
          <div key={match.id}>
            <h3>
              {match.home_team.name}
              {' – '}
              {match.away_team.name}
            </h3>

            <div>
              <label>
                Datum:
                <br />
                <input
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
              </label>
            </div>

            <br />

            <div>
              <label>
                Čas:
                <br />
                <input
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
              </label>
            </div>

            <br />

            <div>
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
                style={{ width: '60px' }}
              />

              <strong> : </strong>

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
                style={{ width: '60px' }}
              />
            </div>

            <br />

            <select
              value={value.status}
              onChange={(e) =>
                changeValue(
                  match.id,
                  'status',
                  e.target.value
                )
              }
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

            <br />
            <br />

            <button
              onClick={() => saveResult(match)}
              disabled={value.saving || value.deleting}
            >
              {value.saving
                ? 'Ukládám...'
                : 'Uložit změny'}
            </button>

            {' '}

            <button
              type="button"
              onClick={() => deleteMatch(match)}
              disabled={value.saving || value.deleting}
            >
              {value.deleting
                ? 'Mažu...'
                : 'Smazat zápas'}
            </button>

            {value.message && (
              <p>{value.message}</p>
            )}

            <hr />
          </div>
        )
      })}
    </div>
  )
}

export default AdminPanel