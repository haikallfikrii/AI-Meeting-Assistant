;(function () {
  var API = String(window.KALFI_PARTNER_API || 'https://api.srv835792.hstgr.cloud').replace(
    /\/$/,
    ''
  )
  var TOKEN_KEY = 'kalfi_partner_token'

  var loginView = document.getElementById('login-view')
  var appView = document.getElementById('app-view')
  var form = document.getElementById('login-form')
  var emailEl = document.getElementById('partner-email')
  var codeEl = document.getElementById('partner-code')
  var codeStep = document.getElementById('code-step')
  var loginBtn = document.getElementById('login-btn')
  var resendBtn = document.getElementById('resend-btn')
  var loginMsg = document.getElementById('login-msg')

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    stage: 'email'
  }

  function api(path, opts) {
    opts = opts || {}
    var headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
    if (opts.auth && state.token) headers.Authorization = 'Bearer ' + state.token
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    })
      .then(function (res) {
        return res.text().then(function (raw) {
          var data = {}
          try {
            data = raw ? JSON.parse(raw) : {}
          } catch (e) {
            data = { error: 'Bad response' }
          }
          return { ok: res.ok, status: res.status, data: data }
        })
      })
      .catch(function (err) {
        return { ok: false, status: 0, data: { error: (err && err.message) || 'Network error' } }
      })
  }

  function setMsg(text, ok) {
    if (!loginMsg) return
    if (!text) {
      loginMsg.hidden = true
      return
    }
    loginMsg.hidden = false
    loginMsg.textContent = text
    loginMsg.className = 'banner ' + (ok ? 'banner--ok' : 'banner--error')
  }

  function fmtDate(ms) {
    if (!ms) return '—'
    try {
      return new Date(ms).toLocaleString()
    } catch (e) {
      return String(ms)
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function showLogin() {
    loginView.hidden = false
    appView.hidden = true
  }

  function showApp() {
    loginView.hidden = true
    appView.hidden = false
  }

  function renderDash(data) {
    var aff = data.affiliate || {}
    var stats = data.stats || {}
    var conversions = data.conversions || []

    document.getElementById('partner-name').textContent = aff.name || 'Partner'
    document.getElementById('partner-meta').textContent =
      (aff.code || '') +
      ' · ' +
      (aff.commissionPercent != null ? aff.commissionPercent + '% commission' : '') +
      (aff.country ? ' · ' + aff.country : '')

    document.getElementById('stats-cards').innerHTML =
      '<div class="card"><strong>' +
      (stats.sales || 0) +
      '</strong><span>Sales</span></div>' +
      '<div class="card"><strong>$' +
      (stats.paidUsd || 0) +
      '</strong><span>Customer paid</span></div>' +
      '<div class="card"><strong>$' +
      (stats.commissionOwedUsd || 0) +
      '</strong><span>Commission owed</span></div>' +
      '<div class="card"><strong>$' +
      (stats.commissionPaidUsd || 0) +
      '</strong><span>Commission paid</span></div>'

    var link = aff.link || 'https://kalfi.app/?ref=' + encodeURIComponent(aff.code || '') + '#pricing'
    document.getElementById('share-link').textContent = link
    document.getElementById('code-chip').innerHTML =
      'Voucher code: <strong>' + escapeHtml(aff.code || '') + '</strong> · ' +
      (aff.discountPercent || 0) +
      '% off for customers'

    var meta = document.getElementById('sales-meta')
    var body = document.getElementById('sales-body')
    meta.textContent =
      conversions.length === 0
        ? 'No sales yet — share your link to get started.'
        : conversions.length + ' recent conversion' + (conversions.length === 1 ? '' : 's')

    body.innerHTML = conversions.length
      ? conversions
          .map(function (c) {
            var status =
              c.commissionStatus === 'paid'
                ? 'Paid'
                : c.commissionStatus === 'owed'
                  ? 'Owed'
                  : c.commissionStatus || '—'
            return (
              '<tr><td>' +
              fmtDate(c.createdAt) +
              '</td><td>' +
              escapeHtml(c.customer) +
              '</td><td>' +
              escapeHtml(String(c.plan || '').replace(/_/g, ' ')) +
              '</td><td>$' +
              c.paidUsd +
              '</td><td>$' +
              c.commissionUsd +
              '</td><td>' +
              escapeHtml(status) +
              '</td></tr>'
            )
          })
          .join('')
      : '<tr><td colspan="6" class="muted" style="padding:20px;text-align:center">No conversions yet.</td></tr>'
  }

  function loadMe() {
    return api('/v1/affiliates/partner/me', { auth: true }).then(function (res) {
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY)
        state.token = ''
        showLogin()
        if (res.status === 401) setMsg('Session expired — request a new code.', false)
        else setMsg((res.data && res.data.error) || 'Could not load dashboard', false)
        return false
      }
      if (res.data.paused) {
        showApp()
        document.getElementById('partner-name').textContent =
          (res.data.affiliate && res.data.affiliate.name) || 'Partner'
        document.getElementById('partner-meta').textContent = 'Paused'
        document.getElementById('stats-cards').innerHTML = ''
        document.getElementById('sales-meta').textContent =
          res.data.message || 'Your partner code is paused.'
        document.getElementById('sales-body').innerHTML = ''
        document.getElementById('share-link').textContent = ''
        return true
      }
      showApp()
      renderDash(res.data)
      return true
    })
  }

  function requestCode() {
    var email = (emailEl.value || '').trim()
    if (!email) {
      setMsg('Enter your partner email.', false)
      return
    }
    loginBtn.disabled = true
    loginBtn.textContent = 'Sending…'
    setMsg('')
    api('/v1/affiliates/partner/otp/request', {
      method: 'POST',
      body: { email: email }
    })
      .then(function (res) {
        if (!res.ok) {
          setMsg((res.data && res.data.error) || 'Could not send code.', false)
          return
        }
        state.stage = 'code'
        codeStep.hidden = false
        resendBtn.hidden = false
        loginBtn.textContent = 'Verify & open dashboard'
        setMsg((res.data && res.data.message) || 'Check your inbox for the code.', true)
        if (res.data && res.data.devCode && codeEl) {
          codeEl.value = res.data.devCode
          setMsg('Test mode: code filled in.', true)
        }
        if (codeEl) codeEl.focus()
      })
      .finally(function () {
        loginBtn.disabled = false
        if (state.stage === 'email') loginBtn.textContent = 'Send code'
        else loginBtn.textContent = 'Verify & open dashboard'
      })
  }

  function verifyCode() {
    var email = (emailEl.value || '').trim()
    var code = (codeEl.value || '').replace(/\D/g, '').slice(0, 6)
    if (!code || code.length < 6) {
      setMsg('Enter the 6-digit code from your email.', false)
      return
    }
    loginBtn.disabled = true
    loginBtn.textContent = 'Verifying…'
    api('/v1/affiliates/partner/otp/verify', {
      method: 'POST',
      body: { email: email, code: code }
    })
      .then(function (res) {
        if (!res.ok) {
          setMsg((res.data && res.data.error) || 'Invalid code.', false)
          return
        }
        state.token = res.data.token
        localStorage.setItem(TOKEN_KEY, state.token)
        showApp()
        renderDash(res.data)
      })
      .finally(function () {
        loginBtn.disabled = false
        loginBtn.textContent = 'Verify & open dashboard'
      })
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault()
    if (state.stage === 'code') verifyCode()
    else requestCode()
  })

  resendBtn.addEventListener('click', function () {
    state.stage = 'email'
    requestCode()
  })

  document.getElementById('btn-logout').addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY)
    state.token = ''
    state.stage = 'email'
    codeStep.hidden = true
    resendBtn.hidden = true
    loginBtn.textContent = 'Send code'
    showLogin()
  })

  document.getElementById('btn-refresh').addEventListener('click', function () {
    loadMe()
  })

  document.getElementById('btn-copy-link').addEventListener('click', function () {
    var link = document.getElementById('share-link').textContent
    var btn = document.getElementById('btn-copy-link')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
    }
    btn.textContent = 'Copied'
    setTimeout(function () {
      btn.textContent = 'Copy'
    }, 1200)
  })

  // Deep link from email: ?otp=123456&email=a@b.com
  try {
    var params = new URLSearchParams(window.location.search)
    var deepOtp = (params.get('otp') || '').replace(/\D/g, '').slice(0, 6)
    var deepEmail = (params.get('email') || '').trim()
    if (deepEmail) emailEl.value = deepEmail
    if (deepOtp && deepEmail) {
      codeStep.hidden = false
      resendBtn.hidden = false
      state.stage = 'code'
      codeEl.value = deepOtp
      loginBtn.textContent = 'Verify & open dashboard'
      history.replaceState(null, '', location.pathname)
      verifyCode()
      return
    }
  } catch (e) {}

  if (state.token) {
    loadMe()
  } else {
    showLogin()
  }
})()
