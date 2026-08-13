import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [message, setMessage] = useState('Připojuji se...')

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase
        .from('connection_test')
        .select('message')
        .limit(1)

      if (error) {
        console.error(error)
        setMessage('Chyba připojení: ' + error.message)
        return
      }

      setMessage(data?.[0]?.message ?? 'Připojeno, ale bez dat')
    }

    testConnection()
  }, [])

  return (
    <div>
      <h1>Tipovačka</h1>
      <p>{message}</p>
    </div>
  )
}

export default App