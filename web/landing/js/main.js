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

  function init() {
    chrome()
    heroMotion()
    reveal()
    stealth()
    brandPreview()
    calculator()
    billing()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
