import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  console.error(
    'Chybí SUPABASE_URL nebo SUPABASE_SECRET_KEY.'
  )
  process.exit(1)
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
)

const players = [
  {
    display_name: 'Honza_Bojler',
    email: 'hdolejs7@gmail.com',
  },
  {
    display_name: 'Martin',
    email: 'Martinkubec9@gmail.com',
  },
  {
    display_name: 'Robert Taliban',
    email: 'ondrahodosi@seznam.cz',
  },
  {
    display_name: 'Tapir14',
    email: 'dankubec123@gmail.com',
  },
  {
    display_name: 'Jarda',
    email: 'jaroslav.dolejs1966@gmail.com',
  },
]

function createTemporaryPassword() {
  return `Tip-${randomBytes(9).toString('base64url')}!`
}

async function findUserByEmail(email) {
  let page = 1

  while (true) {
    const {
      data: { users },
      error,
    } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) throw error

    const found = users.find(
      (user) =>
        user.email?.toLowerCase() === email.toLowerCase()
    )

    if (found) return found
    if (users.length < 1000) return null

    page += 1
  }
}

async function findProfileByDisplayName(displayName) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('display_name', displayName)
    .limit(2)

  if (error) throw error

  if (data.length > 1) {
    throw new Error(
      `Více profilů má jméno "${displayName}".`
    )
  }

  return data[0] ?? null
}

console.log('')
console.log('=== VYTVÁŘENÍ HRÁČŮ ===')
console.log('')

const createdCredentials = []

for (const player of players) {
  const profile =
    await findProfileByDisplayName(player.display_name)

  if (profile) {
    console.log(
      `PŘESKOČENO – profil už existuje: ${player.display_name} (${profile.id})`
    )
    continue
  }

  const existingUser = await findUserByEmail(player.email)

  if (existingUser) {
    console.log(
      `PŘESKOČENO – e-mail už existuje v Auth: ${player.email} (${existingUser.id})`
    )
    continue
  }

  const password = createTemporaryPassword()

  const { data, error } =
    await supabase.auth.admin.createUser({
      email: player.email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: player.display_name,
      },
    })

  if (error) throw error

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: data.user.id,
        display_name: player.display_name,
      },
      {
        onConflict: 'id',
      }
    )

  if (profileError) throw profileError

  createdCredentials.push({
    display_name: player.display_name,
    email: player.email,
    password,
    id: data.user.id,
  })

  console.log(
    `VYTVOŘEN: ${player.display_name} -> ${data.user.id}`
  )
}

console.log('')
console.log('=== DOČASNÉ PŘIHLAŠOVACÍ ÚDAJE ===')
console.log('')

if (createdCredentials.length === 0) {
  console.log('Nebyl vytvořen žádný nový účet.')
} else {
  for (const item of createdCredentials) {
    console.log(`${item.display_name}`)
    console.log(`  E-mail: ${item.email}`)
    console.log(`  Heslo:  ${item.password}`)
    console.log('')
  }
}

console.log(
  'Dočasná hesla si teď bezpečně ulož. Skript je nikam nezapisuje.'
)