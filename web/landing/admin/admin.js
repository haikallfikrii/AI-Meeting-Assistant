;(function () {
  var API =
    (window.KALFI_ADMIN_API || 'https://api.srv835792.hstgr.cloud').replace(/\/$/, '')
  var SECRET_KEY = 'kalfi_admin_secret'

  var loginView = document.getElementById('login-view')
  var appView = document.getElementById('app-view')
  var loginForm = document.getElementById('login-form')
  var loginError = document.getElementById('login-error')
  var secretInput = document.getElementById('admin-secret')
  var pageTitle = document.getElementById('page-title')
  var drawer = document.getElementById('drawer')
  var drawerBody = document.getElementById('drawer-body')
  var drawerTitle = document.getElementById('drawer-title')

  var state = {
    secret: sessionStorage.getItem(SECRET_KEY) || '',
    users: [],
    selected: null
  }

  function api(path, opts) {
    opts = opts || {}
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Admin-Secret': state.secret
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, status: res.status, data: data || {} }
      })
    })
  }

  function fmtDate(ms) {
    if (!ms) return '—'
    try {
      return new Date(ms).toLocaleString()
    } catch (e) {
      return String(ms)
    }
  }

  function showLogin(err) {
    loginView.hidden = false
    appView.hidden = true
    if (err) {
      loginError.hidden = false
      loginError.textContent = err
    } else {
      loginError.hidden = true
    }
  }

  function showApp() {
    loginView.hidden = true
    appView.hidden = false
    switchTab('overview')
  }

  function unlock() {
    return api('/v1/admin/ping').then(function (res) {
      if (!res.ok) {
        sessionStorage.removeItem(SECRET_KEY)
        state.secret = ''
        showLogin((res.data && res.data.error) || 'Invalid admin secret')
        return false
      }
      sessionStorage.setItem(SECRET_KEY, state.secret)
      showApp()
      return true
    })
  }

  function switchTab(name) {
    ;['overview', 'users', 'leads', 'payments', 'create', 'analytics'].forEach(function (tab) {
      var panel = document.getElementById('tab-' + tab)
      if (panel) panel.hidden = tab !== name
    })
    Array.prototype.forEach.call(document.querySelectorAll('.nav__btn'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === name)
    })
    var titles = {
      overview: 'Overview',
      users: 'Users',
      leads: 'Checkout leads',
      payments: 'Wise payments',
      create: 'Add user',
      analytics: 'Sales & activity'
    }
    pageTitle.textContent = titles[name] || name
    if (name === 'overview') loadOverview()
    if (name === 'users') loadUsers()
    if (name === 'leads') loadLeads()
    if (name === 'payments') loadPayments()
    if (name === 'analytics') loadAnalytics()
  }

  function renderBars(targetId, map) {
    var el = document.getElementById(targetId)
    var entries = Object.keys(map || {}).map(function (k) {
      return [k, map[k]]
    })
    entries.sort(function (a, b) {
      return b[1] - a[1]
    })
    var max = entries.reduce(function (m, row) {
      return Math.max(m, row[1])
    }, 1)
    if (!entries.length) {
      el.innerHTML = '<p class="muted">No data yet.</p>'
      return
    }
    el.innerHTML = entries
      .map(function (row) {
        var pct = Math.round((row[1] / max) * 100)
        return (
          '<div class="bar-row"><span>' +
          row[0] +
          '</span><div class="bar-track"><div class="bar-fill" style="width:' +
          pct +
          '%"></div></div><strong>' +
          row[1] +
          '</strong></div>'
        )
      })
      .join('')
  }

  function loadOverview() {
    api('/v1/admin/overview').then(function (res) {
      if (!res.ok) return
      var o = res.data.overview || {}
      var cards = document.getElementById('overview-cards')
      cards.innerHTML = [
        ['Users', o.totalUsers],
        ['Paid active', o.paidActive],
        ['Suspended', o.suspended],
        ['Lemon linked', o.lemonLinked],
        ['New (7d)', o.newThisWeek],
        ['Need password', o.needsPassword]
      ]
        .map(function (row) {
          return (
            '<div class="stat"><span>' +
            row[0] +
            '</span><strong>' +
            (row[1] || 0) +
            '</strong></div>'
          )
        })
        .join('')
      renderBars('plan-bars', o.byPlan)
      renderBars('status-bars', o.byStatus)
    })
  }

  function loadUsers() {
    var q = document.getElementById('user-q').value.trim()
    var plan = document.getElementById('user-plan').value
    var status = document.getElementById('user-status').value
    var qs =
      '/v1/admin/users?limit=100&q=' +
      encodeURIComponent(q) +
      '&plan=' +
      encodeURIComponent(plan) +
      '&status=' +
      encodeURIComponent(status)
    api(qs).then(function (res) {
      if (!res.ok) {
        document.getElementById('users-meta').textContent =
          (res.data && res.data.error) || 'Failed to load users'
        return
      }
      state.users = res.data.users || []
      document.getElementById('users-meta').textContent =
        state.users.length + ' shown · ' + (res.data.total || 0) + ' total'
      var body = document.getElementById('users-body')
      body.innerHTML = state.users
        .map(function (u) {
          var bad = u.suspended || u.subStatus === 'suspended'
          return (
            '<tr>' +
            '<td>' +
            escapeHtml(u.email) +
            '</td>' +
            '<td>' +
            escapeHtml(u.plan) +
            '</td>' +
            '<td><span class="pill ' +
            (bad ? 'pill--bad' : u.subStatus === 'active' ? 'pill--ok' : '') +
            '">' +
            escapeHtml(u.subStatus) +
            '</span></td>' +
            '<td>' +
            fmtDate(u.updatedAt) +
            '</td>' +
            '<td><button type="button" class="btn" data-open="' +
            escapeHtml(u.id) +
            '">Manage</button></td>' +
            '</tr>'
          )
        })
        .join('')
    })
  }

  function loadLeads() {
    var q = document.getElementById('lead-q').value.trim()
    var status = document.getElementById('lead-status').value
    var qs =
      '/v1/admin/leads?limit=100&q=' +
      encodeURIComponent(q) +
      '&status=' +
      encodeURIComponent(status)
    api(qs).then(function (res) {
      if (!res.ok) {
        document.getElementById('leads-meta').textContent =
          (res.data && res.data.error) || 'Failed to load leads'
        return
      }
      var summary = res.data.summary || {}
      document.getElementById('leads-cards').innerHTML = [
        ['Emails submitted', summary.otp_sent || 0],
        ['Verified OTP', summary.otp_verified || 0],
        ['Opened checkout', summary.checkout_opened || 0],
        ['Returned from pay', summary.payment_returned || 0],
        ['Subscribed', summary.subscribed || 0]
      ]
        .map(function (row) {
          return (
            '<div class="stat"><span>' +
            row[0] +
            '</span><strong>' +
            row[1] +
            '</strong></div>'
          )
        })
        .join('')
      var leads = res.data.leads || []
      document.getElementById('leads-meta').textContent =
        leads.length + ' shown · ' + (res.data.total || 0) + ' total'
      document.getElementById('leads-body').innerHTML = leads
        .map(function (l) {
          var ok = l.status === 'subscribed'
          return (
            '<tr><td>' +
            escapeHtml(l.email) +
            '</td><td><span class="pill ' +
            (ok ? 'pill--ok' : '') +
            '">' +
            escapeHtml(l.status) +
            '</span></td><td>' +
            escapeHtml(l.plan || l.sku || '—') +
            '</td><td>' +
            fmtDate(l.updatedAt) +
            '</td></tr>'
          )
        })
        .join('')
    })
  }

  function loadPayments() {
    var status = document.getElementById('pay-status').value || 'reported_paid'
    api('/v1/admin/manual-orders?limit=100&status=' + encodeURIComponent(status)).then(function (
      res
    ) {
      if (!res.ok) {
        document.getElementById('payments-meta').textContent =
          (res.data && res.data.error) || 'Failed to load payments'
        return
      }
      var orders = res.data.orders || []
      document.getElementById('payments-meta').textContent = orders.length + ' orders'
      document.getElementById('payments-body').innerHTML = orders
        .map(function (o) {
          var canAct = o.status === 'reported_paid' || o.status === 'awaiting_payment'
          return (
            '<tr><td><code>' +
            escapeHtml(o.ref) +
            '</code></td><td>' +
            escapeHtml(o.email) +
            '</td><td>' +
            escapeHtml(o.plan) +
            '</td><td>$' +
            o.amountUsd +
            '</td><td><span class="pill">' +
            escapeHtml(o.status) +
            '</span></td><td>' +
            fmtDate(o.updatedAt) +
            '</td><td>' +
            (canAct
              ? '<button type="button" class="btn btn--primary btn--sm" data-activate="' +
                escapeHtml(o.id) +
                '">Activate</button>'
              : '—') +
            '</td></tr>'
          )
        })
        .join('')
    })
  }

  function loadAnalytics() {
    api('/v1/admin/analytics').then(function (res) {
      if (!res.ok) return
      var sales = res.data.sales || {}
      var o = res.data.overview || {}
      var leadSummary = (res.data.leads && res.data.leads.summary) || {}
      document.getElementById('sales-cards').innerHTML = [
        ['Lemon events (30d)', sales.lemonEvents30d],
        ['Checkout OTPs (30d)', sales.checkoutOtps30d],
        ['Leads submitted', leadSummary.otp_sent || 0],
        ['Leads subscribed', leadSummary.subscribed || 0],
        ['Paid active', o.paidActive],
        ['Total users', o.totalUsers]
      ]
        .map(function (row) {
          return (
            '<div class="stat"><span>' +
            row[0] +
            '</span><strong>' +
            (row[1] || 0) +
            '</strong></div>'
          )
        })
        .join('')
      var events = res.data.events || []
      document.getElementById('events-body').innerHTML = events
        .map(function (e) {
          return (
            '<tr><td>' +
            fmtDate(e.at) +
            '</td><td>' +
            escapeHtml(e.type) +
            '</td><td>' +
            escapeHtml(e.email || '—') +
            '</td><td>' +
            escapeHtml(JSON.stringify(e.meta || {})) +
            '</td></tr>'
          )
        })
        .join('')
    })
  }

  function openUser(id) {
    api('/v1/admin/users/' + encodeURIComponent(id)).then(function (res) {
      if (!res.ok) return
      var u = res.data.user
      state.selected = u
      drawer.hidden = false
      drawerTitle.textContent = u.email
      drawerBody.innerHTML =
        '<div class="kv"><span>User ID</span><code>' +
        escapeHtml(u.id) +
        '</code></div>' +
        '<div class="kv"><span>Plan</span><strong>' +
        escapeHtml(u.plan) +
        '</strong></div>' +
        '<div class="kv"><span>Status</span><strong>' +
        escapeHtml(u.subStatus) +
        (u.suspended ? ' · suspended' : '') +
        '</strong></div>' +
        '<div class="kv"><span>Created</span>' +
        fmtDate(u.createdAt) +
        '</div>' +
        '<div class="kv"><span>Updated</span>' +
        fmtDate(u.updatedAt) +
        '</div>' +
        '<div class="kv"><span>Lemon customer</span>' +
        escapeHtml(u.lemonCustomerId || '—') +
        '</div>' +
        '<div class="kv"><span>Lemon subscription</span>' +
        escapeHtml(u.lemonSubscriptionId || '—') +
        '</div>' +
        '<div class="kv"><span>Lemon order</span>' +
        escapeHtml(u.lemonOrderId || '—') +
        '</div>' +
        '<div class="kv"><span>Usage</span>' +
        (u.tokensUsed || 0) +
        ' tokens · ' +
        escapeHtml(u.usageMonth || '—') +
        '</div>' +
        '<label>Change plan<select id="edit-plan">' +
        planOptions(u.plan) +
        '</select></label>' +
        '<label>Change status<select id="edit-status">' +
        statusOptions(u.subStatus) +
        '</select></label>' +
        '<label>Admin note<input id="edit-note" value="' +
        escapeAttr(u.adminNote || '') +
        '" /></label>' +
        '<label>Set new password<input id="edit-password" type="text" minlength="8" placeholder="Optional" /></label>' +
        '<div class="drawer__actions">' +
        '<button type="button" class="btn btn--primary" id="btn-save-user">Save changes</button>' +
        (u.suspended
          ? '<button type="button" class="btn btn--ok" id="btn-unsuspend">Unsuspend</button>'
          : '<button type="button" class="btn btn--danger" id="btn-suspend">Suspend</button>') +
        '<button type="button" class="btn btn--danger" id="btn-delete-user">Delete</button>' +
        '</div>' +
        '<p id="drawer-msg" class="banner" hidden></p>'
    })
  }

  function planOptions(selected) {
    return [
      'free',
      'byok_monthly',
      'byok_annual',
      'hosted_monthly',
      'hosted_annual',
      'team',
      'single_session'
    ]
      .map(function (p) {
        return (
          '<option value="' +
          p +
          '"' +
          (p === selected ? ' selected' : '') +
          '>' +
          p +
          '</option>'
        )
      })
      .join('')
  }

  function statusOptions(selected) {
    return ['none', 'active', 'past_due', 'canceled', 'expired', 'suspended']
      .map(function (s) {
        return (
          '<option value="' +
          s +
          '"' +
          (s === selected ? ' selected' : '') +
          '>' +
          s +
          '</option>'
        )
      })
      .join('')
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;')
  }

  function setDrawerMsg(text, ok) {
    var el = document.getElementById('drawer-msg')
    if (!el) return
    el.hidden = !text
    el.textContent = text || ''
    el.className = 'banner ' + (ok ? 'banner--ok' : 'banner--error')
  }

  loginForm.addEventListener('submit', function (ev) {
    ev.preventDefault()
    state.secret = secretInput.value.trim()
    unlock().catch(function () {
      showLogin('Cannot reach API. Check network / CORS.')
    })
  })

  document.getElementById('btn-logout').addEventListener('click', function () {
    sessionStorage.removeItem(SECRET_KEY)
    state.secret = ''
    showLogin()
  })

  document.getElementById('btn-refresh').addEventListener('click', function () {
    var active = document.querySelector('.nav__btn.is-active')
    if (active) switchTab(active.getAttribute('data-tab'))
  })

  document.querySelectorAll('.nav__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.getAttribute('data-tab'))
    })
  })

  document.getElementById('btn-search-users').addEventListener('click', loadUsers)
  document.getElementById('user-q').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') loadUsers()
  })
  document.getElementById('btn-search-leads').addEventListener('click', loadLeads)
  document.getElementById('btn-search-payments').addEventListener('click', loadPayments)
  document.getElementById('payments-body').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-activate]')
    if (!btn) return
    var id = btn.getAttribute('data-activate')
    btn.disabled = true
    btn.textContent = '…'
    api('/v1/admin/manual-orders/' + encodeURIComponent(id) + '/activate', {
      method: 'POST',
      body: {}
    }).then(function (res) {
      if (!res.ok) {
        btn.disabled = false
        btn.textContent = 'Activate'
        alert((res.data && res.data.error) || 'Activate failed')
        return
      }
      loadPayments()
      loadUsers()
    })
  })
  document.getElementById('lead-q').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') loadLeads()
  })

  document.getElementById('users-body').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-open]')
    if (btn) openUser(btn.getAttribute('data-open'))
  })

  document.getElementById('drawer-close').addEventListener('click', function () {
    drawer.hidden = true
  })
  drawer.addEventListener('click', function (ev) {
    if (ev.target === drawer) drawer.hidden = true
  })

  drawerBody.addEventListener('click', function (ev) {
    if (!state.selected) return
    var id = state.selected.id
    if (ev.target.id === 'btn-save-user') {
      var body = {
        plan: document.getElementById('edit-plan').value,
        subStatus: document.getElementById('edit-status').value,
        adminNote: document.getElementById('edit-note').value
      }
      var pw = document.getElementById('edit-password').value
      if (pw) body.password = pw
      api('/v1/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: body }).then(
        function (res) {
          if (!res.ok) {
            setDrawerMsg((res.data && res.data.error) || 'Save failed', false)
            return
          }
          setDrawerMsg('Saved.', true)
          loadUsers()
          openUser(id)
        }
      )
    }
    if (ev.target.id === 'btn-suspend') {
      api('/v1/admin/users/' + encodeURIComponent(id) + '/suspend', { method: 'POST' }).then(
        function (res) {
          if (!res.ok) {
            setDrawerMsg((res.data && res.data.error) || 'Suspend failed', false)
            return
          }
          loadUsers()
          openUser(id)
        }
      )
    }
    if (ev.target.id === 'btn-unsuspend') {
      api('/v1/admin/users/' + encodeURIComponent(id) + '/unsuspend', { method: 'POST' }).then(
        function (res) {
          if (!res.ok) {
            setDrawerMsg((res.data && res.data.error) || 'Unsuspend failed', false)
            return
          }
          loadUsers()
          openUser(id)
        }
      )
    }
    if (ev.target.id === 'btn-delete-user') {
      if (!confirm('Delete this user permanently?')) return
      api('/v1/admin/users/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (res) {
        if (!res.ok) {
          setDrawerMsg((res.data && res.data.error) || 'Delete failed', false)
          return
        }
        drawer.hidden = true
        loadUsers()
      })
    }
  })

  document.getElementById('create-form').addEventListener('submit', function (ev) {
    ev.preventDefault()
    var msg = document.getElementById('create-msg')
    var body = {
      email: document.getElementById('create-email').value.trim(),
      plan: document.getElementById('create-plan').value,
      subStatus: document.getElementById('create-status').value,
      adminNote: document.getElementById('create-note').value
    }
    var pw = document.getElementById('create-password').value
    if (pw) body.password = pw
    api('/v1/admin/users', { method: 'POST', body: body }).then(function (res) {
      msg.hidden = false
      if (!res.ok) {
        msg.className = 'banner banner--error'
        msg.textContent = (res.data && res.data.error) || 'Create failed'
        return
      }
      msg.className = 'banner banner--ok'
      msg.textContent =
        'Created ' +
        res.data.user.email +
        (res.data.tempPassword ? ' · temp password: ' + res.data.tempPassword : '')
      document.getElementById('create-form').reset()
    })
  })

  if (state.secret) {
    unlock().catch(function () {
      showLogin('Cannot reach API.')
    })
  } else {
    showLogin()
  }
})()
