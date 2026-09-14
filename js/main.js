(() => {
  const year = document.getElementById('year')
  if (year) year.textContent = String(new Date().getFullYear())

  const cfg = window.KALFI_CONFIG || { apiBaseUrl: '', stripePriceId: '' }
  const subscribeBtn = document.getElementById('subscribe-btn')

  async function startCheckout() {
    if (!subscribeBtn) return

    if (!cfg.apiBaseUrl || !cfg.stripePriceId) {
      subscribeBtn.textContent = 'Pro checkout — connect API first'
      subscribeBtn.disabled = true
      alert(
        'Backend belum live.\n\n1) Deploy apps/api ke VPS\n2) Isi stripePriceId di js config\n3) Set apiBaseUrl ke https://api.domain-anda.com'
      )
      return
    }

    subscribeBtn.disabled = true
    subscribeBtn.textContent = 'Redirecting…'

    try {
      const res = await fetch(`${cfg.apiBaseUrl.replace(/\/$/, '')}/v1/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: cfg.stripePriceId,
          successUrl: `${window.location.origin}/?checkout=success`,
          cancelUrl: `${window.location.origin}/#pricing`
        })
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed')
      }
      window.location.href = data.url
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Checkout failed')
      subscribeBtn.disabled = false
      subscribeBtn.textContent = 'Subscribe with Stripe'
    }
  }

  subscribeBtn?.addEventListener('click', startCheckout)
  document.getElementById('nav-subscribe')?.addEventListener('click', (e) => {
    if (cfg.apiBaseUrl && cfg.stripePriceId) {
      e.preventDefault()
      startCheckout()
    }
  })

  const params = new URLSearchParams(window.location.search)
  if (params.get('checkout') === 'success') {
    alert('Payment started / completed. Open the Kalfi desktop app and sign in to unlock Pro.')
  }
})()
