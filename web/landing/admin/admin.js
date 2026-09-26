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
    })
      .then(function (res) {
        return res.text().then(function (raw) {
          var data = {}
          try {
            data = raw ? JSON.parse(raw) : {}
          } catch (e) {
            data = { error: 'Bad JSON from API', raw: raw.slice(0, 120) }
          }
          return { ok: res.ok, status: res.status, data: data }
        })
      })
      .catch(function (err) {
        return {
          ok: false,
          status: 0,
          data: { error: (err && err.message) || 'Network error' }
        }
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
    ;['overview', 'users', 'leads', 'payments', 'affiliates', 'create', 'analytics'].forEach(
      function (tab) {
        var panel = document.getElementById('tab-' + tab)
        if (panel) panel.hidden = tab !== name
      }
    )
    Array.prototype.forEach.call(document.querySelectorAll('.nav__btn'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === name)
    })
    var titles = {
      overview: 'Overview',
      users: 'Users',
      leads: 'Checkout leads',
      payments: 'Wise payments',
      affiliates: 'Affiliates & vouchers',
      create: 'Add user',
      analytics: 'Sales & activity'
    }
    pageTitle.textContent = titles[name] || name
    if (name === 'overview') loadOverview()
    if (name === 'users') loadUsers()
    if (name === 'leads') loadLeads()
    if (name === 'payments') loadPayments()
    if (name === 'affiliates') loadAffiliates()
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
    loadPendingQueue()
  }

  function activateOrder(id, btn) {
    if (btn) {
      btn.disabled = true
      btn.textContent = '…'
    }
    return api('/v1/admin/manual-orders/' + encodeURIComponent(id) + '/activate', {
      method: 'POST',
      body: {}
    }).then(function (res) {
      if (!res.ok) {
        if (btn) {
          btn.disabled = false
          btn.textContent = 'Activate'
        }
        alert((res.data && res.data.error) || 'Activate failed')
        return false
      }
      loadPendingQueue()
      loadPayments()
      loadUsers()
      return true
    })
  }

  function renderOrderRows(orders, emptyMsg) {
    if (!orders.length) {
      return (
        '<tr><td colspan="7" class="muted" style="padding:18px;text-align:center">' +
        (emptyMsg || 'No orders.') +
        '</td></tr>'
      )
    }
    return orders
      .map(function (o) {
        var canAct = o.status === 'reported_paid' || o.status === 'awaiting_payment'
        var pill =
          o.status === 'reported_paid'
            ? 'pill pill--ok'
            : o.status === 'activated'
              ? 'pill'
              : 'pill'
        return (
          '<tr><td><code>' +
          escapeHtml(o.ref) +
          '</code></td><td>' +
          escapeHtml(o.email) +
          '</td><td>' +
          escapeHtml(o.plan) +
          '</td><td>$' +
          o.amountUsd +
          (o.voucherCode
            ? ' <span class="muted" style="font-size:11px">(' +
              escapeHtml(o.voucherCode) +
              (o.discountUsd ? ' −$' + o.discountUsd : '') +
              ')</span>'
            : '') +
          '</td><td><span class="' +
          pill +
          '">' +
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
  }

  function loadPendingQueue() {
    var box = document.getElementById('pending-payments')
    var meta = document.getElementById('pending-payments-meta')
    var body = document.getElementById('pending-payments-body')
    if (!box || !body) return
    api('/v1/admin/manual-orders?limit=50&status=reported_paid').then(function (res) {
      if (!res.ok) {
        if (meta) meta.textContent = (res.data && res.data.error) || 'Failed to load'
        return
      }
      var orders = res.data.orders || []
      var badge = document.getElementById('nav-pay-badge')
      if (badge) {
        badge.hidden = orders.length === 0
        badge.textContent = String(orders.length)
      }
      box.hidden = false
      if (meta) {
        meta.textContent =
          orders.length === 0
            ? 'No pending Wise payments — you’re clear.'
            : orders.length + ' waiting for activation (check Wise, then Activate).'
      }
      body.innerHTML = renderOrderRows(
        orders,
        'Nothing to activate. New “I’ve paid” notices appear here.'
      )
    })
  }

  function loadPayments() {
    var statusEl = document.getElementById('pay-status')
    var status = (statusEl && statusEl.value) || 'reported_paid'
    var meta = document.getElementById('payments-meta')
    var body = document.getElementById('payments-body')
    if (!body) return
    api('/v1/admin/manual-orders?limit=100&status=' + encodeURIComponent(status)).then(function (
      res
    ) {
      if (!res.ok) {
        if (meta) meta.textContent = (res.data && res.data.error) || 'Failed to load payments'
        return
      }
      var orders = res.data.orders || []
      if (meta) meta.textContent = orders.length + ' orders · filter: ' + status
      body.innerHTML = renderOrderRows(
        orders,
        status === 'reported_paid'
          ? 'No reported_paid orders. Try filter “All” — or check Overview queue.'
          : 'No orders for this filter.'
      )
    })
  }

  function loadAffiliates() {
    var statsEl = document.getElementById('aff-stats')
    var body = document.getElementById('aff-body')
    var convBody = document.getElementById('aff-conv-body')
    var listMeta = document.getElementById('aff-list-meta')
    var convMeta = document.getElementById('aff-conv-meta')
    api('/v1/admin/affiliates').then(function (res) {
      if (!res.ok) {
        if (listMeta) listMeta.textContent = (res.data && res.data.error) || 'Failed'
        return
      }
      var stats = res.data.stats || {}
      if (statsEl) {
        statsEl.innerHTML =
          '<div class="card"><strong>' +
          (stats.activeAffiliates || 0) +
          '</strong><span>Active partners</span></div>' +
          '<div class="card"><strong>' +
          (stats.conversions || 0) +
          '</strong><span>Conversions</span></div>' +
          '<div class="card"><strong>$' +
          (stats.commissionOwedUsd || 0) +
          '</strong><span>Commission owed</span></div>' +
          '<div class="card"><strong>$' +
          (stats.commissionPaidUsd || 0) +
          '</strong><span>Commission paid</span></div>'
      }
      var affiliates = res.data.affiliates || []
      if (listMeta) listMeta.textContent = affiliates.length + ' partners · vouchers auto-sync with code'
      if (body) {
        body.innerHTML = affiliates
          .map(function (a) {
            return (
              '<tr><td><code>' +
              escapeHtml(a.code) +
              '</code></td><td>' +
              escapeHtml(a.name) +
              '<br><span class="muted" style="font-size:11px">' +
              escapeHtml(a.email) +
              ' · ' +
              escapeHtml(a.country || '') +
              '</span></td><td>' +
              a.discountPercent +
              '%</td><td>' +
              a.commissionPercent +
              '%</td><td>' +
              escapeHtml(a.status) +
              '</td><td><button type="button" class="btn btn--sm" data-aff-edit="' +
              escapeAttr(a.code) +
              '">Edit</button> ' +
              '<button type="button" class="btn btn--sm" data-aff-copy="' +
              escapeAttr('https://kalfi.app/?ref=' + a.code + '#pricing') +
              '">Copy link</button></td></tr>'
            )
          })
          .join('')
      }
      var conversions = res.data.conversions || []
      if (convMeta) convMeta.textContent = conversions.length + ' recent'
      if (convBody) {
        convBody.innerHTML = conversions.length
          ? conversions
              .map(function (c) {
                return (
                  '<tr><td>' +
                  fmtDate(c.createdAt) +
                  '</td><td><code>' +
                  escapeHtml(c.voucherCode) +
                  '</code></td><td>' +
                  escapeHtml(c.customerEmail) +
                  '</td><td>$' +
                  c.paidUsd +
                  '</td><td>$' +
                  c.commissionUsd +
                  '</td><td>' +
                  escapeHtml(c.commissionStatus) +
                  '</td><td>' +
                  (c.commissionStatus === 'owed'
                    ? '<button type="button" class="btn btn--primary btn--sm" data-aff-paid="' +
                      escapeHtml(c.id) +
                      '">Mark paid</button>'
                    : '—') +
                  '</td></tr>'
                )
              })
              .join('')
          : '<tr><td colspan="7" class="muted" style="padding:18px;text-align:center">No conversions yet.</td></tr>'
      }
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

  function loadAnalytics() {
    api('/v1/admin/analytics').then(function (res) {
      if (!res.ok) return
      var sales = res.data.sales || {}
      var o = res.data.overview || {}
      var leadSummary = (res.data.leads && res.data.leads.summary) || {}
      document.getElementById('sales-cards').innerHTML = [
        ['Lemon events (30d)', sales.lemonEvents30d],
        ['Checkout OTPs (30d)', sales.checkoutOtps30d],
        ['Wise reported (pending)', leadSummary.reported_paid || 0],
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
          var meta = e.meta || {}
          var act =
            e.type === 'manual_order_reported' && meta.orderId
              ? ' <button type="button" class="btn btn--primary btn--sm" data-activate="' +
                escapeHtml(meta.orderId) +
                '">Activate</button>'
              : ''
          return (
            '<tr><td>' +
            fmtDate(e.at) +
            '</td><td>' +
            escapeHtml(e.type) +
            act +
            '</td><td>' +
            escapeHtml(e.email || '—') +
            '</td><td>' +
            escapeHtml(JSON.stringify(meta)) +
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
  document.getElementById('pay-status').addEventListener('change', loadPayments)

  var affForm = document.getElementById('aff-form')
  if (affForm) {
    affForm.addEventListener('submit', function (ev) {
      ev.preventDefault()
      var msg = document.getElementById('aff-form-msg')
      api('/v1/admin/affiliates', {
        method: 'POST',
        body: {
          name: document.getElementById('aff-name').value.trim(),
          email: document.getElementById('aff-email').value.trim(),
          country: document.getElementById('aff-country').value.trim() || 'GLOBAL',
          code: document.getElementById('aff-code').value.trim().toUpperCase(),
          discountPercent: Number(document.getElementById('aff-discount').value || 15),
          commissionPercent: Number(document.getElementById('aff-commission').value || 20),
          status: document.getElementById('aff-status').value,
          payoutNote: document.getElementById('aff-note').value.trim() || undefined
        }
      }).then(function (res) {
        if (msg) {
          msg.hidden = false
          msg.className = 'banner ' + (res.ok ? 'banner--ok' : 'banner--error')
          msg.textContent = res.ok
            ? 'Saved ' + res.data.affiliate.code + ' — link: https://kalfi.app/?ref=' + res.data.affiliate.code + '#pricing'
            : (res.data && res.data.error) || 'Save failed'
        }
        if (res.ok) loadAffiliates()
      })
    })
  }

  var affBody = document.getElementById('aff-body')
  if (affBody) {
    affBody.addEventListener('click', function (ev) {
      var copyBtn = ev.target.closest('[data-aff-copy]')
      if (copyBtn) {
        var link = copyBtn.getAttribute('data-aff-copy')
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link)
        }
        copyBtn.textContent = 'Copied'
        setTimeout(function () {
          copyBtn.textContent = 'Copy link'
        }, 1200)
        return
      }
      var editBtn = ev.target.closest('[data-aff-edit]')
      if (!editBtn) return
      var code = editBtn.getAttribute('data-aff-edit')
      api('/v1/admin/affiliates').then(function (res) {
        if (!res.ok) return
        var aff = (res.data.affiliates || []).find(function (a) {
          return a.code === code
        })
        if (!aff) return
        document.getElementById('aff-name').value = aff.name
        document.getElementById('aff-email').value = aff.email
        document.getElementById('aff-country').value = aff.country || ''
        document.getElementById('aff-code').value = aff.code
        document.getElementById('aff-discount').value = aff.discountPercent
        document.getElementById('aff-commission').value = aff.commissionPercent
        document.getElementById('aff-status').value = aff.status
        document.getElementById('aff-note').value = aff.payoutNote || ''
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    })
  }

  var affConvBody = document.getElementById('aff-conv-body')
  if (affConvBody) {
    affConvBody.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-aff-paid]')
      if (!btn) return
      btn.disabled = true
      api('/v1/admin/affiliates/conversions/' + encodeURIComponent(btn.getAttribute('data-aff-paid')) + '/paid', {
        method: 'POST',
        body: {}
      }).then(function (res) {
        if (!res.ok) {
          btn.disabled = false
          alert((res.data && res.data.error) || 'Failed')
          return
        }
        loadAffiliates()
      })
    })
  }

  function onActivateClick(ev) {
    var btn = ev.target.closest('[data-activate]')
    if (!btn) return
    activateOrder(btn.getAttribute('data-activate'), btn)
  }
  document.getElementById('payments-body').addEventListener('click', onActivateClick)
  var pendingBody = document.getElementById('pending-payments-body')
  if (pendingBody) pendingBody.addEventListener('click', onActivateClick)
  var eventsBody = document.getElementById('events-body')
  if (eventsBody) eventsBody.addEventListener('click', onActivateClick)

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
