import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Topbar from './Topbar'

function EmailReminderSettings({ email }) {
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const requestVersion = useRef(0)
  const savingRef = useRef(false)

  useEffect(() => {
    let disposed = false

    async function loadPreference() {
      if (savingRef.current || document.visibilityState === 'hidden') return
      const version = ++requestVersion.current
      try {
        const { data, error } = await supabase.rpc('get_my_tip_email_setting')
        if (disposed || version !== requestVersion.current) return
        if (error || typeof data !== 'boolean') throw new Error('Load failed')
        setEnabled(data)
        setLoaded(true)
        setFailed(false)
        setMessage('')
      } catch {
        if (disposed || version !== requestVersion.current) return
        setLoaded(false)
        setFailed(true)
        setMessage('Nastavení upozornění se nepodařilo načíst. Zkus to znovu.')
      }
    }

    loadPreference()
    window.addEventListener('focus', loadPreference)
    document.addEventListener('visibilitychange', loadPreference)
    return () => {
      disposed = true
      requestVersion.current++
      window.removeEventListener('focus', loadPreference)
      document.removeEventListener('visibilitychange', loadPreference)
    }
  }, [reload])

  async function togglePreference() {
    if (!loaded || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setMessage('')
    const version = ++requestVersion.current
    try {
      const { data, error } = await supabase.rpc('set_my_tip_email_setting', {
        p_enabled: !enabled,
      })
      if (version !== requestVersion.current) return
      if (error || typeof data !== 'boolean') throw new Error('Save failed')
      setEnabled(data)
      setFailed(false)
      setMessage(data ? 'E-mailové připomínky jsou zapnuté ✓' : 'E-mailové připomínky jsou vypnuté ✓')
    } catch {
      if (version !== requestVersion.current) return
      // Po přerušení sítě mohl zápis proběhnout. Další změnu dovolíme až po načtení.
      setLoaded(false)
      setFailed(true)
      setMessage('Výsledek uložení se nepodařilo ověřit. Načti nastavení znovu.')
    } finally {
      if (version === requestVersion.current) {
        savingRef.current = false
        setSaving(false)
      }
    }
  }

  return (
    <section className="profile-settings-card" style={{ gridColumn: '1 / -1' }}>
      <div className="profile-card-heading">
        <span className="section-kicker">UPOZORNĚNÍ</span>
        <h2>E-mailové připomínky</h2>
        <p>
          Pokud ti chybí tipy na dnešní zápasy, připomeneme je přibližně
          dvě hodiny před prvním z nich. Nejvýše jeden e-mail za den.
        </p>
      </div>
      <div className="profile-form">
        <p className="profile-form-note" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          Posíláme na potvrzenou přihlašovací adresu: <strong>{email || 'Není dostupná'}</strong>
        </p>
        <button
          className="profile-save-button"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="E-mailové připomínky chybějících tipů"
          disabled={!loaded || saving}
          onClick={togglePreference}
        >
          {saving ? 'Ukládám…' : !loaded ? (failed ? 'Nastavení není načtené' : 'Načítám…') : enabled ? 'Zapnuto — vypnout připomínky' : 'Vypnuto — zapnout připomínky'}
        </button>
        {message && (
          <p role="status" className={`profile-form-message ${failed ? 'error' : 'success'}`}>
            {message}
          </p>
        )}
        {!loaded && failed && (
          <button className="profile-save-button" type="button" onClick={() => setReload((value) => value + 1)}>
            Načíst znovu
          </button>
        )}
        <p className="profile-form-note">
          Pokud máš vše natipováno, nic neposíláme. Odběr můžeš kdykoli
          vypnout zde nebo odkazem v e-mailu. Časy se řídí pásmem Europe/Prague.
        </p>
      </div>
    </section>
  )
}

function ProfilePage({
  session,
  currentUserName,
  isAdmin,
  onLogout,
  onProfileUpdated,
}) {
  const [displayName, setDisplayName] = useState(
    currentUserName ?? ''
  )
  const [email, setEmail] = useState(
    session?.user?.email ?? ''
  )

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordAgain, setNewPasswordAgain] = useState('')

  const [nameSaving, setNameSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [nameMessage, setNameMessage] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  useEffect(() => {
    setDisplayName(currentUserName ?? '')
  }, [currentUserName])

  useEffect(() => {
    setEmail(session?.user?.email ?? '')
  }, [session])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Profil | Chance Liga Tipovačka'

    return () => {
      document.title = previousTitle
    }
  }, [])

  const initials = useMemo(() => {
    const source =
      displayName.trim() ||
      currentUserName?.trim() ||
      session?.user?.email?.trim() ||
      'U'

    const parts = source
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)

    return parts
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
  }, [displayName, currentUserName, session])

  async function saveDisplayName(event) {
    event.preventDefault()

    const nextDisplayName = displayName.trim()

    setNameMessage('')

    if (nextDisplayName.length < 2) {
      setNameMessage('Jméno musí mít alespoň 2 znaky.')
      return
    }

    if (nextDisplayName.length > 40) {
      setNameMessage('Jméno může mít maximálně 40 znaků.')
      return
    }

    setNameSaving(true)

    const { data: duplicates, error: duplicateError } =
      await supabase
        .from('profiles')
        .select('id')
        .eq('display_name', nextDisplayName)
        .neq('id', session.user.id)
        .limit(1)

    if (duplicateError) {
      console.error(duplicateError)
      setNameSaving(false)
      setNameMessage('Nepodařilo se ověřit dostupnost jména.')
      return
    }

    if ((duplicates ?? []).length > 0) {
      setNameSaving(false)
      setNameMessage('Toto zobrazované jméno už používá jiný hráč.')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: nextDisplayName,
      })
      .eq('id', session.user.id)

    if (error) {
      console.error(error)
      setNameSaving(false)
      setNameMessage('Zobrazované jméno se nepodařilo uložit.')
      return
    }

    // Profily jsou hlavní zdroj display_name.
    // Metadata v Auth držíme synchronizovaná jako doplňkovou informaci.
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        display_name: nextDisplayName,
      },
    })

    if (metadataError) {
      console.error(metadataError)
    }

    onProfileUpdated?.(nextDisplayName)

    setDisplayName(nextDisplayName)
    setNameSaving(false)
    setNameMessage('Zobrazované jméno bylo změněno ✓')
  }

  async function saveEmail(event) {
    event.preventDefault()

    const nextEmail = email.trim().toLowerCase()
    const currentEmail =
      session?.user?.email?.trim().toLowerCase() ?? ''

    setEmailMessage('')

    if (!nextEmail) {
      setEmailMessage('Zadej nový e-mail.')
      return
    }

    if (nextEmail === currentEmail) {
      setEmailMessage('Tohle je už tvůj současný e-mail.')
      return
    }

    setEmailSaving(true)

    const { error } = await supabase.auth.updateUser({
      email: nextEmail,
    })

    if (error) {
      console.error(error)
      setEmailSaving(false)
      setEmailMessage(
        error.message || 'E-mail se nepodařilo změnit.'
      )
      return
    }

    setEmailSaving(false)
    setEmailMessage(
      'Žádost o změnu e-mailu byla odeslána. Dokonči potvrzení z e-mailu ✓'
    )
  }

  async function savePassword(event) {
    event.preventDefault()

    setPasswordMessage('')

    if (!currentPassword) {
      setPasswordMessage('Zadej současné heslo.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordMessage(
        'Nové heslo musí mít alespoň 8 znaků.'
      )
      return
    }

    if (newPassword !== newPasswordAgain) {
      setPasswordMessage('Nová hesla se neshodují.')
      return
    }

    if (newPassword === currentPassword) {
      setPasswordMessage(
        'Nové heslo musí být jiné než současné.'
      )
      return
    }

    const currentEmail = session?.user?.email

    if (!currentEmail) {
      setPasswordMessage(
        'K účtu není dostupný přihlašovací e-mail.'
      )
      return
    }

    setPasswordSaving(true)

    // Nejdřív ověříme současné heslo přihlášením stejného účtu.
    const { error: verifyError } =
      await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      })

    if (verifyError) {
      console.error(verifyError)
      setPasswordSaving(false)
      setPasswordMessage('Současné heslo není správné.')
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      console.error(error)
      setPasswordSaving(false)
      setPasswordMessage(
        error.message || 'Heslo se nepodařilo změnit.'
      )
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setNewPasswordAgain('')
    setPasswordSaving(false)
    setPasswordMessage('Heslo bylo úspěšně změněno ✓')
  }

  return (
    <div className="app-page profile-page">
      <Topbar
        page="profile"
        title="Profil"
        session={session}
        currentUserName={currentUserName}
        isAdmin={isAdmin}
        onLogout={onLogout}
      />

      <main className="main-shell profile-main-shell">
        <section className="profile-hero-card">
          <div className="profile-avatar-block">
            <div
              className="profile-avatar"
              aria-label="Profilový obrázek"
            >
              {initials}
            </div>

            <div className="profile-avatar-actions">
              <strong>
                {currentUserName || session?.user?.email}
              </strong>
              <span>{session?.user?.email}</span>

              {isAdmin && (
                <span className="profile-admin-label">
                  Administrátor
                </span>
              )}
            </div>
          </div>

          <div className="profile-photo-future">
            <button type="button" disabled>
              Nahrát fotografii
            </button>
            <span>
              Již brzy....
            </span>
          </div>
        </section>

        <div className="profile-settings-grid">
          <section className="profile-settings-card">
            <div className="profile-card-heading">
              <span className="section-kicker">VEŘEJNÝ PROFIL</span>
              <h1>Zobrazované jméno</h1>
              <p>
                Toto jméno vidí ostatní hráči v pořadí a u
                historických tipů.
              </p>
            </div>

            <form
              className="profile-form"
              onSubmit={saveDisplayName}
            >
              <label>
                <span>Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) =>
                    setDisplayName(event.target.value)
                  }
                  maxLength="40"
                  autoComplete="nickname"
                />
              </label>

              <button
                className="profile-save-button"
                type="submit"
                disabled={nameSaving}
              >
                {nameSaving ? 'Ukládám…' : 'Uložit jméno'}
              </button>

              {nameMessage && (
                <p
                  className={`profile-form-message ${
                    nameMessage.includes('✓')
                      ? 'success'
                      : 'error'
                  }`}
                >
                  {nameMessage}
                </p>
              )}
            </form>
          </section>

          <section className="profile-settings-card">
            <div className="profile-card-heading">
              <span className="section-kicker">PŘIHLÁŠENÍ</span>
              <h2>Změnit e-mail</h2>
              <p>
                Nová adresa se použije pro další přihlášení do
                Tipovačky.
              </p>
            </div>

            <form
              className="profile-form"
              onSubmit={saveEmail}
            >
              <label>
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  autoComplete="email"
                />
              </label>

              <button
                className="profile-save-button"
                type="submit"
                disabled={emailSaving}
              >
                {emailSaving ? 'Odesílám…' : 'Změnit e-mail'}
              </button>

              {emailMessage && (
                <p
                  className={`profile-form-message ${
                    emailMessage.includes('✓')
                      ? 'success'
                      : 'error'
                  }`}
                >
                  {emailMessage}
                </p>
              )}

              <p className="profile-form-note">
                Změna e-mailu může podle nastavení projektu
                vyžadovat potvrzení na současné i nové adrese.
              </p>
            </form>
          </section>

          <EmailReminderSettings key={session?.user?.id} email={session?.user?.email} />

          <section className="profile-settings-card profile-password-card">
            <div className="profile-card-heading">
              <span className="section-kicker">ZABEZPEČENÍ</span>
              <h2>Změnit heslo</h2>
              <p>
                Před změnou ověříme tvoje současné heslo.
              </p>
            </div>

            <form
              className="profile-form profile-password-form"
              onSubmit={savePassword}
            >
              <label>
                <span>Současné heslo</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) =>
                    setCurrentPassword(event.target.value)
                  }
                  autoComplete="current-password"
                />
              </label>

              <div className="profile-password-grid">
                <label>
                  <span>Nové heslo</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(event.target.value)
                    }
                    autoComplete="new-password"
                  />
                </label>

                <label>
                  <span>Nové heslo znovu</span>
                  <input
                    type="password"
                    value={newPasswordAgain}
                    onChange={(event) =>
                      setNewPasswordAgain(event.target.value)
                    }
                    autoComplete="new-password"
                  />
                </label>
              </div>

              <button
                className="profile-save-button"
                type="submit"
                disabled={passwordSaving}
              >
                {passwordSaving ? 'Měním heslo…' : 'Změnit heslo'}
              </button>

              {passwordMessage && (
                <p
                  className={`profile-form-message ${
                    passwordMessage.includes('✓')
                      ? 'success'
                      : 'error'
                  }`}
                >
                  {passwordMessage}
                </p>
              )}
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}

export default ProfilePage
