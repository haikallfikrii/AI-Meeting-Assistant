/* Kalfi landing — live session simulator.
   Mirrors the real app: mode picks the prompt, length trims the answer,
   tone rewrites the opening line. */

(function () {
  'use strict'

  var ANSWERS = {
    ratelimit: {
      core: {
        formal:
          'I would start with a token bucket per API key, enforced at the edge with a shared Redis counter.',
        neutral: 'I would put a token bucket on each API key at the edge, with Redis holding the counters.',
        casual: 'Token bucket per API key at the edge, Redis keeping the counts.'
      },
      points: [
        'Key the bucket on the API key, not the IP — mobile networks and proxies share addresses.',
        'Answer with 429 plus Retry-After so clients back off instead of retrying in a tight loop.',
        'Keep a small in-process fallback so a Redis blip degrades the limit instead of breaking traffic.'
      ],
      extra: [
        'Use a sliding window log only where billing needs exact counts; approximate counters are cheaper.',
        'Split read and write quotas so a batch import cannot starve the dashboard.'
      ]
    },
    burst: {
      core: {
        formal:
          'The burst should be absorbed by the bucket depth, and anything beyond it queued or shed per tenant.',
        neutral: 'Bucket depth absorbs the spike, then extra requests get shed per tenant, not globally.',
        casual: 'Depth soaks the spike, then I shed the extra for that tenant only.'
      },
      points: [
        'Isolate per tenant so one customer cannot spend another customer capacity.',
        'Allow a short burst allowance — real traffic is spiky and hard limits break integrations.',
        'Alert on sustained 429s so support reaches out before the customer opens a ticket.'
      ],
      extra: [
        'Offer a paid burst tier if the pattern is legitimate; it turns an incident into revenue.',
        'Log the top offenders per minute so capacity planning has real numbers.'
      ]
    },
    checkout: {
      core: {
        formal:
          'Checkout can ship before the thirtieth if scope stays card payment plus receipt email.',
        neutral: 'We can hit the thirtieth if scope stays card plus receipt email.',
        casual: 'The thirtieth works if we keep it to card plus receipt email.'
      },
      points: [
        'Card flow and receipt are code complete; what is left is webhook retries and QA.',
        'Wallet payments and saved cards move to the release right after the campaign.',
        'Next step is a shared test plan with your QA this week so nothing lands late.'
      ],
      extra: [
        'We need the production Stripe keys by Thursday to test against live webhooks.',
        'If the campaign date moves earlier, the receipt email is the first thing I would cut.'
      ]
    },
    payrisk: {
      core: {
        formal:
          'The main risk is a webhook arriving late, which leaves an order paid but unconfirmed.',
        neutral: 'The real risk is a late webhook — order paid, but not confirmed on our side.',
        casual: 'Biggest risk is a slow webhook: money taken, order not confirmed.'
      },
      points: [
        'We reconcile every payment intent on a schedule, so nothing depends on one callback.',
        'Failed charges keep the cart intact and retry, instead of dropping the customer.',
        'Support gets a single screen showing payment state next to order state.'
      ],
      extra: [
        'We will run a dry run against Stripe test webhooks with forced delays before launch.',
        'Refund path is manual in v1 — worth flagging to your finance team now.'
      ]
    },
    pricing: {
      core: {
        formal:
          'The BYOK plan is fourteen dollars a month with your own API key; hosted AI is nineteen dollars a month.',
        neutral: 'BYOK is fourteen a month with your key. Hosted AI is nineteen flat.',
        casual: 'Fourteen with your own key, nineteen if we host the models.'
      },
      points: [
        'On BYOK you still pay your provider for tokens — usually a few dollars on top.',
        'Hosted is for people who do not want to touch an API dashboard.',
        'Team is forty-nine for three Hosted seats on one invoice.'
      ],
      extra: [
        'Cancel any plan in the Stripe portal; the desktop app stays on your machine.',
        'Final Round lists around one hundred fifty a month for the same category of help.'
      ]
    },
    byok: {
      core: {
        formal: 'Yes — paste your OpenAI or OpenRouter key once and it stays encrypted on this device.',
        neutral: 'Yes, paste your OpenAI or OpenRouter key once and it stays on your device.',
        casual: 'Yep, drop your OpenAI or OpenRouter key in settings and it never leaves your Mac.'
      },
      points: [
        'Stored with macOS safeStorage, so it is not sitting in a plain text config.',
        'Custom base URL works too if you run a gateway or a proxy.',
        'Switch models whenever you like — cheap one for chat, better one for interviews.'
      ],
      extra: [
        'Usage shows up on your provider dashboard, so there is no billing surprise from us.',
        'Nothing about the key is transmitted to our servers on the free path.'
      ]
    }
  }

  var SCRIPTS = {
    interview: {
      source: 'system + mic',
      model: 'gpt-4o-mini',
      beats: [
        {
          who: 'Interviewer',
          text: 'Walk me through how you would design a rate limiter for our public API.',
          answer: 'ratelimit'
        },
        { who: 'You', text: 'Sure — is this a single region or global today?' },
        {
          who: 'Interviewer',
          text: 'Global. And what happens when one customer suddenly sends ten times their usual traffic?',
          answer: 'burst'
        }
      ]
    },
    client: {
      source: 'system audio',
      model: 'claude-3.5-haiku',
      beats: [
        {
          who: 'Rina',
          text: 'Where are we on checkout? Can it ship before the campaign on the thirtieth?',
          answer: 'checkout'
        },
        { who: 'You', text: 'Let me pull the current scope up.' },
        {
          who: 'Rina',
          text: 'And what is the risk if a payment fails halfway through?',
          answer: 'payrisk'
        }
      ]
    },
    chat: {
      source: 'microphone',
      model: 'gemini-2.0-flash',
      beats: [
        {
          who: 'David',
          text: 'So what does this thing cost? I am not paying a hundred and fifty a month.',
          answer: 'pricing'
        },
        {
          who: 'David',
          text: 'Can I just keep using my own OpenAI key?',
          answer: 'byok'
        }
      ]
    }
  }

  var els = {}
  var state = {
    mode: 'interview',
    length: 'balanced',
    tone: 'neutral',
    playing: true,
    beat: 0,
    lastAnswer: null,
    run: null
  }

  function token() {
    return { dead: false, timers: [] }
  }

  function kill(t) {
    if (!t) return
    t.dead = true
    t.timers.forEach(clearTimeout)
    t.timers.length = 0
  }

  function wait(ms, t) {
    return new Promise(function (resolve) {
      if (t.dead) return resolve()
      t.timers.push(setTimeout(resolve, ms))
    })
  }

  function pausedGate(t) {
    return new Promise(function (resolve) {
      var tick = function () {
        if (t.dead || state.playing) return resolve()
        t.timers.push(setTimeout(tick, 120))
      }
      tick()
    })
  }

  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function typeText(el, text, cps, t) {
    if (reduced) {
      el.textContent = text
      return Promise.resolve()
    }
    return new Promise(function (resolve) {
      var i = 0
      var frame = 40
      var chunk = Math.max(1, Math.round((cps * frame) / 1000))
      var step = function () {
        if (t.dead) return resolve()
        if (!state.playing) {
          t.timers.push(setTimeout(step, 140))
          return
        }
        i += chunk
        el.textContent = text.slice(0, i)
        if (i >= text.length) {
          el.textContent = text
          return resolve()
        }
        t.timers.push(setTimeout(step, frame))
      }
      step()
    })
  }

  function status(text) {
    if (els.status) els.status.textContent = text
  }

  function addLine(beat, t) {
    var row = document.createElement('div')
    row.className = 'line'
    row.setAttribute('data-who', beat.who)
    if (beat.answer) row.setAttribute('data-q', 'true')

    var who = document.createElement('span')
    who.className = 'line__who'
    who.textContent = beat.who

    var text = document.createElement('span')
    text.className = 'line__text'

    row.appendChild(who)
    row.appendChild(text)
    els.transcript.appendChild(row)

    while (els.transcript.children.length > 4) {
      els.transcript.removeChild(els.transcript.firstChild)
    }

    return typeText(text, beat.text, 90, t)
  }

  function pointsFor(answer) {
    if (state.length === 'brief') return []
    if (state.length === 'balanced') return answer.points.slice(0, 2)
    return answer.points.concat(answer.extra)
  }

  function speakSeconds(answer) {
    var words = (answer.core[state.tone] + ' ' + pointsFor(answer).join(' ')).split(/\s+/).length
    return Math.max(3, Math.round(words / 2.4))
  }

  function renderAnswer(key, animate, t) {
    var answer = ANSWERS[key]
    if (!answer) return Promise.resolve()
    state.lastAnswer = key

    els.answer.setAttribute('data-done', 'false')
    els.answer.textContent = ''

    var core = document.createElement('p')
    core.className = 'answer__core'
    els.answer.appendChild(core)

    var points = pointsFor(answer)
    var list = null
    if (points.length) {
      list = document.createElement('ul')
      list.className = 'answer__points'
      els.answer.appendChild(list)
    }

    var meta = document.createElement('div')
    meta.className = 'answer__meta'
    meta.textContent =
      state.mode + ' · ' + state.length + ' · ' + state.tone + ' · ~' + speakSeconds(answer) + 's to say'

    var finish = function () {
      points.forEach(function (p) {
        var li = document.createElement('li')
        li.textContent = p
        list.appendChild(li)
      })
      els.answer.appendChild(meta)
      els.answer.setAttribute('data-done', 'true')
    }

    if (!animate) {
      core.textContent = answer.core[state.tone]
      finish()
      return Promise.resolve()
    }

    status('drafting')
    return typeText(core, answer.core[state.tone], 62, t).then(function () {
      if (t.dead) return
      finish()
      status('listening')
    })
  }

  function loop() {
    var t = token()
    state.run = t

    var script = SCRIPTS[state.mode]
    els.source.textContent = script.source
    els.model.textContent = script.model

    var step = function () {
      if (t.dead) return
      if (state.beat >= script.beats.length) {
        state.beat = 0
        status('session idle')
        return wait(2600, t).then(function () {
          if (t.dead) return
          els.transcript.textContent = ''
          step()
        })
      }

      var beat = script.beats[state.beat]
      state.beat += 1

      return pausedGate(t)
        .then(function () {
          if (t.dead) return
          status('transcribing')
          return addLine(beat, t)
        })
        .then(function () {
          if (t.dead) return
          if (!beat.answer) {
            status('listening')
            return wait(900, t)
          }
          status('question detected')
          return wait(520, t).then(function () {
            return renderAnswer(beat.answer, true, t)
          })
        })
        .then(function () {
          if (t.dead) return
          return wait(beat.answer ? 3200 : 700, t)
        })
        .then(function () {
          if (t.dead) return
          step()
        })
    }

    step()
  }

  function restart() {
    kill(state.run)
    state.beat = 0
    state.lastAnswer = null
    els.transcript.textContent = ''
    els.answer.setAttribute('data-done', 'true')
    els.answer.innerHTML = '<p class="answer__empty">Loading session context…</p>'
    loop()
  }

  function askNow() {
    var script = SCRIPTS[state.mode]
    var key = null
    for (var i = 0; i < script.beats.length; i++) {
      if (script.beats[i].answer) {
        key = script.beats[i].answer
        if (i >= state.beat - 1) break
      }
    }
    if (!key) return

    kill(state.run)
    var t = token()
    state.run = t
    state.playing = true
    els.toggle.textContent = 'Pause'
    renderAnswer(key, true, t).then(function () {
      if (t.dead) return
      loop()
    })
  }

  function segment(root, onPick) {
    if (!root) return
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-val]')
      if (!btn) return
      Array.prototype.forEach.call(root.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b === btn))
      })
      onPick(btn.getAttribute('data-val'))
    })
  }

  function init() {
    els.transcript = document.getElementById('transcript')
    els.answer = document.getElementById('answer')
    els.status = document.getElementById('demo-status')
    els.source = document.getElementById('demo-source')
    els.model = document.getElementById('demo-model')
    els.toggle = document.getElementById('demo-toggle')
    if (!els.transcript || !els.answer || !els.toggle) return

    var tabs = document.querySelectorAll('[role="tab"][data-mode]')
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (t2) {
          t2.setAttribute('aria-selected', String(t2 === tab))
        })
        state.mode = tab.getAttribute('data-mode')
        restart()
      })
    })

    segment(document.getElementById('seg-length'), function (val) {
      state.length = val
      if (state.lastAnswer) renderAnswer(state.lastAnswer, false, state.run || token())
    })

    segment(document.getElementById('seg-tone'), function (val) {
      state.tone = val
      if (state.lastAnswer) renderAnswer(state.lastAnswer, false, state.run || token())
    })

    els.toggle.addEventListener('click', function () {
      state.playing = !state.playing
      els.toggle.textContent = state.playing ? 'Pause' : 'Play'
      status(state.playing ? 'listening' : 'paused')
    })

    var ask = document.getElementById('demo-ask')
    if (ask) ask.addEventListener('click', askNow)

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        askNow()
        var panel = document.getElementById('demo')
        if (panel) panel.scrollIntoView({ block: 'center' })
      }
    })

    Array.prototype.forEach.call(document.querySelectorAll('[data-demo-focus]'), function (btn) {
      btn.addEventListener('click', function () {
        restart()
        askNow()
      })
    })

    // Only start the reel once it is actually on screen.
    if ('IntersectionObserver' in window) {
      var started = false
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !started) {
              started = true
              loop()
              io.disconnect()
            }
          })
        },
        { threshold: 0.25 }
      )
      io.observe(els.transcript)
    } else {
      loop()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
