/* Kalfi landing — chrome, stealth toggle, BYOK cost model, Polar checkout */

(function () {
  'use strict'

  var CONFIG = window.KALFI_CONFIG || {}

  /* ---------- header, nav, reveal ---------- */

  function chrome() {
    var bar = document.getElementById('topbar')
    var burger = document.getElementById('burger')
    var drawer = document.getElementById('drawer')
    var lastY = window.scrollY || 0
    var compact = false
    // accumulated direction so a few stray pixels never flip the bar
    var drift = 0
    var ticking = false

    var paint = function () {
      ticking = false
      if (!bar) return
      var y = window.scrollY || 0
      var dy = y - lastY
      bar.setAttribute('data-scrolled', String(y > 8))

      if (y < 40) {
        compact = false
        drift = 0
      } else if (dy > 0) {
        drift = Math.max(drift, 0) + dy
        if (drift > 26) {
          compact = true
          drift = 0
        }
      } else if (dy < 0) {
        drift = Math.min(drift, 0) + dy
        if (drift < -34) {
          compact = false
          drift = 0
        }
      }

      bar.setAttribute('data-compact', String(compact))
      lastY = y
    }

    var onScroll = function () {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(paint)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    paint()

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

    megaMenus()

    var year = document.getElementById('year')
    if (year) year.textContent = String(new Date().getFullYear())
  }

  /* ---------- mega menu: hover bridge + leave delay + click to pin ---------- */

  var MEGA_LEAVE_DELAY = 180

  function megaMenus() {
    var items = document.querySelectorAll('.nav-item')
    if (!items.length) return

    var closeTimer = null

    var setOpen = function (item, open) {
      var trigger = item.querySelector('.nav-item__trigger')
      item.classList.toggle('is-open', open)
      if (trigger) trigger.setAttribute('aria-expanded', String(open))
      if (open) {
        item.removeAttribute('data-closed')
      } else {
        item.removeAttribute('data-pinned')
        item.setAttribute('data-closed', 'true')
      }
    }

    var closeAll = function (except) {
      Array.prototype.forEach.call(items, function (item) {
        if (item === except) return
        setOpen(item, false)
      })
    }

    var open = function (item) {
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      closeAll(item)
      setOpen(item, true)
    }

    var scheduleClose = function (item) {
      if (closeTimer) clearTimeout(closeTimer)
      closeTimer = setTimeout(function () {
        closeTimer = null
        if (item.getAttribute('data-pinned') === 'true') return
        if (item.matches(':hover') || item.contains(document.activeElement)) return
        setOpen(item, false)
      }, MEGA_LEAVE_DELAY)
    }

    Array.prototype.forEach.call(items, function (item) {
      var trigger = item.querySelector('.nav-item__trigger')
      var mega = item.querySelector('.mega')
      if (!trigger || !mega) return

      item.addEventListener('mouseenter', function () {
        open(item)
      })

      item.addEventListener('mouseleave', function () {
        scheduleClose(item)
      })

      // Click pins the menu open so it survives a wandering cursor
      trigger.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        var pinned = item.getAttribute('data-pinned') === 'true'
        if (pinned) {
          setOpen(item, false)
          return
        }
        open(item)
        item.setAttribute('data-pinned', 'true')
      })

      mega.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(item, false)
      })

      item.addEventListener('focusin', function () {
        open(item)
      })

      item.addEventListener('focusout', function () {
        scheduleClose(item)
      })
    })

    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.nav-item')) return
      closeAll()
    })

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return
      closeAll()
    })
  }

  /* ---------- workflow timeline: scroll-linked light on the line ---------- */

  function timeline() {
    var stream = document.getElementById('timeline-stream')
    if (!stream) return

    var beam = stream.querySelector('.timeline__beam')
    var cards = Array.prototype.slice.call(stream.querySelectorAll('.tl-card'))
    var links = Array.prototype.slice.call(document.querySelectorAll('.timeline__dots a'))
    if (!beam || cards.length < 2) return

    var reduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    var dotOf = function (card) {
      return card.querySelector('.tl-card__mark span') || card
    }

    var span = { top: 28, len: 0 }
    var ticking = false

    // Pin the beam between the first and last step dots so the light lines
    // up with the markers instead of the raw card box.
    var measure = function () {
      var streamTop = stream.getBoundingClientRect().top
      var firstRect = dotOf(cards[0]).getBoundingClientRect()
      var lastRect = dotOf(cards[cards.length - 1]).getBoundingClientRect()
      var start = firstRect.top - streamTop + firstRect.height / 2
      var end = lastRect.top - streamTop + lastRect.height / 2
      span.top = start
      span.len = Math.max(end - start, 1)
      beam.style.setProperty('--tl-top', span.top + 'px')
      beam.style.setProperty('--tl-len', span.len + 'px')
    }

    var paint = function () {
      ticking = false
      if (reduced) return

      measure()
      var streamTop = stream.getBoundingClientRect().top
      // reference line sits just above centre of the viewport
      var mark = window.innerHeight * 0.46
      var progress = (mark - streamTop - span.top) / span.len
      var p = Math.min(1, Math.max(0, progress))

      beam.style.setProperty('--tl-p', String(p))
      stream.setAttribute('data-lit', String(progress > -0.15 && progress < 1.35))

      // active card = last one whose dot the light has reached
      var activeIndex = -1
      cards.forEach(function (card, i) {
        var rect = dotOf(card).getBoundingClientRect()
        if (rect.top + rect.height / 2 <= mark + 8) activeIndex = i
      })
      if (activeIndex < 0 && streamTop < mark) activeIndex = 0

      cards.forEach(function (card, i) {
        card.setAttribute('data-lit', String(i <= activeIndex))
        card.setAttribute('data-active', String(i === activeIndex))
      })

      links.forEach(function (link, i) {
        link.classList.toggle('is-active', i === activeIndex)
      })
    }

    var onScroll = function () {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(paint)
    }

    measure()

    if (reduced) {
      beam.style.setProperty('--tl-p', '1')
      cards.forEach(function (card) {
        card.setAttribute('data-lit', 'true')
      })
      return
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    paint()
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
      // Finish expand earlier so the nearly-fullscreen demo holds sticky longer
      var p = Math.min(1, Math.max(0, raw / 0.48))
      var eased = 1 - Math.pow(1 - p, 1.08)
      pin.style.setProperty('--p', String(eased))
      copy.setAttribute('data-faded', String(eased > 0.45))
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

  /* ---------- Polar billing (OTP gate → API checkout session; Lemon fallback) ---------- */

  function tr(key, vars) {
    try {
      if (window.KalfiI18n && typeof window.KalfiI18n.t === 'function') {
        return window.KalfiI18n.t(key, vars)
      }
    } catch (e) {}
    return key
  }

  var CHECKOUT_PROOF_KEY = 'kalfi_checkout_proof'
  var CHECKOUT_INTENT_KEY = 'kalfi_checkout_intent'
  var ORDER_TRACK_KEY = 'kalfi_order_track'
  var PROOF_TTL_MS = 48 * 60 * 60 * 1000

  function saveCheckoutProof(email, emailProof) {
    try {
      localStorage.setItem(
        CHECKOUT_PROOF_KEY,
        JSON.stringify({
          email: String(email || '').toLowerCase(),
          emailProof: emailProof,
          exp: Date.now() + PROOF_TTL_MS
        })
      )
    } catch (e) {}
  }

  function loadCheckoutProof() {
    try {
      var raw = localStorage.getItem(CHECKOUT_PROOF_KEY)
      if (!raw) return null
      var data = JSON.parse(raw)
      if (!data || !data.emailProof || !data.email || !data.exp || data.exp < Date.now()) {
        localStorage.removeItem(CHECKOUT_PROOF_KEY)
        return null
      }
      return data
    } catch (e) {
      return null
    }
  }

  function saveCheckoutIntent(intent) {
    try {
      localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent || {}))
    } catch (e) {}
  }

  function loadCheckoutIntent() {
    try {
      return JSON.parse(localStorage.getItem(CHECKOUT_INTENT_KEY) || 'null')
    } catch (e) {
      return null
    }
  }

  function saveOrderTrack(track) {
    try {
      localStorage.setItem(ORDER_TRACK_KEY, JSON.stringify(track))
    } catch (e) {}
  }

  function loadOrderTrack() {
    try {
      return JSON.parse(localStorage.getItem(ORDER_TRACK_KEY) || 'null')
    } catch (e) {
      return null
    }
  }

  function clearOrderTrack() {
    try {
      localStorage.removeItem(ORDER_TRACK_KEY)
    } catch (e) {}
  }

  function statusMeta(status) {
    if (status === 'awaiting_payment') {
      return {
        label: tr('status.awaiting'),
        hint: tr('status.awaiting.hint')
      }
    }
    if (status === 'reported_paid') {
      return {
        label: tr('status.review'),
        hint: tr('status.review.hint')
      }
    }
    if (status === 'activated') {
      return {
        label: tr('status.active'),
        hint: tr('status.active.hint')
      }
    }
    return { label: status || 'Unknown', hint: '' }
  }

  function goDownloadAndClose(gateRoot) {
    if (gateRoot) gateRoot.remove()
    var target = document.getElementById('download')
    if (target) {
      history.replaceState(null, '', '#download')
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.location.hash = 'download'
    }
  }

  function ensureOrderTrackBanner() {
    var track = loadOrderTrack()
    var existing = document.getElementById('order-track-banner')
    if (!track || !track.orderId) {
      if (existing) existing.remove()
      return
    }
    if (track.status === 'activated') {
      if (existing) existing.remove()
      return
    }
    var meta = statusMeta(track.status)
    if (!existing) {
      existing = document.createElement('div')
      existing.id = 'order-track-banner'
      existing.className = 'order-track-banner'
      document.body.appendChild(existing)
    }
    existing.innerHTML =
      '<div class="order-track-banner__inner">' +
      '<div><strong>' +
      tr('track.order', { ref: track.ref || '' }) +
      '</strong> · ' +
      meta.label +
      '<span class="order-track-banner__hint">' +
      meta.hint +
      '</span></div>' +
      '<div class="order-track-banner__actions">' +
      '<button type="button" class="btn btn--accent btn--sm" data-track-open>' +
      tr('track.view') +
      '</button>' +
      '<button type="button" class="btn btn--line btn--sm" data-track-dismiss aria-label="Dismiss">×</button>' +
      '</div></div>'
    existing.querySelector('[data-track-open]').onclick = function () {
      reopenOrderTracker()
    }
    existing.querySelector('[data-track-dismiss]').onclick = function () {
      existing.remove()
    }
  }

  function pollOrderTrackBanner() {
    var track = loadOrderTrack()
    if (!track || !track.orderId || !track.email) return
    var apiBase = String(CONFIG.apiBaseUrl || '').replace(/\/$/, '')
    if (!apiBase) return
    fetch(
      apiBase +
        '/v1/billing/manual/status?orderId=' +
        encodeURIComponent(track.orderId) +
        '&email=' +
        encodeURIComponent(track.email)
    )
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data }
        })
      })
      .then(function (result) {
        if (!result.ok || !result.data) return
        track.status = result.data.status
        track.ref = result.data.ref || track.ref
        saveOrderTrack(track)
        ensureOrderTrackBanner()
        if (result.data.status === 'activated') {
          // Keep banner briefly as success via reopen path
          setTimeout(function () {
            clearOrderTrack()
            ensureOrderTrackBanner()
          }, 60 * 1000)
        }
      })
      .catch(function () {})
  }

  function reopenOrderTracker() {
    var track = loadOrderTrack()
    if (!track || !track.orderId) return
    var existing = document.getElementById('checkout-email-gate')
    if (existing) existing.remove()
    var root = document.createElement('div')
    root.id = 'checkout-email-gate'
    root.className = 'email-gate'
    root.style.display = 'grid'
    root.style.placeItems = 'center'
    root.innerHTML = '<div class="email-gate__card" role="dialog" aria-modal="true"></div>'
    document.body.appendChild(root)
    showWiseInstructions(
      root,
      {
        orderId: track.orderId,
        instructions: {
          ref: track.ref,
          amountUsd: track.amountUsd,
          plan: track.plan,
          wiseEmail: track.wiseEmail || 'hello@kalfi.app',
          accountName: track.accountName || 'Kalfi',
          payLink: track.payLink || null,
          steps: []
        }
      },
      track.email,
      track.status || 'awaiting_payment'
    )
  }

  function isPlaceholderCheckout(url) {
    return (
      !url ||
      /LEMON_SQUEEZY_CHECKOUT_URL_/.test(url) ||
      /POLAR_CHECKOUT_URL_/.test(url) ||
      String(url).trim() === ''
    )
  }

  function planSku(plan, interval) {
    if (plan === 'byok') return interval === 'annual' ? 'byok_annual' : 'byok_monthly'
    if (plan === 'hosted') return interval === 'annual' ? 'hosted_annual' : 'hosted_monthly'
    if (plan === 'team') return 'team'
    if (plan === 'singleSession') return 'single_session'
    return ''
  }

  function resolveCheckoutUrl(plan, interval) {
    var polar = CONFIG.polarCheckout || {}
    var lemon = CONFIG.lemonCheckout || {}
    var key =
      plan === 'byok'
        ? interval === 'annual'
          ? 'byokAnnual'
          : 'byokMonthly'
        : plan === 'hosted'
          ? interval === 'annual'
            ? 'hostedAnnual'
            : 'hostedMonthly'
          : plan === 'team'
            ? 'team'
            : plan === 'singleSession'
              ? 'singleSession'
              : ''
    if (!key) return ''
    var polarUrl = polar[key]
    if (polarUrl && !isPlaceholderCheckout(polarUrl)) return polarUrl
    return lemon[key] || ''
  }

  // Back-compat alias used by older helpers
  function resolveLemonUrl(plan, interval) {
    return resolveCheckoutUrl(plan, interval)
  }

  function checkoutSelector() {
    return '[data-polar-checkout], [data-lemon-checkout]'
  }

  function checkoutPlanAttr(el) {
    return el.getAttribute('data-polar-checkout') || el.getAttribute('data-lemon-checkout') || ''
  }

  function billing() {
    var note = document.getElementById('pro-note')
    var toggle = document.getElementById('billing-toggle')
    var plans = document.getElementById('plans')
    var banner = document.getElementById('checkout-success')
    var interval = 'monthly'
    var apiReady = Boolean(CONFIG.apiBaseUrl)

    // After Polar/Lemon redirect: ?checkout=success&plan=...&email=...
    try {
      var params = new URLSearchParams(window.location.search)
      if (params.get('checkout') === 'success' && banner) {
        banner.hidden = false
        var planParam = params.get('plan') || ''
        var emailParam = params.get('email') || ''
        var detail = banner.querySelector('[data-success-detail]')
        if (detail) {
          detail.textContent =
            'Plan ' +
            (planParam || 'purchased') +
            ' is linked to the email you used at checkout' +
            (emailParam ? ' (' + emailParam + ')' : '') +
            '. Open the Kalfi app → Settings → Account: set password (first time) or log in with that email. Your plan syncs automatically.'
        }
        // Funnel ping — marks lead payment_returned (subscribed still needs Polar webhook)
        if (emailParam && CONFIG.apiBaseUrl) {
          fetch(String(CONFIG.apiBaseUrl).replace(/\/$/, '') + '/v1/billing/checkout-return', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailParam, plan: planParam })
          }).catch(function () {})
        }
      }
    } catch (_) {}

    var paintInterval = function () {
      if (plans) plans.setAttribute('data-billing', interval)
      if (toggle) {
        Array.prototype.forEach.call(toggle.querySelectorAll('[data-billing]'), function (btn) {
          btn.classList.toggle('is-on', btn.getAttribute('data-billing') === interval)
        })
      }

      Array.prototype.forEach.call(
        document.querySelectorAll('[data-plan-card="byok"], [data-plan-card="hosted"]'),
        function (card) {
          var main = card.querySelector('[data-price-main]')
          var suffix = card.querySelector('[data-price-suffix]')
          var billed = card.querySelector('[data-price-billed]')
          var save = card.querySelector('[data-price-save]')
          var cta = card.querySelector(checkoutSelector())
          var monthly = card.getAttribute('data-price-monthly')
          var annualMo = card.getAttribute('data-price-annual-mo')
          var annual = card.getAttribute('data-price-annual')
          var saveLabel = card.getAttribute('data-save-annual')

          if (interval === 'annual') {
            if (main) main.textContent = annualMo
            if (suffix) suffix.textContent = ' / month'
            if (billed) {
              billed.hidden = false
              billed.textContent = 'Billed $' + annual + ' / year'
            }
            if (save) {
              save.hidden = false
              save.textContent = 'Save ' + saveLabel
            }
          } else {
            if (main) main.textContent = monthly
            if (suffix) suffix.textContent = ' / month'
            if (billed) billed.hidden = true
            if (save) save.hidden = true
          }
          if (cta) {
            cta.setAttribute('data-interval', interval)
            var href = resolveCheckoutUrl(checkoutPlanAttr(cta), interval)
            if (href && !isPlaceholderCheckout(href)) cta.setAttribute('href', href)
          }
        }
      )

      Array.prototype.forEach.call(document.querySelectorAll(checkoutSelector()), function (cta) {
        var p = checkoutPlanAttr(cta)
        var href = resolveCheckoutUrl(p, cta.getAttribute('data-interval') || interval)
        if (href && !isPlaceholderCheckout(href)) cta.setAttribute('href', href)
      })

      if (note) {
        note.textContent =
          (CONFIG.paymentProvider || 'wise') === 'wise'
            ? tr('checkout.note.wise')
            : tr('checkout.note.polar')
      }
    }

    if (toggle) {
      toggle.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-billing]')
        if (!btn) return
        interval = btn.getAttribute('data-billing') || 'monthly'
        paintInterval()
      })
    }

    document.addEventListener('click', function (e) {
      var link = e.target.closest(checkoutSelector())
      if (!link) return
      e.preventDefault()
      var plan = checkoutPlanAttr(link)
      var linkInterval = link.getAttribute('data-interval') || interval
      var sku = planSku(plan, linkInterval)
      var fallback = resolveCheckoutUrl(plan, linkInterval)

      if (!sku && isPlaceholderCheckout(fallback)) {
        var target = document.getElementById('pricing')
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        if (note) {
          note.textContent =
            'Checkout not ready for this plan yet. Add Polar product IDs on the API, or paste a Checkout Link into KALFI_CONFIG.polarCheckout.'
        }
        return
      }

      openCheckoutEmailGate({
        plan: plan,
        sku: sku,
        interval: linkInterval,
        fallback: fallback,
        embed: CONFIG.polarCheckoutMode === 'embed'
      })
    })

    paintInterval()
  }

  function showWiseInstructions(gateRoot, payload, email, initialStatus) {
    var card = gateRoot.querySelector('.email-gate__card')
    if (!card) return
    var ins = payload.instructions || {}
    var orderId = payload.orderId
    var apiBase = String(CONFIG.apiBaseUrl || '').replace(/\/$/, '')
    var pollTimer = null
    var currentStatus = initialStatus || 'awaiting_payment'

    saveOrderTrack({
      orderId: orderId,
      email: email,
      ref: ins.ref,
      plan: ins.plan,
      amountUsd: ins.amountUsd,
      wiseEmail: ins.wiseEmail,
      accountName: ins.accountName,
      payLink: ins.payLink || null,
      status: currentStatus
    })
    ensureOrderTrackBanner()

    function bindClose() {
      var closeBtn = card.querySelector('[data-gate-close]')
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          if (pollTimer) clearInterval(pollTimer)
          gateRoot.remove()
          ensureOrderTrackBanner()
        })
      }
      gateRoot.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          if (pollTimer) clearInterval(pollTimer)
          gateRoot.remove()
          ensureOrderTrackBanner()
        }
      })
    }

    function progressHtml(status) {
      var steps = [
        { key: 'awaiting_payment', label: tr('wise.progress.pay') },
        { key: 'reported_paid', label: tr('wise.progress.review') },
        { key: 'activated', label: tr('wise.progress.active') }
      ]
      var rank = { awaiting_payment: 0, reported_paid: 1, activated: 2 }
      var cur = rank[status] != null ? rank[status] : 0
      return (
        '<ol class="order-progress">' +
        steps
          .map(function (s, i) {
            var cls =
              i < cur ? 'is-done' : i === cur ? 'is-current' : 'is-todo'
            return (
              '<li class="' +
              cls +
              '"><span>' +
              (i + 1) +
              '</span>' +
              s.label +
              '</li>'
            )
          })
          .join('') +
        '</ol>'
      )
    }

    function showActivated() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      currentStatus = 'activated'
      saveOrderTrack(
        Object.assign(loadOrderTrack() || {}, {
          status: 'activated',
          orderId: orderId,
          email: email
        })
      )
      ensureOrderTrackBanner()
      card.innerHTML =
        '<button type="button" class="email-gate__close" data-gate-close aria-label="Close">×</button>' +
        '<p class="email-gate__eyebrow">' + tr('wise.status.active') + '</p>' +
        '<h3 id="email-gate-title">' + tr('wise.active.title') + '</h3>' +
        progressHtml('activated') +
        '<p class="email-gate__ready">Plan activated for <strong>' +
        email +
        '</strong>. No license key.</p>' +
        '<p class="email-gate__lead">Open Kalfi → Settings → Claim / Log in with that email (set a password first time), then Sync plan.</p>' +
        '<p style="text-align:center;margin-top:14px"><button type="button" class="btn btn--accent" id="wise-download">' + tr('wise.download') + '</button></p>'
      bindClose()
      var dl = card.querySelector('#wise-download')
      if (dl) {
        dl.addEventListener('click', function () {
          goDownloadAndClose(gateRoot)
        })
      }
    }

    function showUnderReview() {
      currentStatus = 'reported_paid'
      saveOrderTrack(
        Object.assign(loadOrderTrack() || {}, {
          status: 'reported_paid',
          orderId: orderId,
          email: email,
          ref: ins.ref
        })
      )
      ensureOrderTrackBanner()
      var meta = statusMeta('reported_paid')
      card.innerHTML =
        '<button type="button" class="email-gate__close" data-gate-close aria-label="Close">×</button>' +
        '<p class="email-gate__eyebrow">Status · ' +
        meta.label +
        '</p>' +
        '<h3 id="email-gate-title">Payment under review</h3>' +
        progressHtml('reported_paid') +
        '<p class="email-gate__lead">' +
        meta.hint +
        '</p>' +
        '<p class="email-gate__ref">Reference: <code>' +
        (ins.ref || '') +
        '</code></p>' +
        '<p class="email-gate__meta">We’ll email <strong>' +
        email +
        '</strong> when your plan is live. Keep this tab open — status updates here automatically.</p>' +
        '<p class="email-gate__msg" id="wise-msg">Checking status…</p>'
      bindClose()
      if (!pollTimer) {
        pollTimer = setInterval(pollStatus, 6000)
        pollStatus()
      }
    }

    function pollStatus() {
      fetch(
        apiBase +
          '/v1/billing/manual/status?orderId=' +
          encodeURIComponent(orderId) +
          '&email=' +
          encodeURIComponent(email)
      )
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data }
          })
        })
        .then(function (result) {
          if (!result.ok || !result.data) return
          var st = result.data.status
          var msg = card.querySelector('#wise-msg')
          if (st === 'activated') {
            showActivated()
            return
          }
          if (st === 'reported_paid' && currentStatus !== 'reported_paid') {
            showUnderReview()
            return
          }
          if (msg && result.data.statusLabel) {
            msg.hidden = false
            msg.textContent =
              result.data.statusLabel +
              (result.data.statusHint ? ' — ' + result.data.statusHint : '')
          }
        })
        .catch(function () {})
    }

    if (currentStatus === 'activated') {
      showActivated()
      return
    }
    if (currentStatus === 'reported_paid') {
      showUnderReview()
      return
    }

    var payLink = ins.payLink
      ? '<p style="text-align:center;margin:0 0 12px"><a class="btn btn--accent btn--sm" href="' +
        ins.payLink +
        '" target="_blank" rel="noopener">Open Wise payment</a></p>'
      : ''
    var steps = (ins.steps || []).map(function (s) {
      return '<li>' + s + '</li>'
    }).join('')

    card.innerHTML =
      '<button type="button" class="email-gate__close" data-gate-close aria-label="Close">×</button>' +
      '<p class="email-gate__eyebrow">' + tr('wise.status.pay') + '</p>' +
      '<h3 id="email-gate-title">' + tr('wise.title') + '</h3>' +
      progressHtml('awaiting_payment') +
      '<p class="email-gate__lead">Send <strong>$' +
      ins.amountUsd +
      ' USD</strong> for <strong>' +
      String(ins.plan || '').replace(/_/g, ' ') +
      '</strong>.</p>' +
      '<p class="email-gate__ref">Payment reference (put in Wise memo):<br><code id="wise-ref">' +
      (ins.ref || '') +
      '</code> ' +
      '<button type="button" class="btn btn--line btn--sm" id="wise-copy-ref">' + tr('wise.copy') + '</button></p>' +
      '<p class="email-gate__meta">Wise recipient: <strong>' +
      (ins.wiseEmail || 'hello@kalfi.app') +
      '</strong>' +
      (ins.accountName ? ' · ' + ins.accountName : '') +
      '</p>' +
      payLink +
      (steps ? '<ol class="email-gate__steps">' + steps + '</ol>' : '') +
      '<button type="button" class="btn btn--accent" id="wise-mark-paid">' + tr('wise.markPaid') + '</button>' +
      '<p class="email-gate__msg" id="wise-msg" hidden></p>' +
      '<p class="email-gate__hint">After you notify us, status becomes <strong>Under review</strong> here (and by email). Then Claim / Log in in the app with <strong>' +
      email +
      '</strong>.</p>'

    bindClose()
    var copyBtn = card.querySelector('#wise-copy-ref')
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var ref = ins.ref || ''
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ref)
        }
        copyBtn.textContent = tr('wise.copied')
      })
    }
    var markBtn = card.querySelector('#wise-mark-paid')
    var msg = card.querySelector('#wise-msg')
    if (markBtn) {
      markBtn.addEventListener('click', function () {
        markBtn.disabled = true
        markBtn.textContent = tr('wise.sending')
        fetch(apiBase + '/v1/billing/manual/mark-paid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: orderId, email: email })
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { ok: res.ok, data: data }
            })
          })
          .then(function (result) {
            if (result.ok && result.data && result.data.status === 'activated') {
              showActivated()
              return
            }
            if (result.ok) {
              showUnderReview()
              return
            }
            if (msg) {
              msg.hidden = false
              msg.textContent = (result.data && result.data.error) || 'Could not notify.'
            }
            markBtn.disabled = false
            markBtn.textContent = tr('wise.markPaid')
          })
          .catch(function () {
            markBtn.disabled = false
            markBtn.textContent = tr('wise.markPaid')
            if (msg) {
              msg.hidden = false
              msg.textContent = 'Network error — email hello@kalfi.app with your reference.'
            }
          })
      })
    }
  }

  function openCheckoutEmailGate(opts) {
    saveCheckoutIntent({
      plan: opts.plan,
      sku: opts.sku,
      interval: opts.interval,
      fallback: opts.fallback,
      embed: opts.embed
    })

    var existing = document.getElementById('checkout-email-gate')
    if (existing) existing.remove()

    var apiBase = String(CONFIG.apiBaseUrl || '').replace(/\/$/, '')
    var planLabel = opts.plan
      ? String(opts.plan).replace(/_/g, ' ')
      : 'your plan'
    var proof = loadCheckoutProof()
    var skipOtp = Boolean(
      proof &&
        proof.emailProof &&
        (!opts.prefillEmail ||
          String(opts.prefillEmail).toLowerCase() === String(proof.email).toLowerCase()) &&
        !opts.prefillCode
    )

    var root = document.createElement('div')
    root.id = 'checkout-email-gate'
    root.className = 'email-gate'
    root.innerHTML =
      '<div class="email-gate__card" role="dialog" aria-modal="true" aria-labelledby="email-gate-title">' +
      '<button type="button" class="email-gate__close" data-gate-close aria-label="Close">×</button>' +
      '<p class="email-gate__eyebrow">' + tr('gate.eyebrow') + '</p>' +
      '<h3 id="email-gate-title">' +
      (skipOtp ? tr('gate.title.continue') : tr('gate.title')) +
      '</h3>' +
      '<p class="email-gate__lead">' +
      (skipOtp
        ? tr('gate.lead.skip', { email: proof.email })
        : tr('gate.lead', { plan: planLabel })) +
      '</p>' +
      '<div data-gate-step="email"' +
      (skipOtp ? ' hidden' : '') +
      '>' +
      '<label class="email-gate__label">' + tr('gate.email') +
      '<input type="email" data-gate-email placeholder="you@email.com" autocomplete="email" /></label>' +
      '</div>' +
      '<div class="email-gate__otp" data-gate-step="code" hidden>' +
      '<p class="email-gate__sent" data-gate-sent></p>' +
      '<label class="email-gate__label">' + tr('gate.code') +
      '<input type="text" inputmode="numeric" maxlength="6" data-gate-code placeholder="6-digit code" autocomplete="one-time-code" /></label>' +
      '<div class="email-gate__codebox" data-gate-codebox hidden>' +
      '<p class="email-gate__codebox-label">Test mode code</p>' +
      '<p class="email-gate__codebox-value" data-gate-code-display></p>' +
      '</div>' +
      '</div>' +
      '<p class="email-gate__msg" data-gate-msg hidden></p>' +
      '<button type="button" class="btn btn--accent email-gate__primary" data-gate-primary>' +
      (skipOtp ? tr('gate.continue') : tr('gate.send')) +
      '</button>' +
      '<button type="button" class="email-gate__resend" data-gate-resend hidden>' +
      tr('gate.resend') +
      '</button>' +
      (skipOtp
        ? '<button type="button" class="email-gate__resend" data-gate-use-other>' +
          tr('gate.otherEmail') +
          '</button>'
        : '') +
      '</div>'

    document.body.appendChild(root)
    root.style.display = 'grid'
    root.style.placeItems = 'center'

    var emailEl = root.querySelector('[data-gate-email]')
    var codeEl = root.querySelector('[data-gate-code]')
    var codeBox = root.querySelector('[data-gate-codebox]')
    var codeDisplay = root.querySelector('[data-gate-code-display]')
    var stepEmail = root.querySelector('[data-gate-step="email"]')
    var stepCode = root.querySelector('[data-gate-step="code"]')
    var sentEl = root.querySelector('[data-gate-sent]')
    var msgEl = root.querySelector('[data-gate-msg]')
    var primaryBtn = root.querySelector('[data-gate-primary]')
    var resendBtn = root.querySelector('[data-gate-resend]')
    var useOtherBtn = root.querySelector('[data-gate-use-other]')
    var stage = skipOtp ? 'verified' : 'email'
    var busy = false
    var autoPayStarted = false
    var cachedProof = skipOtp ? proof.emailProof : ''

    if (emailEl) {
      emailEl.value = opts.prefillEmail || (skipOtp ? proof.email : '') || ''
    }
    if (opts.prefillCode && codeEl) {
      codeEl.value = String(opts.prefillCode).replace(/\D/g, '').slice(0, 6)
    }

    function setMsg(text, isError) {
      if (!msgEl) return
      if (!text) {
        msgEl.hidden = true
        msgEl.textContent = ''
        return
      }
      msgEl.hidden = false
      msgEl.textContent = text
      msgEl.classList.toggle('is-error', Boolean(isError))
    }

    function close() {
      root.remove()
    }

    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-gate-close]')) close()
    })
    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') close()
    })
    root.addEventListener('mousedown', function (ev) {
      if (ev.target === root) ev.preventDefault()
    })

    function showCodeStep(email, devCode) {
      stage = 'code'
      if (stepEmail) stepEmail.hidden = true
      if (stepCode) stepCode.hidden = false
      if (sentEl) {
        sentEl.textContent =
          'Code sent to ' + email + '. Paste it below, or tap Verify & continue in the email.'
      }
      primaryBtn.textContent = tr('gate.continue')
      resendBtn.hidden = false
      if (devCode && codeEl) {
        codeEl.value = devCode
        if (codeBox) codeBox.hidden = false
        if (codeDisplay) codeDisplay.textContent = devCode
        setMsg('Test mode: code filled in — continue to payment.')
      } else if (codeBox) {
        codeBox.hidden = true
      }
      if (codeEl) codeEl.focus()
    }

    function startCheckoutWithProof(email, emailProof) {
      var provider = CONFIG.paymentProvider || 'wise'
      var path =
        provider === 'polar' ? '/v1/billing/checkout' : '/v1/billing/manual/checkout'
      return fetch(apiBase + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: opts.sku,
          email: email,
          emailProof: emailProof,
          embed: Boolean(opts.embed),
          successUrl:
            'https://kalfi.app/?checkout=success&plan=' +
            encodeURIComponent(opts.sku) +
            '&email=' +
            encodeURIComponent(email)
        })
      }).then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data, provider: provider }
        })
      })
    }

    function requestCode() {
      var email = (emailEl && emailEl.value || '').trim()
      if (!email || email.indexOf('@') < 1) {
        setMsg(tr('gate.invalidEmail'), true)
        return
      }
      if (!apiBase) {
        setMsg('Checkout API is not configured.', true)
        return
      }
      if (busy) return
      busy = true
      primaryBtn.disabled = true
      primaryBtn.textContent = tr('gate.sending')
      setMsg('')
      fetch(apiBase + '/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          purpose: 'checkout',
          plan: opts.plan || '',
          sku: opts.sku || ''
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data }
          })
        })
        .then(function (result) {
          if (result.status === 404) {
            close()
            legacyCheckout(opts, email)
            return
          }
          if (!result.ok) {
            setMsg((result.data && result.data.error) || 'Could not send code.', true)
            return
          }
          showCodeStep(email, result.data && result.data.devCode)
          if (!result.data || !result.data.devCode) {
            setMsg(tr('gate.checkInbox'))
          }
        })
        .catch(function (err) {
          var detail =
            err && err.message
              ? String(err.message)
              : 'Browser blocked the request (often CORS or offline).'
          setMsg('Network error while sending the code. ' + detail, true)
        })
        .finally(function () {
          busy = false
          primaryBtn.disabled = false
          if (stage === 'email') primaryBtn.textContent = tr('gate.send')
          else primaryBtn.textContent = tr('gate.continue')
        })
    }

    function legacyCheckout(gateOpts, email) {
      var successUrl =
        'https://kalfi.app/?checkout=success&plan=' +
        encodeURIComponent(gateOpts.sku || '') +
        '&email=' +
        encodeURIComponent(email || '')
      if (!apiBase || !gateOpts.sku) {
        var url = gateOpts.fallback
        if (url && email) {
          url +=
            (url.indexOf('?') >= 0 ? '&' : '?') +
            'checkout[email]=' +
            encodeURIComponent(email)
        }
        if (url && !isPlaceholderCheckout(url)) window.location.href = url
        return
      }
      fetch(apiBase + '/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: gateOpts.sku,
          email: email,
          successUrl: successUrl
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data }
          })
        })
        .then(function (result) {
          var url =
            result.ok && result.data && result.data.url
              ? result.data.url
              : gateOpts.fallback
          if (url && !isPlaceholderCheckout(url)) window.location.href = url
        })
        .catch(function () {
          if (gateOpts.fallback && !isPlaceholderCheckout(gateOpts.fallback)) {
            window.location.href = gateOpts.fallback
          }
        })
    }

    function afterProof(email, emailProof) {
      return startCheckoutWithProof(email, emailProof).then(function (result) {
        if (!result) return
        if (result.provider !== 'polar') {
          if (!result.ok || !result.data || !result.data.instructions) {
            setMsg((result.data && result.data.error) || 'Could not create Wise order.', true)
            return
          }
          showWiseInstructions(root, result.data, email)
          return
        }
        var url =
          result.ok && result.data && result.data.url ? result.data.url : opts.fallback
        if (!url || isPlaceholderCheckout(url)) {
          setMsg('Checkout is not ready for this plan yet.', true)
          return
        }
        if (url.indexOf('checkout') !== -1 && url.indexOf('email') === -1) {
          url +=
            (url.indexOf('?') >= 0 ? '&' : '?') +
            'checkout[email]=' +
            encodeURIComponent(email)
        }
        window.location.href = url
      })
    }

    function continueToPayment() {
      var email =
        (emailEl && emailEl.value || '').trim() || (proof && proof.email) || ''
      if (busy) return

      if (stage === 'verified' && cachedProof) {
        busy = true
        autoPayStarted = true
        primaryBtn.disabled = true
        primaryBtn.textContent = tr('gate.opening')
        setMsg('')
        afterProof(email, cachedProof)
          .catch(function () {
            setMsg('Session expired — send a new code.', true)
            try {
              localStorage.removeItem(CHECKOUT_PROOF_KEY)
            } catch (e) {}
            stage = 'email'
            if (stepEmail) stepEmail.hidden = false
            primaryBtn.textContent = tr('gate.send')
          })
          .finally(function () {
            busy = false
            primaryBtn.disabled = false
            autoPayStarted = false
            if (stage === 'verified') primaryBtn.textContent = tr('gate.continue')
          })
        return
      }

      var code = (codeEl && codeEl.value || '').trim()
      if (!email || code.length < 6) {
        setMsg(tr('gate.pasteCode'), true)
        return
      }
      busy = true
      autoPayStarted = true
      primaryBtn.disabled = true
      primaryBtn.textContent = tr('gate.opening')
      setMsg('')

      fetch(apiBase + '/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, purpose: 'checkout', code: code })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data }
          })
        })
        .then(function (result) {
          if (!result.ok || !result.data || !result.data.emailProof) {
            setMsg((result.data && result.data.error) || 'Invalid or expired code.', true)
            return null
          }
          saveCheckoutProof(email, result.data.emailProof)
          cachedProof = result.data.emailProof
          return afterProof(email, result.data.emailProof)
        })
        .catch(function () {
          setMsg('Could not open payment. Try again.', true)
        })
        .finally(function () {
          busy = false
          primaryBtn.disabled = false
          primaryBtn.textContent = tr('gate.continue')
          autoPayStarted = false
        })
    }

    function onPrimary() {
      if (stage === 'email') requestCode()
      else continueToPayment()
    }

    primaryBtn.addEventListener('click', onPrimary)
    if (resendBtn) {
      resendBtn.addEventListener('click', function () {
        stage = 'email'
        if (stepEmail) stepEmail.hidden = false
        requestCode()
      })
    }
    if (useOtherBtn) {
      useOtherBtn.addEventListener('click', function () {
        try {
          localStorage.removeItem(CHECKOUT_PROOF_KEY)
        } catch (e) {}
        stage = 'email'
        cachedProof = ''
        if (stepEmail) stepEmail.hidden = false
        if (stepCode) stepCode.hidden = true
        primaryBtn.textContent = tr('gate.send')
        useOtherBtn.hidden = true
        setMsg('')
        if (emailEl) {
          emailEl.value = ''
          emailEl.focus()
        }
      })
    }

    if (emailEl) {
      emailEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault()
          onPrimary()
        }
      })
    }
    if (codeEl) {
      codeEl.addEventListener('input', function () {
        codeEl.value = String(codeEl.value || '')
          .replace(/\D/g, '')
          .slice(0, 6)
        if (codeEl.value.length === 6 && stage === 'code' && !busy && !autoPayStarted) {
          continueToPayment()
        }
      })
      codeEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault()
          continueToPayment()
        }
      })
    }

    if (opts.autoVerify && opts.prefillEmail && opts.prefillCode) {
      stage = 'code'
      if (stepEmail) stepEmail.hidden = true
      if (stepCode) stepCode.hidden = false
      primaryBtn.textContent = tr('gate.continue')
      setMsg(tr('gate.verifying'))
      setTimeout(function () {
        continueToPayment()
      }, 200)
    } else if (skipOtp) {
      setMsg(tr('gate.skipMsg'))
      setTimeout(function () {
        continueToPayment()
      }, 350)
    } else if (emailEl) {
      emailEl.focus()
    }
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

  function bindModEnterLabels() {
    var apple = detectClientOS() === 'mac'
    var label = apple ? '⌘↵' : 'Ctrl+Enter'
    var spoken = apple ? 'Command Enter' : 'Control Enter'
    Array.prototype.forEach.call(document.querySelectorAll('[data-mod-enter]'), function (el) {
      el.textContent = label
      el.setAttribute('title', spoken)
      el.setAttribute('aria-label', spoken)
    })
  }

  function pickAssetUrl(assets, os) {
    var list = (assets || []).filter(function (a) {
      var n = (a && a.name) || ''
      return n && !/\.blockmap$/i.test(n) && !/^latest(-|$)/i.test(n)
    })
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

  /** Do not invent release URLs — only use CONFIG / downloads.json / GitHub API. */
  function versionFallbackUrls() {
    return { mac: '', win: '', linux: '' }
  }

  function mergeDownloadUrls() {
    var sources = Array.prototype.slice.call(arguments)
    var out = { mac: '', win: '', linux: '' }
    ;['mac', 'win', 'linux'].forEach(function (os) {
      for (var i = 0; i < sources.length; i++) {
        var u = sources[i] && sources[i][os]
        if (u) {
          out[os] = u
          break
        }
      }
    })
    return out
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
    var copy = document.getElementById('hero-copy')
    if (copy) copy.removeAttribute('data-dl-open')
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
        'Windows x64 installer (.exe). If SmartScreen appears: More info → Run anyway. Full walkthrough in Docs.',
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
      win: 'Detected Windows · Windows build is publishing…',
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
          go.setAttribute('href', 'docs/#docs-install')
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
      } else {
        blurb.innerHTML =
          'Installer for this OS is still publishing. Switch OS from the menu when another build is ready, or open <a href="docs/">Docs</a>.'
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
          var copy = document.getElementById('hero-copy')
          if (copy && widget.classList.contains('dl--hero')) {
            copy.setAttribute('data-dl-open', 'true')
          }
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
        // Legacy landing bookmark → dedicated docs page
        location.replace('docs/')
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
    var configured = {
      mac: configuredUrl('mac'),
      win: configuredUrl('win'),
      linux: configuredUrl('linux')
    }
    var fallback = versionFallbackUrls()
    var seeded = mergeDownloadUrls(configured, fallback)
    var tagHint = CONFIG.version ? 'v' + String(CONFIG.version).replace(/^v/i, '') : ''
    applyDownloadLinks(seeded, selectedOS, { tag: tagHint })

    var repo = CONFIG.githubRepo || 'haikallfikrii/AI-Meeting-Assistant'

    // Same-origin manifest first (never blocked by GitHub API rate limits).
    fetch('downloads.json?v=' + encodeURIComponent(CONFIG.version || Date.now()), {
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('no manifest')
        return res.json()
      })
      .then(function (data) {
        var fromFile = {
          mac: (data && data.mac) || '',
          win: (data && data.win) || '',
          linux: (data && data.linux) || ''
        }
        var urls = mergeDownloadUrls(fromFile, seeded)
        var tag = (data && (data.tag || data.version)) || tagHint
        if (tag && tag.charAt(0) !== 'v') tag = 'v' + tag
        applyDownloadLinks(urls, selectedOS, { tag: tag })
        seeded = urls
      })
      .catch(function () {
        /* keep seeded */
      })
      .then(function () {
        // Optional refresh from GitHub (often 403 when rate-limited — ignore).
        return fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
          headers: { Accept: 'application/vnd.github+json' }
        })
          .then(function (res) {
            if (!res.ok) throw new Error('no release')
            return res.json()
          })
          .then(function (data) {
            var assets = (data && data.assets) || []
            var fromApi = {
              mac: pickAssetUrl(assets, 'mac'),
              win: pickAssetUrl(assets, 'win'),
              linux: pickAssetUrl(assets, 'linux')
            }
            var urls = mergeDownloadUrls(fromApi, seeded)
            applyDownloadLinks(urls, selectedOS, { tag: data.tag_name || tagHint })
          })
          .catch(function () {
            /* seeded / downloads.json already applied */
          })
      })
  }

  function copyCommands() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-copy-btn]')
      if (!btn) return
      var wrap = btn.closest('[data-copy-cmd]')
      if (!wrap) return
      var code = wrap.querySelector('code')
      var label = btn.querySelector('[data-copy-label]') || btn
      var text = (code && code.textContent) || ''
      if (!text) return

      var done = function () {
        wrap.classList.add('is-flash')
        btn.classList.add('is-copied')
        var prev = label.textContent
        label.textContent = 'Copied'
        window.setTimeout(function () {
          wrap.classList.remove('is-flash')
          btn.classList.remove('is-copied')
          label.textContent = prev || 'Copy'
        }, 1400)
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          fallbackCopy(text, done)
        })
      } else {
        fallbackCopy(text, done)
      }
    })
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      done()
    } catch (_) {}
  }

  var INSTALL_GUIDES = {
    mac: {
      label: 'macOS',
      lead: 'Follow these clicks — no Terminal needed for a normal install.',
      steps: [
        'Find the file in your <strong>Downloads</strong> folder (ends with <strong>.dmg</strong>) and double-click it.',
        'A small window opens. Drag the <strong>Kalfi</strong> icon onto the <strong>Applications</strong> folder icon.',
        'Open <strong>Finder → Applications</strong> and double-click <strong>Kalfi</strong>.',
        'If Mac says the app is damaged or can’t be opened: go to <strong>System Settings → Privacy &amp; Security</strong>, scroll to Security, click <strong>Open Anyway</strong>, then open Kalfi again. (That message is normal for apps Apple has not notarized yet — the download is fine.)',
        'When macOS asks for <strong>microphone</strong> or <strong>system audio</strong> access, click Allow.',
        'In Kalfi Settings: paste your OpenAI/OpenRouter key (BYOK), or log in with the email you used at checkout (Hosted).'
      ],
      advanced: {
        title: 'Still blocked after Open Anyway?',
        help: 'Only then use this optional Terminal fix. Terminal is a built-in Mac app for typing one command — you do not need to know coding.',
        how: [
          'Press <kbd>⌘</kbd> + <kbd>Space</kbd>, type <strong>Terminal</strong>, press Enter.',
          'Click <strong>Copy</strong> below, then in Terminal press <kbd>⌘</kbd> + <kbd>V</kbd> to paste, then press Enter.',
          'Nothing appearing is normal. Go back to Applications and open Kalfi again.'
        ],
        cmd: 'xattr -cr /Applications/Kalfi.app',
        note: 'This only clears a macOS security flag on the app. It does not change your files or password.'
      }
    },
    win: {
      label: 'Windows',
      lead: 'Use the installer like any other Windows app. No command line needed.',
      steps: [
        'Open your <strong>Downloads</strong> folder and double-click the Kalfi <strong>.exe</strong> file.',
        'If Windows shows <strong>“Windows protected your PC”</strong>: click <strong>More info</strong>, then <strong>Run anyway</strong>. This is SmartScreen being cautious with new apps — the file from kalfi.app is fine.',
        'Click through the installer (<strong>Next → Install</strong>) and finish.',
        'Open Kalfi from the Start menu or desktop shortcut.',
        'Allow microphone access when Windows asks.',
        'In Settings: paste your API key (BYOK) or log in with your checkout email (Hosted).'
      ],
      advanced: null
    },
    linux: {
      label: 'Linux',
      lead: 'Prefer the click method first. Terminal is only an alternative if your desktop blocks double-click.',
      steps: [
        'Find the downloaded <strong>.AppImage</strong> in your Downloads folder.',
        'Right-click the file → <strong>Properties</strong> (wording varies) → enable <strong>Allow executing file as program</strong> / “executable”.',
        'Close Properties, then double-click the AppImage to launch Kalfi.',
        'Allow microphone / audio access if your desktop asks.',
        'In Settings: paste your API key (BYOK) or log in with your checkout email (Hosted).'
      ],
      advanced: {
        title: 'Prefer Terminal instead of Properties?',
        help: 'Optional. Open your Terminal app (search “Terminal” in your app menu), then run the two actions below in the folder where the AppImage is.',
        how: [
          'In your file manager, open the Downloads folder (or wherever the AppImage landed).',
          'Right-click empty space → <strong>Open in Terminal</strong> (if available), or open Terminal and type <code>cd ~/Downloads</code> then Enter.',
          'Click <strong>Copy</strong> below, paste into Terminal (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> on many desktops), press Enter.'
        ],
        cmd: 'chmod +x kalfi-*.AppImage && ./kalfi-*.AppImage',
        note: 'chmod makes the file runnable; the second part starts Kalfi. Replace nothing unless your filename differs.'
      }
    }
  }

  function installModal() {
    var modal = document.getElementById('install-modal')
    if (!modal) return

    var stepsEl = modal.querySelector('[data-install-steps]')
    var osLabel = modal.querySelector('[data-install-os-label]')
    var leadEl = modal.querySelector('[data-install-lead]')
    var cmdWrap = modal.querySelector('[data-install-cmd-wrap]')
    var cmdEl = modal.querySelector('[data-install-cmd]')
    var cmdTitle = modal.querySelector('[data-install-cmd-title]')
    var cmdHelp = modal.querySelector('[data-install-cmd-help]')
    var cmdHow = modal.querySelector('[data-install-cmd-how]')
    var cmdNote = modal.querySelector('[data-install-cmd-note]')

    var open = function (os) {
      var guide = INSTALL_GUIDES[os] || INSTALL_GUIDES.mac
      if (osLabel) osLabel.textContent = guide.label
      if (leadEl) leadEl.innerHTML = guide.lead
      if (stepsEl) {
        stepsEl.innerHTML = guide.steps
          .map(function (s) {
            return '<li>' + s + '</li>'
          })
          .join('')
      }
      if (cmdWrap) {
        if (guide.advanced && guide.advanced.cmd) {
          if (cmdTitle) cmdTitle.textContent = guide.advanced.title
          if (cmdHelp) cmdHelp.textContent = guide.advanced.help
          if (cmdHow) {
            cmdHow.innerHTML = (guide.advanced.how || [])
              .map(function (s) {
                return '<li>' + s + '</li>'
              })
              .join('')
          }
          if (cmdEl) cmdEl.textContent = guide.advanced.cmd
          if (cmdNote) cmdNote.textContent = guide.advanced.note || ''
          cmdWrap.hidden = false
        } else {
          cmdWrap.hidden = true
        }
      }
      modal.hidden = false
      document.body.style.overflow = 'hidden'
    }

    var close = function () {
      modal.hidden = true
      document.body.style.overflow = ''
    }

    modal.addEventListener('click', function (e) {
      // Only Got it / Full docs may dismiss — not backdrop or outside click.
      if (e.target.closest('[data-install-close]')) close()
    })

    document.addEventListener('click', function (e) {
      var go = e.target.closest('[data-download-primary]')
      if (!go) return
      if (go.classList.contains('is-disabled')) return
      var href = go.getAttribute('href') || ''
      if (!href || href.charAt(0) === '#' || href.indexOf('docs') === 0) return
      window.setTimeout(function () {
        open(selectedOS || detectClientOS())
      }, 180)
    })
  }

  function faqAccordion() {
    var items = document.querySelectorAll('.faq details')
    if (!items.length) return

    Array.prototype.forEach.call(items, function (details) {
      var summary = details.querySelector('summary')
      var anim = details.querySelector('.faq__anim')
      if (!summary || !anim) return

      // Start open items in open visual state
      if (details.open) {
        details.classList.add('is-open')
        anim.style.gridTemplateRows = '1fr'
      } else {
        details.classList.remove('is-open')
        anim.style.gridTemplateRows = '0fr'
      }

      summary.addEventListener('click', function (e) {
        e.preventDefault()
        var isOpen = details.classList.contains('is-open')

        if (isOpen) {
          // Smooth close
          anim.style.gridTemplateRows = '1fr'
          // force reflow
          void anim.offsetHeight
          details.classList.remove('is-open')
          anim.style.gridTemplateRows = '0fr'
          var onEnd = function (ev) {
            if (ev.propertyName !== 'grid-template-rows') return
            details.open = false
            anim.removeEventListener('transitionend', onEnd)
          }
          anim.addEventListener('transitionend', onEnd)
        } else {
          details.open = true
          details.classList.add('is-open')
          anim.style.gridTemplateRows = '0fr'
          void anim.offsetHeight
          anim.style.gridTemplateRows = '1fr'
        }
      })
    })
  }

  function init() {
    chrome()
    bindModEnterLabels()
    heroMotion()
    timeline()
    reveal()
    stealth()
    brandPreview()
    calculator()
    billing()
    bindDownloadWidgets()
    bindDocsOsTabs()
    downloads()
    copyCommands()
    installModal()
    faqAccordion()
    ensureOrderTrackBanner()
    pollOrderTrackBanner()
    setInterval(pollOrderTrackBanner, 20000)
    handleCheckoutDeepLinks()
    document.addEventListener('kalfi:lang', function () {
      // Refresh billing note + order banner copy after language change
      try {
        var note = document.getElementById('pro-note')
        if (note && window.CONFIG) {
          note.textContent =
            (CONFIG.paymentProvider || 'wise') === 'wise'
              ? tr('checkout.note.wise')
              : tr('checkout.note.polar')
        }
      } catch (e) {}
      ensureOrderTrackBanner()
    })
  }

  function handleCheckoutDeepLinks() {
    function parseHashParams() {
      var raw = (location.hash || '').replace(/^#/, '')
      if (!raw) return {}
      var out = {}
      // support #otp=123&email=a@b.com or #download
      raw.split('&').forEach(function (part) {
        var i = part.indexOf('=')
        if (i < 0) {
          out[part] = true
          return
        }
        out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1))
      })
      return out
    }

    function run() {
      var params = parseHashParams()
      if (!params.otp) return
      var code = String(params.otp || '').replace(/\D/g, '').slice(0, 6)
      var email = String(params.email || '').trim()
      if (!code || code.length < 6 || !email) return

      // Clear sensitive hash from the URL bar
      history.replaceState(null, '', location.pathname + location.search + '#pricing')

      var intent = loadCheckoutIntent() || {}
      var sku =
        intent.sku ||
        planSku(intent.plan || 'hosted', intent.interval || 'monthly') ||
        'hosted_monthly'
      openCheckoutEmailGate({
        plan: intent.plan || 'hosted',
        sku: sku,
        interval: intent.interval || 'monthly',
        fallback: intent.fallback || '',
        embed: Boolean(intent.embed),
        prefillEmail: email,
        prefillCode: code,
        autoVerify: true
      })
    }

    run()
    window.addEventListener('hashchange', function () {
      if ((location.hash || '').indexOf('otp=') !== -1) run()
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
