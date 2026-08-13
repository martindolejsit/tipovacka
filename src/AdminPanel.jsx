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