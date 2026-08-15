import { useEffect, useState } from 'react'

function Topbar({
  page = 'home',
  title = 'Tipovačka',
  session,
  currentUserName,
  isAdmin = false,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const userName =
    currentUserName || session?.user?.email || ''

  const navItems = [
    {
      key: 'home',
      label: 'Tipovačka',
      href: '/',
    },
    {
      key: 'results',
      label: 'Výsledky',
      href: '/results',
    },
    {
      key: 'profile',
      label: 'Profil',
      href: '/profile',
    },
    ...(isAdmin
      ? [
          {
            key: 'admin',
            label: 'Administrace',
            href: '/admin',
          },
        ]
      : []),
  ]

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand brand-link" href="/">
            <img
              className="brand-logo"
              src="/logo.png"
              alt="Tipovačka"
            />
            <div>
              <span className="brand-kicker">CHANCE LIGA</span>
              <strong>{title}</strong>
            </div>
          </a>

          <nav
            className="desktop-user-menu"
            aria-label="Hlavní navigace"
          >
            <div className="user-copy">
              <span>Přihlášen:</span>
              <strong>{userName}</strong>
            </div>

            {navItems
              .filter((item) => item.key !== page)
              .map((item) => (
                <a
                  key={item.key}
                  className="ghost-button nav-link-button"
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}

            {isAdmin && page !== 'admin' && (
              <span className="admin-badge">ADMIN</span>
            )}

            <button
              className="ghost-button"
              type="button"
              onClick={onLogout}
            >
              Odhlásit
            </button>
          </nav>

          <button
            className={`hamburger-button ${
              menuOpen ? 'is-open' : ''
            }`}
            type="button"
            aria-label={
              menuOpen ? 'Zavřít menu' : 'Otevřít menu'
            }
            aria-expanded={menuOpen}
            aria-controls="mobile-fullscreen-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div
        id="mobile-fullscreen-menu"
        className={`mobile-menu-overlay ${
          menuOpen ? 'is-open' : ''
        }`}
        aria-hidden={!menuOpen}
      >
        <div className="mobile-menu-top">
          <a
            className="mobile-menu-brand"
            href="/"
            onClick={() => setMenuOpen(false)}
          >
            <img src="/logo.png" alt="" />
            <div>
              <span>CHANCE LIGA</span>
              <strong>Tipovačka</strong>
            </div>
          </a>

          <button
            className="mobile-menu-close"
            type="button"
            aria-label="Zavřít menu"
            onClick={() => setMenuOpen(false)}
          >
            <span />
            <span />
          </button>
        </div>

        <div className="mobile-menu-content">
          <nav
            className="mobile-menu-nav"
            aria-label="Mobilní navigace"
          >
            {navItems.map((item, index) => (
              <a
                key={item.key}
                className={`mobile-menu-link ${
                  page === item.key ? 'active' : ''
                }`}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                <span className="mobile-menu-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{item.label}</span>
                <span className="mobile-menu-arrow">↗</span>
              </a>
            ))}
          </nav>
        </div>

        <div className="mobile-menu-footer">
          <div className="mobile-menu-user">
            <span>Přihlášen jako</span>
            <strong>{userName}</strong>
          </div>

          <button
            className="mobile-menu-logout"
            type="button"
            onClick={() => {
              setMenuOpen(false)
              onLogout?.()
            }}
          >
            Odhlásit se
          </button>
        </div>
      </div>
    </>
  )
}

export default Topbar
