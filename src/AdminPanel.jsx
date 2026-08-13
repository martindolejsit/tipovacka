import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const statusOptions = [
  { value: 'scheduled', label: 'Naplánováno' },
  { value: 'live', label: 'Probíhá' },
  { value: 'finished', label: 'Dohráno' },
  { value: 'postponed', label: 'Odloženo' },
  { value: 'cancelled', label: 'Zrušeno' },
]

function AdminPanel({ matches, onMatchUpdated }) {
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
      initialValues[match.id] = {
        home_score: match.home_score ?? '',
        away_score: match.away_score ?? '',
        status: match.status,
        saving: false,
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
        setTeams(teamsData)
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

    if (newMatch.home_team_id === newMatch.away_team_id) {
      setNewMatchMessage('Domácí a hosté musí být různé týmy.')
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
        round: Number(newMatch.round),
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

    if (value.status === 'finished' || value.status === 'live') {
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
    })
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
              disabled={value.saving}
            >
              {value.saving
                ? 'Ukládám...'
                : 'Uložit výsledek'}
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