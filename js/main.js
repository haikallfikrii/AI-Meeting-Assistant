/* Kalfi landing — chrome, stealth toggle, BYOK cost model, Stripe handoff */

(function () {
  'use strict'

  var CONFIG = window.KALFI_CONFIG || {}

  /* ---------- header, nav, reveal ---------- */

  function chrome() {
    var bar = document.getElementById('topbar')
    var burger = document.getElementById('burger')
    var drawer = document.getElementById('drawer')

    var onScroll = function () {
      if (bar) bar.setAttribute('data-scrolled', String(window.scrollY > 8))
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()

    if (burger && drawer) {
      burger.addEventListener('click', function () {
        var open = drawer.getAttribute('data-open') !== 'true'
        drawer.setAttribute('data-open', String(open))
        burger.setAttribute('aria-expanded', String(open))
      })
      drawer.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          drawer.setAttribute('data-open', 'false')
          burger.setAttribute('aria-expanded', 'false')
        }
      })
    }

    var year = document.getElementById('year')
    if (year) year.textContent = String(new Date().getFullYear())
  }

  function heroMotion() {
    var pin = document.getElementById('hero-stage')
    var copy = document.getElementById('hero-copy')
    if (!pin || !copy) return

    var reduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      pin.style.setProperty('--p', '1')
      copy.setAttribute('data-faded', 'false')
      return
    }

    var ticking = false
    var update = function () {
      ticking = false
      var rect = pin.getBoundingClientRect()
      var travel = Math.max(pin.offsetHeight - window.innerHeight, 1)
      var raw = (-rect.top) / travel
      // Finish expand ~58% through the pin so the full window holds sticky longer
      var p = Math.min(1, Math.max(0, raw / 0.58))
      var eased = 1 - Math.pow(1 - p, 1.15)
      pin.style.setProperty('--p', String(eased))
      copy.setAttribute('data-faded', String(eased > 0.52))
    }

    var onScroll = function () {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
  }

  function reveal() {
    var nodes = document.querySelectorAll('[data-reveal], [data-reveal-stagger]')
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(nodes, function (n) {
        n.setAttribute('data-shown', 'true')
      })
      return
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return
          entry.target.setAttribute('data-shown', 'true')
          io.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
    )
    Array.prototype.forEach.call(nodes, function (n) {
      io.observe(n)
    })
  }

  /* ---------- stealth demo ---------- */

  function stealth() {
    var toggle = document.getElementById('stealth-toggle')
    var card = document.getElementById('leak-card')
    var label = document.getElementById('stealth-state')
    var tag = document.getElementById('leak-tag')
    if (!toggle || !card) return

    var apply = function () {
      var on = toggle.checked
      card.setAttribute('data-shown', String(!on))
      if (label) label.textContent = on ? 'on' : 'off'
      if (tag) {
        tag.textContent = on ? 'Shared screen · clean' : 'Shared screen · overlay leaking'
        tag.style.color = on ? '' : '#f6a94a'
      }
    }

    toggle.addEventListener('change', apply)
    apply()
  }

  /* ---------- brand personalization preview ---------- */

  function brandPreview() {
    var input = document.getElementById('brand-name-input')
    var file = document.getElementById('brand-logo-input')
    var clearBtn = document.getElementById('brand-logo-clear')
    var title = document.getElementById('brand-window-title')
    var chipName = document.getElementById('brand-chip-name')
    var chipLogo = document.getElementById('brand-chip-logo')
    var amName = document.getElementById('brand-am-name')
    if (!input || !chipName) return

    var objectUrl = ''

    var paint = function () {
      var name = (input.value || '').trim() || 'Notes Helper'
      chipName.textContent = name
      if (title) title.textContent = name + ' — live session'
      if (amName) amName.textContent = name
      if (chipLogo && !chipLogo.querySelector('img')) {
        chipLogo.textContent = name.charAt(0).toUpperCase()
      }
    }

    input.addEventListener('input', paint)
    paint()

    if (file && chipLogo) {
      file.addEventListener('change', function () {
        var chosen = file.files && file.files[0]
        if (!chosen) return
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = URL.createObjectURL(chosen)
        chipLogo.textContent = ''
        chipLogo.style.backgroundImage = ''
        var img = document.createElement('img')
        img.src = objectUrl
        img.alt = ''
        chipLogo.appendChild(img)
      })
    }

    if (clearBtn && chipLogo) {
      clearBtn.addEventListener('click', function () {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = ''
        if (file) file.value = ''
        chipLogo.innerHTML = ''
        chipLogo.style.backgroundImage = ''
        paint()
      })
    }
  }

  /* ---------- BYOK cost model ---------- */

  var MODELS = [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini — cheap default', inp: 0.15, out: 0.6 },
    { id: 'gemini-flash', label: 'Gemini 2.0 Flash — cheapest', inp: 0.1, out: 0.4 },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini — sharper', inp: 0.4, out: 1.6 },
    { id: 'claude-haiku', label: 'Claude 3.5 Haiku — best phrasing', inp: 0.8, out: 4.0 },
    { id: 'gpt-4o', label: 'GPT-4o — interview day', inp: 2.5, out: 10.0 }
  ]

  var ASSUME = {
    questionsPerMinute: 0.8,
    inputTokens: 900,
    outputTokens: 220,
    sttPerMinute: 0.006
  }

  var RIVALS = {
    byokPlan: 14,
    hosted: 19,
    finalRound: 150,
    parakeet: 149.9
  }

  function money(n) {
    return '$' + n.toFixed(2)
  }

  function calculator() {
    var sessions = document.getElementById('calc-sessions')
    var minutes = document.getElementById('calc-minutes')
    var model = document.getElementById('calc-model')
    var stt = document.getElementById('calc-stt')
    if (!sessions || !minutes || !model) return

    MODELS.forEach(function (m) {
      var opt = document.createElement('option')
      opt.value = m.id
      opt.textContent = m.label
      model.appendChild(opt)
    })

    var out = {
      sessions: document.getElementById('out-sessions'),
      minutes: document.getElementById('out-minutes'),
      stt: document.getElementById('out-stt'),
      amount: document.getElementById('bar-byok-amt'),
      detail: document.getElementById('byok-detail'),
      verdict: document.getElementById('verdict'),
      bars: {
        byok: document.getElementById('bar-byok'),
        pro: document.getElementById('bar-pro'),
        frai: document.getElementById('bar-frai'),
        parakeet: document.getElementById('bar-parakeet')
      }
    }

    var update = function () {
      var calls = Number(sessions.value)
      var mins = Number(minutes.value)
      var picked = MODELS.filter(function (m) {
        return m.id === model.value
      })[0]
      var totalMinutes = calls * mins
      var questions = totalMinutes * ASSUME.questionsPerMinute

      var tokenCost =
        (questions * ASSUME.inputTokens * picked.inp) / 1e6 +
        (questions * ASSUME.outputTokens * picked.out) / 1e6
      var sttCost = stt && stt.checked ? totalMinutes * ASSUME.sttPerMinute : 0
      var byok = RIVALS.byokPlan + tokenCost + sttCost

      if (out.sessions) out.sessions.textContent = String(calls)
      if (out.minutes) out.minutes.textContent = String(mins)
      if (out.stt) {
        out.stt.textContent = stt && stt.checked ? 'on · $0.006 / min' : 'off · text only'
      }
      if (out.amount) out.amount.textContent = money(byok)
      if (out.detail) {
        out.detail.textContent =
          '$14 plan + ' +
          money(tokenCost + sttCost) +
          ' provider (' +
          Math.round(questions) +
          ' answers / ' +
          totalMinutes +
          ' min)'
      }

      var scale = Math.max(byok, RIVALS.finalRound, RIVALS.parakeet)
      var setBar = function (el, value) {
        if (el) el.style.width = Math.max(1.2, (value / scale) * 100) + '%'
      }
      setBar(out.bars.byok, byok)
      setBar(out.bars.pro, RIVALS.hosted)
      setBar(out.bars.frai, RIVALS.finalRound)
      setBar(out.bars.parakeet, RIVALS.parakeet)

      if (out.verdict) {
        var vsFinal = (RIVALS.finalRound - byok) * 12
        if (byok <= RIVALS.hosted) {
          out.verdict.innerHTML =
            'At this usage BYOK lands at <strong>' +
            money(byok) +
            '</strong>/mo ($14 + provider). That is about <strong>' +
            money(vsFinal) +
            '</strong>/year under Final Round at $150. Stay on BYOK unless you want zero key setup.'
        } else {
          out.verdict.innerHTML =
            'At this usage BYOK is <strong>' +
            money(byok) +
            '</strong>/mo, so <strong>Hosted at $19 flat</strong> is cheaper — and still ' +
            money(RIVALS.finalRound - RIVALS.hosted) +
            '/mo under Final Round.'
        }
      }
    }

    ;[sessions, minutes].forEach(function (el) {
      el.addEventListener('input', update)
    })
    model.addEventListener('change', update)
    if (stt) stt.addEventListener('change', update)
    update()
  }

  /* ---------- Stripe handoff ---------- */

  function billing() {
    var buttons = document.querySelectorAll('[data-subscribe]')
    var note = document.getElementById('pro-note')
    var ready = Boolean(CONFIG.apiBaseUrl && CONFIG.stripePriceId)

    if (note) {
      note.textContent = ready
        ? 'Secure checkout by Stripe. Cancel any time in the customer portal.'
        : 'Checkout opens once Stripe price IDs are set. Until then, download the app and use BYOK when billing is live.'
    }

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        if (!ready) {
          var target = document.getElementById('pricing')
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          if (note) {
            note.textContent =
              'Billing is not live yet on this domain. Plans are $14 BYOK, $19 Hosted, $49 Team — see above.'
          }
          return
        }

        var original = btn.textContent
        btn.disabled = true
        btn.textContent = 'Opening Stripe…'

        fetch(CONFIG.apiBaseUrl.replace(/\/$/, '') + '/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId: CONFIG.stripePriceId })
        })
          .then(function (res) {
            return res.json()
          })
          .then(function (data) {
            if (data && data.url) {
              window.location.href = data.url
              return
            }
            throw new Error('no checkout url')
          })
          .catch(function () {
            btn.disabled = false
            btn.textContent = original
            if (note) note.textContent = 'Could not reach checkout. Try again in a moment.'
          })
      })
    })
  }

  /* ---------- multi-OS downloads ---------- */

  var OS_ICONS = {
    mac:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.7 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1 1-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.1 1.7 2.4 3 2.3 1.2-.1 1.6-.7 3.1-.7s1.8.7 3.1.7c1.3 0 2.1-1.1 2.9-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8zM14.8 5.7c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3z"/></svg>',
    win:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.2 10.4 4.1v7.1H3V5.2zm0 13.6 7.4 1.1v-7.2H3v6.1zM11.3 4 21 2.5v8.7h-9.7V4zM11.3 21.5 21 20.1v-8.4h-9.7v9.8z"/></svg>',
    linux:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.1 2.2c-.8 0-1.5.7-1.6 1.7-.2 1.3.3 2.6.7 3.6-.9.4-2.2 1.4-2.7 2.9-.6 1.9-.2 4.1.6 6.1.5 1.2.4 2-.1 2.7-.4.6-.4 1.3 0 1.8.5.6 1.4.8 2.3.5.5 1.1 1.4 1.8 2.5 1.8 1.1 0 2-.8 2.5-1.9.8.2 1.7 0 2.1-.6.4-.5.4-1.2 0-1.8-.5-.7-.6-1.5-.1-2.7.8-2 1.2-4.2.6-6.1-.5-1.5-1.8-2.5-2.7-2.9.4-1 .9-2.3.7-3.6-.1-1-.8-1.7-1.6-1.7zm-1.6 6.2c.4 0 .8.1 1.1.3.3-.5.8-.8 1.4-.8.6 0 1.1.3 1.4.8.3-.2.7-.3 1.1-.3 1.1 0 1.9.9 1.7 2.1-.1.8-.8 1.5-1.6 1.8-.3 1.1-1.2 1.8-2.2 1.8s-1.9-.8-2.2-1.8c-.8-.3-1.5-1-1.6-1.8-.2-1.2.6-2.1 1.7-2.1z"/></svg>'
  }

  var selectedOS = 'mac'
  var latestUrls = { mac: '', win: '', linux: '' }
  var latestMeta = {}

  function detectClientOS() {
    var ua = navigator.userAgent || ''
    var platform = navigator.platform || ''
    var uaData = navigator.userAgentData
    if (uaData && uaData.platform) {
      var p = String(uaData.platform).toLowerCase()
      if (p.indexOf('win') !== -1) return 'win'
      if (p.indexOf('linux') !== -1) return 'linux'
      if (p.indexOf('mac') !== -1) return 'mac'
    }
    if (/Windows|Win32|Win64/i.test(ua) || /Win/i.test(platform)) return 'win'
    if (/Android/i.test(ua)) return 'mac'
    if (/Linux/i.test(ua) || /Linux/i.test(platform)) return 'linux'
    if (/Mac|iPhone|iPad|iPod/i.test(ua) || /Mac/i.test(platform)) return 'mac'
    return 'mac'
  }

  function pickAssetUrl(assets, os) {
    var list = assets || []
    var name = function (a) {
      return (a && a.name) || ''
    }
    var url = function (a) {
      return (a && a.browser_download_url) || ''
    }

    if (os === 'mac') {
      var dmg =
        list.find(function (a) {
          return /-mac\.dmg$/i.test(name(a)) || /\.dmg$/i.test(name(a))
        }) ||
        list.find(function (a) {
          return /mac.*\.zip$/i.test(name(a))
        })
      return dmg ? url(dmg) : ''
    }
    if (os === 'win') {
      var exe = list.find(function (a) {
        return /\.exe$/i.test(name(a)) || /win.*setup/i.test(name(a))
      })
      return exe ? url(exe) : ''
    }
    var appImage = list.find(function (a) {
      return /\.AppImage$/i.test(name(a))
    })
    if (appImage) return url(appImage)
    var deb = list.find(function (a) {
      return /\.deb$/i.test(name(a))
    })
    return deb ? url(deb) : ''
  }

  function configuredUrl(os) {
    var files = CONFIG.downloads || {}
    var value = files[os]
    if (!value || typeof value !== 'string') return ''
    value = value.trim()
    if (!value) return ''
    if (/^https?:\/\//i.test(value) || value.charAt(0) === '/') return value
    return ''
  }

  function osLabel(os) {
    return (
      {
        mac: 'Download for Mac',
        win: 'Download for Windows',
        linux: 'Download for Linux'
      }[os] || 'Download for Mac'
    )
  }

  function osExt(os, ready) {
    if (!ready) return 'soon'
    return { mac: '.dmg', win: '.exe', linux: '.AppImage' }[os] || ''
  }

  function closeAllDownloadMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-download-widget]'), function (widget) {
      if (except && widget === except) return
      var menu = widget.querySelector('[data-download-menu]')
      var btn = widget.querySelector('[data-download-menu-btn]')
      if (menu) menu.hidden = true
      if (btn) btn.setAttribute('aria-expanded', 'false')
    })
  }

  function paintOsIcons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-os-icon]'), function (el) {
      var key = el.getAttribute('data-os-icon')
      if (OS_ICONS[key]) el.innerHTML = OS_ICONS[key]
    })
  }

  function applyDownloadLinks(urls, os, opts) {
    opts = opts || {}
    selectedOS = os
    latestUrls = urls
    latestMeta = opts

    var blurbs = {
      mac:
        'macOS DMG ready. If Mac says “damaged”, the file is fine — use Docs → Install → Open Anyway.',
      win:
        'Windows x64 installer (.exe). If SmartScreen appears: More info → Run anyway. See Docs for the walkthrough.',
      linux:
        'Linux AppImage ready. Make it executable, then run. Full steps are in Docs → Install.'
    }
    var metaReady = {
      mac: 'Detected macOS · ready to download',
      win: 'Detected Windows · ready to download',
      linux: 'Detected Linux · ready to download'
    }
    var metaWait = {
      mac: 'Detected macOS · Mac build is publishing…',
      win: 'Windows build not on this release yet · pick Mac/Linux or wait',
      linux: 'Detected Linux · Linux build is publishing…'
    }

    var primaryUrl = urls[os] || ''
    var primaryReady = Boolean(primaryUrl)

    Array.prototype.forEach.call(document.querySelectorAll('[data-download-widget]'), function (widget) {
      var go = widget.querySelector('[data-download-primary]')
      var icon = widget.querySelector('[data-download-icon]')
      var label = widget.querySelector('[data-download-label]')
      var ext = widget.querySelector('[data-download-ext]')

      if (icon) icon.innerHTML = OS_ICONS[os] || OS_ICONS.mac
      if (label) {
        label.textContent = primaryReady
          ? osLabel(os)
          : osLabel(os).replace('Download', 'Get') + ' (soon)'
      }
      if (ext) ext.textContent = osExt(os, primaryReady)

      if (go) {
        if (primaryReady) {
          go.setAttribute('href', primaryUrl)
          go.removeAttribute('target')
          go.removeAttribute('rel')
          go.removeAttribute('aria-disabled')
          go.classList.remove('is-disabled')
        } else {
          go.setAttribute('href', '#docs-install')
          go.removeAttribute('target')
          go.removeAttribute('rel')
          go.removeAttribute('aria-disabled')
          go.classList.add('is-disabled')
        }
      }

      Array.prototype.forEach.call(widget.querySelectorAll('[data-download-os]'), function (el) {
        var key = el.getAttribute('data-download-os')
        var ready = Boolean(urls[key])
        el.setAttribute('aria-selected', String(key === os))
        el.setAttribute('data-available', String(ready))
        var extEl = el.querySelector('[data-download-os-ext]')
        if (extEl) extEl.textContent = osExt(key, ready)
      })
    })

    var blurb = document.querySelector('[data-download-blurb]')
    if (blurb) {
      if (primaryReady) {
        blurb.textContent = blurbs[os] || blurbs.mac
      } else if (os === 'win') {
        blurb.innerHTML =
          'Windows installer is not on the latest release yet (CI has not published the <code>.exe</code>). Choose macOS or Linux from the menu for a direct download — we will not send you to a GitHub page for a missing file.'
      } else {
        blurb.textContent =
          'Installer for this OS is still publishing. Switch OS from the menu when another build is ready.'
      }
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-download-meta]'), function (el) {
      var text = primaryReady ? metaReady[os] : metaWait[os]
      if (opts.tag && primaryReady) text += ' · ' + opts.tag
      if (opts.status) text = opts.status
      el.textContent = text || metaWait[os]
    })
  }

  function bindDownloadWidgets() {
    paintOsIcons()

    Array.prototype.forEach.call(document.querySelectorAll('[data-download-widget]'), function (widget) {
      var btn = widget.querySelector('[data-download-menu-btn]')
      var menu = widget.querySelector('[data-download-menu]')
      if (!btn || !menu) return

      btn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        var open = menu.hidden
        closeAllDownloadMenus()
        if (open) {
          menu.hidden = false
          btn.setAttribute('aria-expanded', 'true')
        }
      })

      Array.prototype.forEach.call(widget.querySelectorAll('[data-download-os]'), function (opt) {
        opt.addEventListener('click', function (e) {
          e.preventDefault()
          e.stopPropagation()
          var key = opt.getAttribute('data-download-os')
          if (!key) return
          closeAllDownloadMenus()
          applyDownloadLinks(latestUrls, key, latestMeta)
        })
      })
    })

    document.addEventListener('click', function () {
      closeAllDownloadMenus()
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllDownloadMenus()
    })
  }

  function bindDocsOsTabs() {
    var tabs = document.querySelectorAll('[data-docs-os]')
    if (!tabs.length) return

    function showOs(key) {
      if (!key) return
      Array.prototype.forEach.call(tabs, function (t) {
        var on = t.getAttribute('data-docs-os') === key
        t.classList.toggle('is-on', on)
        t.setAttribute('aria-selected', String(on))
      })
      Array.prototype.forEach.call(document.querySelectorAll('[data-docs-panel]'), function (panel) {
        var match = panel.getAttribute('data-docs-panel') === key
        panel.classList.toggle('is-on', match)
        panel.hidden = !match
      })
    }

    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        showOs(tab.getAttribute('data-docs-os'))
      })
    })

    function syncFromHash() {
      var hash = (location.hash || '').replace(/^#/, '')
      if (hash === 'install') {
        history.replaceState(null, '', '#docs')
        var docs = document.getElementById('docs')
        if (docs) docs.scrollIntoView()
        return
      }
      if (hash === 'install-mac') showOs('mac')
      if (hash === 'install-win') showOs('win')
      if (hash === 'install-linux') showOs('linux')
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
  }

  function downloads() {
    selectedOS = detectClientOS()
    var seeded = {
      mac: configuredUrl('mac'),
      win: configuredUrl('win'),
      linux: configuredUrl('linux')
    }
    applyDownloadLinks(seeded, selectedOS, {
      status: 'Checking GitHub Releases for installers…'
    })

    var repo = CONFIG.githubRepo || 'haikallfikrii/AI-Meeting-Assistant'
    fetch('https://api.github.com/repos/' + repo + '/releases/latest')
      .then(function (res) {
        if (!res.ok) throw new Error('no release')
        return res.json()
      })
      .then(function (data) {
        var assets = (data && data.assets) || []
        var urls = {
          mac: seeded.mac || pickAssetUrl(assets, 'mac'),
          win: seeded.win || pickAssetUrl(assets, 'win'),
          linux: seeded.linux || pickAssetUrl(assets, 'linux')
        }
        applyDownloadLinks(urls, selectedOS, { tag: data.tag_name || '' })
      })
      .catch(function () {
        applyDownloadLinks(seeded, selectedOS, {
          status: 'Could not reach Releases — try again in a moment, or use Docs → Install.'
        })
      })
  }

  function init() {
    chrome()
    heroMotion()
    reveal()
    stealth()
    brandPreview()
    calculator()
    billing()
    bindDownloadWidgets()
    bindDocsOsTabs()
    downloads()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
