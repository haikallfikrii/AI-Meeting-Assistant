/**
 * Kalfi landing i18n — en + id (+ es, pt, vi for other growth markets).
 * Usage: data-i18n="key" | data-i18n-html="key" | data-i18n-aria="key"
 *        window.KalfiI18n.t('key') from main.js
 */
;(function (global) {
  var STORAGE_KEY = 'kalfi_lang'
  var SUPPORTED = ['en', 'id', 'es', 'pt', 'vi']
  var LABELS = {
    en: 'English',
    id: 'Bahasa Indonesia',
    es: 'Español',
    pt: 'Português',
    vi: 'Tiếng Việt'
  }

  /** @type {Record<string, Record<string, string>>} */
  var STRINGS = {
    en: {
      'meta.title':
        'Kalfi — live answers in interviews and client calls, on your own API key',
      'meta.description':
        'Kalfi is a desktop overlay that listens to your call, catches the question, and writes a line you can say out loud. BYOK $14/mo or Hosted AI $19/mo — vs ~$150 tools.',
      'skip': 'Skip to content',
      'nav.product': 'Product',
      'nav.pricing': 'Pricing',
      'nav.resources': 'Resources',
      'nav.demo': 'Live demo',
      'nav.demo.sub': 'Watch the overlay catch a question',
      'nav.flow': 'How it works',
      'nav.flow.sub': 'The session loop from setup to summary',
      'nav.stealth': 'Stealth',
      'nav.stealth.sub': 'Stay off the shared screen',
      'nav.brand': 'Custom brand',
      'nav.brand.sub': 'Your name and logo in the process list',
      'nav.cost': 'Cost model',
      'nav.cost.sub': 'BYOK vs hosted vs ~$150 tools',
      'nav.plans': 'Plans',
      'nav.plans.sub': '$14 BYOK · $19 Hosted · $9 Pass',
      'nav.compare': 'Compare',
      'nav.compare.sub': 'Side-by-side with the usual suspects',
      'nav.docs': 'Docs',
      'nav.docs.sub': 'Install, setup, daily use',
      'nav.faq': 'FAQ',
      'nav.faq.sub': 'Gatekeeper, keys, and rules of the room',
      'nav.blog': 'Blog',
      'nav.blog.sub': 'Comparisons with the prices left in',
      'nav.download': 'Download',
      'nav.pro': 'Get Pro',
      'nav.menu': 'Menu',
      'nav.lang': 'Language',
      'hero.tag': 'Desktop overlay · $14 BYOK',
      'hero.title': 'The answer is on screen before the pause gets awkward.',
      'hero.lead':
        'Kalfi listens to your call from your own computer, catches the question, and writes one line you can actually say out loud. BYOK is $14/mo with your OpenAI or OpenRouter key — or $19 if we host the models. Final Round lists around $150.',
      'hero.dl': 'Download for Mac',
      'hero.demo': 'Run the demo',
      'hero.detecting': 'Detecting your system…',
      'chip.modes': 'Modes',
      'chip.modes.v': 'Interview · Client · Chat',
      'chip.audio': 'Audio in',
      'chip.audio.v': 'System, mic, or both',
      'chip.key': 'Your key',
      'chip.key.v': 'Stays on device',
      'flow.eyebrow': 'Workflow',
      'flow.title': 'One loop. Every call.',
      'flow.lead':
        'From loading context to speaking the line to closing the meeting — the same path, tightened each time you reuse the thread.',
      'flow.1.t': 'Load the context once',
      'flow.2.t': 'Listen the way the call runs',
      'flow.3.t': 'Say one speakable line',
      'flow.4.t': 'Close the meeting properly',
      'stealth.eyebrow': 'Stealth',
      'stealth.title': 'Flip the switch and watch it leave the shared screen.',
      'brand.eyebrow': 'Personal stealth',
      'brand.title': 'Make it look like Notes — not like an AI copilot.',
      'cost.eyebrow': 'Real monthly cost',
      'cost.title': 'Do the maths before you sign a $150 subscription.',
      'pricing.eyebrow': 'Pricing',
      'pricing.title': 'Clear packs. Still a fraction of $150 tools.',
      'pricing.lead':
        'BYOK or Hosted — monthly or annual. Team for 3 seats. Need one call only? Grab a Single Session Pass. Cancel any time.',
      'pricing.paid': 'Payment received.',
      'pricing.paid.help':
        'Open the Kalfi app → Settings → Account. Use the same email from checkout to set your password (first time) or log in. Your plan unlocks automatically.',
      'pricing.dl': 'Download Kalfi',
      'pricing.monthly': 'Monthly',
      'pricing.annual': 'Annual',
      'pricing.save': 'Save up to 29%',
      'aff.codeLabel': 'Partner / voucher code',
      'aff.apply': 'Apply',
      'aff.currencyLabel': 'Show prices in',
      'aff.hint': 'Checkout settles in USD via Wise. Other currencies are estimates for planning.',
      'plan.byok.desc':
        'Full desktop app. You pay OpenAI or OpenRouter directly for usage on top.',
      'plan.byok.cta': 'Start BYOK',
      'plan.hosted.desc':
        'No provider account. We carry chat + transcription with a fair monthly quota.',
      'plan.hosted.cta': 'Subscribe Hosted',
      'plan.team.desc':
        'Three Hosted seats on one invoice — for agencies and interview coaches.',
      'plan.team.cta': 'Start Team',
      'plan.pass.desc':
        'Only need it for one call? No subscription. Access for 2 hours / 1 session — expires in 30 days if unused.',
      'plan.pass.cta': 'Get Session Pass',
      'plan.month': '/ month',
      'plan.yourKey': 'Your key',
      'plan.ourAi': 'Our AI',
      'plan.seats': '3 seats',
      'plan.oneCall': 'One call',
      'plan.billed120': 'Billed $120 / year',
      'plan.billed180': 'Billed $180 / year',
      'compare.eyebrow': 'Landscape',
      'compare.title': 'What the other tabs in your browser are charging.',
      'docs.eyebrow': 'Documentation',
      'docs.title': 'Install, set up, and use it every day.',
      'docs.cta': 'Open docs',
      'faq.eyebrow': 'Questions',
      'faq.title': 'The things people ask before downloading.',
      'dl.eyebrow': 'Get Kalfi',
      'dl.title': 'Install it, paste a key, join your next call.',
      'dl.pro': 'Get Pro instead',
      'dl.releases': 'All releases',
      'dl.docs': 'Docs',
      'foot.tag': 'Kalfi — desktop AI for interviews and meetings.',
      'foot.blog': 'Blog',
      'foot.source': 'Source',
      'foot.contact': 'Contact',
      'checkout.note.wise':
        'Verify your email, pay with Wise (USD), then Claim in the app with the same email — no license key.',
      'checkout.note.polar':
        'Before checkout we verify your email with a one-time code, then open payment with that address locked.',
      'gate.eyebrow': 'Checkout',
      'gate.title': 'Confirm email for payment',
      'gate.title.continue': 'Continue checkout',
      'gate.lead':
        'We lock this inbox to your {plan} checkout — the same email you will use in the Kalfi app.',
      'gate.lead.skip':
        'Email already verified — continuing as {email} (no new code for ~48 hours).',
      'gate.email': 'Email',
      'gate.code': 'Code from email',
      'gate.send': 'Send code',
      'gate.continue': 'Continue to payment',
      'gate.resend': 'Resend code',
      'gate.otherEmail': 'Use a different email',
      'gate.sending': 'Sending code…',
      'gate.opening': 'Opening payment…',
      'gate.checkInbox': 'Check your inbox — tap Verify & continue, or paste the code here.',
      'gate.sentTo': 'Code sent to {email}. Paste it below, or tap Verify & continue in the email.',
      'gate.skipMsg': 'Verified recently — no new code needed for ~48 hours.',
      'gate.verifying': 'Verifying code from your email…',
      'gate.invalidEmail': 'Enter a valid email address.',
      'gate.pasteCode': 'Paste the 6-digit code from your email.',
      'gate.invalidCode': 'Invalid or expired code.',
      'wise.title': 'Pay with Wise',
      'wise.status.pay': 'Status · Awaiting payment',
      'wise.status.review': 'Status · Under review',
      'wise.status.active': 'Status · Active',
      'wise.progress.pay': 'Pay',
      'wise.progress.review': 'Review',
      'wise.progress.active': 'Active',
      'wise.lead': 'Send {amount} USD for {plan}.',
      'wise.ref': 'Payment reference (put in Wise memo):',
      'wise.copy': 'Copy',
      'wise.copied': 'Copied',
      'wise.recipient': 'Wise recipient:',
      'wise.openPay': 'Open Wise payment',
      'wise.markPaid': 'I’ve paid — notify Kalfi',
      'wise.sending': 'Sending…',
      'wise.hint':
        'After you notify us, status becomes Under review here (and by email). Then Claim / Log in in the app with {email}.',
      'wise.review.title': 'Payment under review',
      'wise.review.hint':
        'Queued for activation — usually within a few hours. This page updates automatically.',
      'wise.review.keep':
        'We’ll email {email} when your plan is live. Keep this tab open — status updates here automatically.',
      'wise.checking': 'Checking status…',
      'wise.active.title': 'You’re in',
      'wise.active.ready': 'Plan activated for {email}. No license key.',
      'wise.active.lead':
        'Open Kalfi → Settings → Claim / Log in with that email (set a password first time), then Sync plan.',
      'wise.download': 'Download Kalfi',
      'status.awaiting': 'Awaiting payment',
      'status.awaiting.hint': 'Send Wise with your reference, then tap I’ve paid.',
      'status.review': 'Under review',
      'status.review.hint':
        'Queued for activation — usually within a few hours. This page updates automatically.',
      'status.active': 'Active',
      'status.active.hint': 'Plan is live. Claim / Log in in the app with the same email.',
      'track.view': 'View status',
      'track.order': 'Order {ref}'
    },

    id: {
      'meta.title':
        'Kalfi — jawaban langsung di interview & meeting klien, dengan API key milikmu',
      'meta.description':
        'Kalfi adalah overlay desktop yang mendengarkan panggilanmu, menangkap pertanyaan, dan menulis jawaban yang bisa kamu ucapkan. BYOK $14/bln atau Hosted $19/bln — jauh di bawah tools ~$150.',
      'skip': 'Lewati ke konten',
      'nav.product': 'Produk',
      'nav.pricing': 'Harga',
      'nav.resources': 'Sumber daya',
      'nav.demo': 'Demo langsung',
      'nav.demo.sub': 'Lihat overlay menangkap pertanyaan',
      'nav.flow': 'Cara kerja',
      'nav.flow.sub': 'Alur sesi dari setup sampai ringkasan',
      'nav.stealth': 'Stealth',
      'nav.stealth.sub': 'Tidak muncul di layar yang dibagikan',
      'nav.brand': 'Brand kustom',
      'nav.brand.sub': 'Nama & logo kamu di daftar proses',
      'nav.cost': 'Model biaya',
      'nav.cost.sub': 'BYOK vs hosted vs tools ~$150',
      'nav.plans': 'Paket',
      'nav.plans.sub': '$14 BYOK · $19 Hosted · $9 Pass',
      'nav.compare': 'Bandingkan',
      'nav.compare.sub': 'Sampingan dengan kompetitor',
      'nav.docs': 'Docs',
      'nav.docs.sub': 'Install, setup, pemakaian harian',
      'nav.faq': 'FAQ',
      'nav.faq.sub': 'Gatekeeper, key, dan aturan ruang',
      'nav.blog': 'Blog',
      'nav.blog.sub': 'Perbandingan dengan harga yang jujur',
      'nav.download': 'Unduh',
      'nav.pro': 'Ambil Pro',
      'nav.menu': 'Menu',
      'nav.lang': 'Bahasa',
      'hero.tag': 'Overlay desktop · $14 BYOK',
      'hero.title': 'Jawabannya sudah di layar sebelum jeda jadi canggung.',
      'hero.lead':
        'Kalfi mendengarkan panggilan dari komputermu, menangkap pertanyaan, dan menulis satu baris yang bisa kamu ucapkan. BYOK $14/bln dengan key OpenAI atau OpenRouter — atau $19 jika kami yang host modelnya. Final Round sekitar $150.',
      'hero.dl': 'Unduh untuk Mac',
      'hero.demo': 'Jalankan demo',
      'hero.detecting': 'Mendeteksi sistem…',
      'chip.modes': 'Mode',
      'chip.modes.v': 'Interview · Klien · Chat',
      'chip.audio': 'Audio masuk',
      'chip.audio.v': 'Sistem, mic, atau keduanya',
      'chip.key': 'Key kamu',
      'chip.key.v': 'Tetap di perangkat',
      'flow.eyebrow': 'Alur kerja',
      'flow.title': 'Satu loop. Setiap panggilan.',
      'flow.lead':
        'Dari memuat konteks, mengucapkan jawaban, sampai menutup meeting — jalur yang sama, semakin rapi tiap kali thread dipakai ulang.',
      'flow.1.t': 'Muat konteks sekali',
      'flow.2.t': 'Dengar sesuai jalannya panggilan',
      'flow.3.t': 'Ucapkan satu baris yang natural',
      'flow.4.t': 'Tutup meeting dengan rapi',
      'stealth.eyebrow': 'Stealth',
      'stealth.title': 'Nyalakan switch dan lihat overlay hilang dari shared screen.',
      'brand.eyebrow': 'Stealth personal',
      'brand.title': 'Tampil seperti Notes — bukan copilot AI.',
      'cost.eyebrow': 'Biaya bulanan nyata',
      'cost.title': 'Hitung dulu sebelum langganan $150.',
      'pricing.eyebrow': 'Harga',
      'pricing.title': 'Paket jelas. Masih jauh di bawah tools $150.',
      'pricing.lead':
        'BYOK atau Hosted — bulanan atau tahunan. Team untuk 3 seat. Cuma butuh satu panggilan? Ambil Single Session Pass. Bisa batal kapan saja.',
      'pricing.paid': 'Pembayaran diterima.',
      'pricing.paid.help':
        'Buka app Kalfi → Settings → Account. Pakai email yang sama dari checkout untuk set password (pertama kali) atau login. Paket aktif otomatis.',
      'pricing.dl': 'Unduh Kalfi',
      'pricing.monthly': 'Bulanan',
      'pricing.annual': 'Tahunan',
      'pricing.save': 'Hemat s.d. 29%',
      'aff.codeLabel': 'Kode partner / voucher',
      'aff.apply': 'Pakai',
      'aff.currencyLabel': 'Tampilkan harga dalam',
      'aff.hint': 'Checkout tetap dibayar USD via Wise. Mata uang lain hanya estimasi.',
      'plan.byok.desc':
        'App desktop penuh. Usage model dibayar langsung ke OpenAI atau OpenRouter.',
      'plan.byok.cta': 'Mulai BYOK',
      'plan.hosted.desc':
        'Tanpa akun provider. Chat + transkripsi kami sediakan dengan kuota bulanan yang adil.',
      'plan.hosted.cta': 'Langganan Hosted',
      'plan.team.desc':
        'Tiga seat Hosted dalam satu invoice — untuk agency dan coach interview.',
      'plan.team.cta': 'Mulai Team',
      'plan.pass.desc':
        'Cuma butuh satu panggilan? Tanpa langganan. Akses 2 jam / 1 sesi — hangus 30 hari jika tidak dipakai.',
      'plan.pass.cta': 'Ambil Session Pass',
      'plan.month': '/ bulan',
      'plan.yourKey': 'Key kamu',
      'plan.ourAi': 'AI kami',
      'plan.seats': '3 seat',
      'plan.oneCall': 'Satu panggilan',
      'plan.billed120': 'Ditagih $120 / tahun',
      'plan.billed180': 'Ditagih $180 / tahun',
      'compare.eyebrow': 'Lanskap',
      'compare.title': 'Apa yang ditagih tab browser lain.',
      'docs.eyebrow': 'Dokumentasi',
      'docs.title': 'Install, setup, dan pakai setiap hari.',
      'docs.cta': 'Buka docs',
      'faq.eyebrow': 'Pertanyaan',
      'faq.title': 'Yang sering ditanya sebelum mengunduh.',
      'dl.eyebrow': 'Dapatkan Kalfi',
      'dl.title': 'Install, tempel key, masuk panggilan berikutnya.',
      'dl.pro': 'Ambil Pro saja',
      'dl.releases': 'Semua rilis',
      'dl.docs': 'Docs',
      'foot.tag': 'Kalfi — AI desktop untuk interview dan meeting.',
      'foot.blog': 'Blog',
      'foot.source': 'Source',
      'foot.contact': 'Kontak',
      'checkout.note.wise':
        'Verifikasi email, bayar via Wise (USD), lalu Claim di app dengan email yang sama — tanpa license key.',
      'checkout.note.polar':
        'Sebelum checkout kami verifikasi email dengan kode sekali pakai, lalu buka pembayaran dengan alamat itu terkunci.',
      'gate.eyebrow': 'Checkout',
      'gate.title': 'Konfirmasi email untuk pembayaran',
      'gate.title.continue': 'Lanjut checkout',
      'gate.lead':
        'Kami kunci inbox ini ke checkout {plan} — email yang sama yang akan kamu pakai di app Kalfi.',
      'gate.lead.skip':
        'Email sudah terverifikasi — lanjut sebagai {email} (tanpa kode baru ~48 jam).',
      'gate.email': 'Email',
      'gate.code': 'Kode dari email',
      'gate.send': 'Kirim kode',
      'gate.continue': 'Lanjut ke pembayaran',
      'gate.resend': 'Kirim ulang kode',
      'gate.otherEmail': 'Pakai email lain',
      'gate.sending': 'Mengirim kode…',
      'gate.opening': 'Membuka pembayaran…',
      'gate.checkInbox': 'Cek inbox — ketuk Verify & continue, atau tempel kode di sini.',
      'gate.sentTo': 'Kode dikirim ke {email}. Tempel di bawah, atau ketuk Verify & continue di email.',
      'gate.skipMsg': 'Baru saja terverifikasi — tidak perlu kode baru ~48 jam.',
      'gate.verifying': 'Memverifikasi kode dari email…',
      'gate.invalidEmail': 'Masukkan alamat email yang valid.',
      'gate.pasteCode': 'Tempel kode 6 digit dari email.',
      'gate.invalidCode': 'Kode tidak valid atau sudah kedaluwarsa.',
      'wise.title': 'Bayar dengan Wise',
      'wise.status.pay': 'Status · Menunggu pembayaran',
      'wise.status.review': 'Status · Sedang ditinjau',
      'wise.status.active': 'Status · Aktif',
      'wise.progress.pay': 'Bayar',
      'wise.progress.review': 'Tinjau',
      'wise.progress.active': 'Aktif',
      'wise.lead': 'Kirim {amount} USD untuk {plan}.',
      'wise.ref': 'Referensi pembayaran (isi di memo Wise):',
      'wise.copy': 'Salin',
      'wise.copied': 'Tersalin',
      'wise.recipient': 'Penerima Wise:',
      'wise.openPay': 'Buka pembayaran Wise',
      'wise.markPaid': 'Sudah bayar — beri tahu Kalfi',
      'wise.sending': 'Mengirim…',
      'wise.hint':
        'Setelah kamu memberi tahu kami, status jadi Sedang ditinjau di sini (dan lewat email). Lalu Claim / Login di app dengan {email}.',
      'wise.review.title': 'Pembayaran sedang ditinjau',
      'wise.review.hint':
        'Antri aktivasi — biasanya dalam beberapa jam. Halaman ini update otomatis.',
      'wise.review.keep':
        'Kami akan email {email} saat paket aktif. Biarkan tab ini terbuka — status update otomatis.',
      'wise.checking': 'Memeriksa status…',
      'wise.active.title': 'Kamu sudah masuk',
      'wise.active.ready': 'Paket aktif untuk {email}. Tanpa license key.',
      'wise.active.lead':
        'Buka Kalfi → Settings → Claim / Login dengan email itu (set password pertama kali), lalu Sync plan.',
      'wise.download': 'Unduh Kalfi',
      'status.awaiting': 'Menunggu pembayaran',
      'status.awaiting.hint': 'Kirim Wise dengan referensimu, lalu ketuk Sudah bayar.',
      'status.review': 'Sedang ditinjau',
      'status.review.hint':
        'Antri aktivasi — biasanya dalam beberapa jam. Halaman ini update otomatis.',
      'status.active': 'Aktif',
      'status.active.hint': 'Paket aktif. Claim / Login di app dengan email yang sama.',
      'track.view': 'Lihat status',
      'track.order': 'Order {ref}'
    },

    es: {
      'meta.title':
        'Kalfi — respuestas en vivo en entrevistas y llamadas con clientes, con tu propia API key',
      'meta.description':
        'Kalfi es un overlay de escritorio que escucha tu llamada, captura la pregunta y escribe una línea que puedes decir en voz alta. BYOK $14/mes o Hosted $19/mes.',
      'skip': 'Saltar al contenido',
      'nav.product': 'Producto',
      'nav.pricing': 'Precios',
      'nav.resources': 'Recursos',
      'nav.demo': 'Demo en vivo',
      'nav.demo.sub': 'Mira cómo el overlay captura una pregunta',
      'nav.flow': 'Cómo funciona',
      'nav.flow.sub': 'El ciclo desde setup hasta el resumen',
      'nav.stealth': 'Stealth',
      'nav.stealth.sub': 'Fuera de la pantalla compartida',
      'nav.brand': 'Marca personalizada',
      'nav.brand.sub': 'Tu nombre y logo en la lista de procesos',
      'nav.cost': 'Modelo de coste',
      'nav.cost.sub': 'BYOK vs hosted vs tools ~$150',
      'nav.plans': 'Planes',
      'nav.plans.sub': '$14 BYOK · $19 Hosted · $9 Pass',
      'nav.compare': 'Comparar',
      'nav.compare.sub': 'Cara a cara con la competencia',
      'nav.docs': 'Docs',
      'nav.docs.sub': 'Instalación, setup, uso diario',
      'nav.faq': 'FAQ',
      'nav.faq.sub': 'Gatekeeper, keys y reglas',
      'nav.blog': 'Blog',
      'nav.blog.sub': 'Comparativas con precios claros',
      'nav.download': 'Descargar',
      'nav.pro': 'Obtener Pro',
      'nav.menu': 'Menú',
      'nav.lang': 'Idioma',
      'hero.tag': 'Overlay de escritorio · $14 BYOK',
      'hero.title': 'La respuesta está en pantalla antes de que el silencio incomode.',
      'hero.lead':
        'Kalfi escucha tu llamada desde tu ordenador, captura la pregunta y escribe una línea que puedes decir en voz alta. BYOK $14/mes con tu key de OpenAI u OpenRouter — o $19 si alojamos los modelos. Final Round ronda los $150.',
      'hero.dl': 'Descargar para Mac',
      'hero.demo': 'Ver demo',
      'hero.detecting': 'Detectando tu sistema…',
      'chip.modes': 'Modos',
      'chip.modes.v': 'Entrevista · Cliente · Chat',
      'chip.audio': 'Audio',
      'chip.audio.v': 'Sistema, mic o ambos',
      'chip.key': 'Tu key',
      'chip.key.v': 'Se queda en el dispositivo',
      'flow.eyebrow': 'Flujo',
      'flow.title': 'Un bucle. Cada llamada.',
      'flow.lead':
        'Desde cargar el contexto hasta decir la línea y cerrar la reunión — el mismo camino, más afinado cada vez.',
      'flow.1.t': 'Carga el contexto una vez',
      'flow.2.t': 'Escucha como corre la llamada',
      'flow.3.t': 'Di una línea natural',
      'flow.4.t': 'Cierra la reunión bien',
      'stealth.eyebrow': 'Stealth',
      'stealth.title': 'Activa el switch y míralo salir de la pantalla compartida.',
      'brand.eyebrow': 'Stealth personal',
      'brand.title': 'Que parezca Notes — no un copiloto de IA.',
      'cost.eyebrow': 'Coste mensual real',
      'cost.title': 'Haz las cuentas antes de firmar $150.',
      'pricing.eyebrow': 'Precios',
      'pricing.title': 'Planes claros. Una fracción de las tools de $150.',
      'pricing.lead':
        'BYOK o Hosted — mensual o anual. Team para 3 asientos. ¿Solo una llamada? Single Session Pass. Cancela cuando quieras.',
      'pricing.paid': 'Pago recibido.',
      'pricing.paid.help':
        'Abre la app Kalfi → Settings → Account. Usa el mismo email del checkout para crear contraseña o iniciar sesión. El plan se activa solo.',
      'pricing.dl': 'Descargar Kalfi',
      'pricing.monthly': 'Mensual',
      'pricing.annual': 'Anual',
      'pricing.save': 'Ahorra hasta 29%',
      'aff.codeLabel': 'Código de partner / cupón',
      'aff.apply': 'Aplicar',
      'aff.currencyLabel': 'Mostrar precios en',
      'aff.hint': 'El checkout se paga en USD vía Wise. Otras monedas son estimaciones.',
      'plan.byok.desc':
        'App completa. Pagas el uso del modelo directo a OpenAI u OpenRouter.',
      'plan.byok.cta': 'Empezar BYOK',
      'plan.hosted.desc':
        'Sin cuenta de proveedor. Chat + transcripción con cuota mensual justa.',
      'plan.hosted.cta': 'Suscribir Hosted',
      'plan.team.desc':
        'Tres asientos Hosted en una factura — para agencias y coaches.',
      'plan.team.cta': 'Empezar Team',
      'plan.pass.desc':
        '¿Solo una llamada? Sin suscripción. 2 horas / 1 sesión — caduca en 30 días si no se usa.',
      'plan.pass.cta': 'Obtener Session Pass',
      'plan.month': '/ mes',
      'plan.yourKey': 'Tu key',
      'plan.ourAi': 'Nuestra IA',
      'plan.seats': '3 asientos',
      'plan.oneCall': 'Una llamada',
      'plan.billed120': 'Facturado $120 / año',
      'plan.billed180': 'Facturado $180 / año',
      'compare.eyebrow': 'Mercado',
      'compare.title': 'Lo que cobran las otras pestañas.',
      'docs.eyebrow': 'Documentación',
      'docs.title': 'Instala, configura y úsalo cada día.',
      'docs.cta': 'Abrir docs',
      'faq.eyebrow': 'Preguntas',
      'faq.title': 'Lo que preguntan antes de descargar.',
      'dl.eyebrow': 'Consigue Kalfi',
      'dl.title': 'Instálalo, pega una key, entra a tu próxima llamada.',
      'dl.pro': 'Mejor Pro',
      'dl.releases': 'Todas las versiones',
      'dl.docs': 'Docs',
      'foot.tag': 'Kalfi — IA de escritorio para entrevistas y reuniones.',
      'foot.blog': 'Blog',
      'foot.source': 'Source',
      'foot.contact': 'Contacto',
      'checkout.note.wise':
        'Verifica tu email, paga con Wise (USD) y Claim en la app con el mismo email — sin license key.',
      'checkout.note.polar':
        'Antes del checkout verificamos tu email con un código, luego abrimos el pago con esa dirección.',
      'gate.eyebrow': 'Checkout',
      'gate.title': 'Confirma el email para pagar',
      'gate.title.continue': 'Continuar checkout',
      'gate.lead':
        'Bloqueamos este correo a tu checkout de {plan} — el mismo que usarás en la app Kalfi.',
      'gate.lead.skip':
        'Email ya verificado — continuando como {email} (sin código nuevo ~48 h).',
      'gate.email': 'Email',
      'gate.code': 'Código del email',
      'gate.send': 'Enviar código',
      'gate.continue': 'Continuar al pago',
      'gate.resend': 'Reenviar código',
      'gate.otherEmail': 'Usar otro email',
      'gate.sending': 'Enviando código…',
      'gate.opening': 'Abriendo pago…',
      'gate.checkInbox': 'Revisa tu bandeja — toca Verify & continue o pega el código aquí.',
      'gate.sentTo': 'Código enviado a {email}. Pégalo abajo o toca Verify & continue en el email.',
      'gate.skipMsg': 'Verificado hace poco — no hace falta código nuevo ~48 h.',
      'gate.verifying': 'Verificando el código del email…',
      'gate.invalidEmail': 'Introduce un email válido.',
      'gate.pasteCode': 'Pega el código de 6 dígitos del email.',
      'gate.invalidCode': 'Código inválido o caducado.',
      'wise.title': 'Pagar con Wise',
      'wise.status.pay': 'Estado · Esperando pago',
      'wise.status.review': 'Estado · En revisión',
      'wise.status.active': 'Estado · Activo',
      'wise.progress.pay': 'Pagar',
      'wise.progress.review': 'Revisión',
      'wise.progress.active': 'Activo',
      'wise.lead': 'Envía {amount} USD por {plan}.',
      'wise.ref': 'Referencia de pago (ponla en el memo de Wise):',
      'wise.copy': 'Copiar',
      'wise.copied': 'Copiado',
      'wise.recipient': 'Destinatario Wise:',
      'wise.openPay': 'Abrir pago Wise',
      'wise.markPaid': 'Ya pagué — avisar a Kalfi',
      'wise.sending': 'Enviando…',
      'wise.hint':
        'Tras avisarnos, el estado pasa a En revisión aquí (y por email). Luego Claim / Login en la app con {email}.',
      'wise.review.title': 'Pago en revisión',
      'wise.review.hint':
        'En cola de activación — suele ser en pocas horas. Esta página se actualiza sola.',
      'wise.review.keep':
        'Te escribiremos a {email} cuando el plan esté activo. Mantén esta pestaña abierta.',
      'wise.checking': 'Comprobando estado…',
      'wise.active.title': 'Listo',
      'wise.active.ready': 'Plan activado para {email}. Sin license key.',
      'wise.active.lead':
        'Abre Kalfi → Settings → Claim / Login con ese email (crea contraseña la primera vez), luego Sync plan.',
      'wise.download': 'Descargar Kalfi',
      'status.awaiting': 'Esperando pago',
      'status.awaiting.hint': 'Envía Wise con tu referencia y toca Ya pagué.',
      'status.review': 'En revisión',
      'status.review.hint':
        'En cola de activación — suele ser en pocas horas. Esta página se actualiza sola.',
      'status.active': 'Activo',
      'status.active.hint': 'Plan activo. Claim / Login en la app con el mismo email.',
      'track.view': 'Ver estado',
      'track.order': 'Pedido {ref}'
    },

    pt: {
      'meta.title':
        'Kalfi — respostas ao vivo em entrevistas e calls com clientes, com sua própria API key',
      'meta.description':
        'Kalfi é um overlay de desktop que ouve sua chamada, captura a pergunta e escreve uma linha que você pode falar. BYOK $14/mês ou Hosted $19/mês.',
      'skip': 'Pular para o conteúdo',
      'nav.product': 'Produto',
      'nav.pricing': 'Preços',
      'nav.resources': 'Recursos',
      'nav.demo': 'Demo ao vivo',
      'nav.demo.sub': 'Veja o overlay capturar uma pergunta',
      'nav.flow': 'Como funciona',
      'nav.flow.sub': 'O ciclo da sessão até o resumo',
      'nav.stealth': 'Stealth',
      'nav.stealth.sub': 'Fora da tela compartilhada',
      'nav.brand': 'Marca personalizada',
      'nav.brand.sub': 'Seu nome e logo na lista de processos',
      'nav.cost': 'Modelo de custo',
      'nav.cost.sub': 'BYOK vs hosted vs tools ~$150',
      'nav.plans': 'Planos',
      'nav.plans.sub': '$14 BYOK · $19 Hosted · $9 Pass',
      'nav.compare': 'Comparar',
      'nav.compare.sub': 'Lado a lado com a concorrência',
      'nav.docs': 'Docs',
      'nav.docs.sub': 'Instalação, setup, uso diário',
      'nav.faq': 'FAQ',
      'nav.faq.sub': 'Gatekeeper, keys e regras',
      'nav.blog': 'Blog',
      'nav.blog.sub': 'Comparações com preços claros',
      'nav.download': 'Baixar',
      'nav.pro': 'Assinar Pro',
      'nav.menu': 'Menu',
      'nav.lang': 'Idioma',
      'hero.tag': 'Overlay de desktop · $14 BYOK',
      'hero.title': 'A resposta está na tela antes do silêncio ficar estranho.',
      'hero.lead':
        'Kalfi ouve sua chamada no seu computador, captura a pergunta e escreve uma linha que você pode falar em voz alta. BYOK $14/mês com sua key OpenAI ou OpenRouter — ou $19 se hospedarmos os modelos. Final Round fica perto de $150.',
      'hero.dl': 'Baixar para Mac',
      'hero.demo': 'Rodar demo',
      'hero.detecting': 'Detectando seu sistema…',
      'chip.modes': 'Modos',
      'chip.modes.v': 'Entrevista · Cliente · Chat',
      'chip.audio': 'Áudio',
      'chip.audio.v': 'Sistema, mic ou ambos',
      'chip.key': 'Sua key',
      'chip.key.v': 'Fica no dispositivo',
      'flow.eyebrow': 'Fluxo',
      'flow.title': 'Um loop. Toda chamada.',
      'flow.lead':
        'Do contexto à fala e ao fechamento da reunião — o mesmo caminho, mais afiado a cada thread.',
      'flow.1.t': 'Carregue o contexto uma vez',
      'flow.2.t': 'Ouça como a chamada roda',
      'flow.3.t': 'Fale uma linha natural',
      'flow.4.t': 'Feche a reunião direito',
      'stealth.eyebrow': 'Stealth',
      'stealth.title': 'Ligue o switch e veja sumir da tela compartilhada.',
      'brand.eyebrow': 'Stealth pessoal',
      'brand.title': 'Pareça o Notes — não um copiloto de IA.',
      'cost.eyebrow': 'Custo mensal real',
      'cost.title': 'Faça as contas antes de assinar $150.',
      'pricing.eyebrow': 'Preços',
      'pricing.title': 'Pacotes claros. Ainda uma fração das tools de $150.',
      'pricing.lead':
        'BYOK ou Hosted — mensal ou anual. Team para 3 seats. Só uma call? Single Session Pass. Cancele quando quiser.',
      'pricing.paid': 'Pagamento recebido.',
      'pricing.paid.help':
        'Abra o app Kalfi → Settings → Account. Use o mesmo email do checkout para criar senha ou entrar. O plano ativa sozinho.',
      'pricing.dl': 'Baixar Kalfi',
      'pricing.monthly': 'Mensal',
      'pricing.annual': 'Anual',
      'pricing.save': 'Economize até 29%',
      'aff.codeLabel': 'Código de parceiro / cupom',
      'aff.apply': 'Aplicar',
      'aff.currencyLabel': 'Mostrar preços em',
      'aff.hint': 'O checkout é pago em USD via Wise. Outras moedas são estimativas.',
      'plan.byok.desc':
        'App completo. Você paga o uso do modelo direto à OpenAI ou OpenRouter.',
      'plan.byok.cta': 'Começar BYOK',
      'plan.hosted.desc':
        'Sem conta de provedor. Chat + transcrição com cota mensal justa.',
      'plan.hosted.cta': 'Assinar Hosted',
      'plan.team.desc':
        'Três seats Hosted numa fatura — para agências e coaches.',
      'plan.team.cta': 'Começar Team',
      'plan.pass.desc':
        'Só uma call? Sem assinatura. 2 horas / 1 sessão — expira em 30 dias se não usar.',
      'plan.pass.cta': 'Pegar Session Pass',
      'plan.month': '/ mês',
      'plan.yourKey': 'Sua key',
      'plan.ourAi': 'Nossa IA',
      'plan.seats': '3 seats',
      'plan.oneCall': 'Uma call',
      'plan.billed120': 'Cobrado $120 / ano',
      'plan.billed180': 'Cobrado $180 / ano',
      'compare.eyebrow': 'Mercado',
      'compare.title': 'O que as outras abas estão cobrando.',
      'docs.eyebrow': 'Documentação',
      'docs.title': 'Instale, configure e use todo dia.',
      'docs.cta': 'Abrir docs',
      'faq.eyebrow': 'Perguntas',
      'faq.title': 'O que perguntam antes de baixar.',
      'dl.eyebrow': 'Pegue o Kalfi',
      'dl.title': 'Instale, cole uma key, entre na próxima call.',
      'dl.pro': 'Melhor Pro',
      'dl.releases': 'Todos os releases',
      'dl.docs': 'Docs',
      'foot.tag': 'Kalfi — IA de desktop para entrevistas e reuniões.',
      'foot.blog': 'Blog',
      'foot.source': 'Source',
      'foot.contact': 'Contato',
      'checkout.note.wise':
        'Verifique o email, pague com Wise (USD) e faça Claim no app com o mesmo email — sem license key.',
      'checkout.note.polar':
        'Antes do checkout verificamos seu email com um código, depois abrimos o pagamento com esse endereço.',
      'gate.eyebrow': 'Checkout',
      'gate.title': 'Confirme o email para pagar',
      'gate.title.continue': 'Continuar checkout',
      'gate.lead':
        'Travamos esta caixa no checkout de {plan} — o mesmo email que você usará no app Kalfi.',
      'gate.lead.skip':
        'Email já verificado — continuando como {email} (sem código novo ~48 h).',
      'gate.email': 'Email',
      'gate.code': 'Código do email',
      'gate.send': 'Enviar código',
      'gate.continue': 'Continuar para o pagamento',
      'gate.resend': 'Reenviar código',
      'gate.otherEmail': 'Usar outro email',
      'gate.sending': 'Enviando código…',
      'gate.opening': 'Abrindo pagamento…',
      'gate.checkInbox': 'Confira a caixa — toque Verify & continue ou cole o código aqui.',
      'gate.sentTo': 'Código enviado para {email}. Cole abaixo ou toque Verify & continue no email.',
      'gate.skipMsg': 'Verificado recentemente — sem código novo ~48 h.',
      'gate.verifying': 'Verificando o código do email…',
      'gate.invalidEmail': 'Digite um email válido.',
      'gate.pasteCode': 'Cole o código de 6 dígitos do email.',
      'gate.invalidCode': 'Código inválido ou expirado.',
      'wise.title': 'Pagar com Wise',
      'wise.status.pay': 'Status · Aguardando pagamento',
      'wise.status.review': 'Status · Em análise',
      'wise.status.active': 'Status · Ativo',
      'wise.progress.pay': 'Pagar',
      'wise.progress.review': 'Análise',
      'wise.progress.active': 'Ativo',
      'wise.lead': 'Envie {amount} USD para {plan}.',
      'wise.ref': 'Referência de pagamento (coloque no memo do Wise):',
      'wise.copy': 'Copiar',
      'wise.copied': 'Copiado',
      'wise.recipient': 'Destinatário Wise:',
      'wise.openPay': 'Abrir pagamento Wise',
      'wise.markPaid': 'Já paguei — avisar o Kalfi',
      'wise.sending': 'Enviando…',
      'wise.hint':
        'Depois de avisar, o status vira Em análise aqui (e por email). Depois Claim / Login no app com {email}.',
      'wise.review.title': 'Pagamento em análise',
      'wise.review.hint':
        'Na fila de ativação — em geral em poucas horas. Esta página atualiza sozinha.',
      'wise.review.keep':
        'Vamos emailar {email} quando o plano estiver ativo. Mantenha esta aba aberta.',
      'wise.checking': 'Checando status…',
      'wise.active.title': 'Pronto',
      'wise.active.ready': 'Plano ativado para {email}. Sem license key.',
      'wise.active.lead':
        'Abra o Kalfi → Settings → Claim / Login com esse email (defina senha na 1ª vez), depois Sync plan.',
      'wise.download': 'Baixar Kalfi',
      'status.awaiting': 'Aguardando pagamento',
      'status.awaiting.hint': 'Envie o Wise com sua referência e toque Já paguei.',
      'status.review': 'Em análise',
      'status.review.hint':
        'Na fila de ativação — em geral em poucas horas. Esta página atualiza sozinha.',
      'status.active': 'Ativo',
      'status.active.hint': 'Plano ativo. Claim / Login no app com o mesmo email.',
      'track.view': 'Ver status',
      'track.order': 'Pedido {ref}'
    },

    vi: {
      'meta.title':
        'Kalfi — trả lời trực tiếp trong phỏng vấn & cuộc gọi khách hàng, dùng API key của bạn',
      'meta.description':
        'Kalfi là overlay desktop nghe cuộc gọi, bắt câu hỏi và viết một dòng bạn có thể nói. BYOK $14/tháng hoặc Hosted $19/tháng.',
      'skip': 'Bỏ qua đến nội dung',
      'nav.product': 'Sản phẩm',
      'nav.pricing': 'Giá',
      'nav.resources': 'Tài nguyên',
      'nav.demo': 'Demo trực tiếp',
      'nav.demo.sub': 'Xem overlay bắt câu hỏi',
      'nav.flow': 'Cách hoạt động',
      'nav.flow.sub': 'Vòng phiên từ setup đến tóm tắt',
      'nav.stealth': 'Stealth',
      'nav.stealth.sub': 'Không hiện trên màn hình chia sẻ',
      'nav.brand': 'Thương hiệu riêng',
      'nav.brand.sub': 'Tên & logo của bạn trong danh sách tiến trình',
      'nav.cost': 'Mô hình chi phí',
      'nav.cost.sub': 'BYOK vs hosted vs tools ~$150',
      'nav.plans': 'Gói',
      'nav.plans.sub': '$14 BYOK · $19 Hosted · $9 Pass',
      'nav.compare': 'So sánh',
      'nav.compare.sub': 'Đối chiếu với đối thủ',
      'nav.docs': 'Docs',
      'nav.docs.sub': 'Cài đặt, setup, dùng hàng ngày',
      'nav.faq': 'FAQ',
      'nav.faq.sub': 'Gatekeeper, key và quy tắc',
      'nav.blog': 'Blog',
      'nav.blog.sub': 'So sánh với giá rõ ràng',
      'nav.download': 'Tải xuống',
      'nav.pro': 'Lấy Pro',
      'nav.menu': 'Menu',
      'nav.lang': 'Ngôn ngữ',
      'hero.tag': 'Overlay desktop · $14 BYOK',
      'hero.title': 'Câu trả lời đã trên màn hình trước khi khoảng lặng trở nên ngượng.',
      'hero.lead':
        'Kalfi nghe cuộc gọi từ máy của bạn, bắt câu hỏi và viết một dòng bạn có thể nói thành tiếng. BYOK $14/tháng với key OpenAI hoặc OpenRouter — hoặc $19 nếu chúng tôi host model. Final Round khoảng $150.',
      'hero.dl': 'Tải cho Mac',
      'hero.demo': 'Chạy demo',
      'hero.detecting': 'Đang nhận hệ thống…',
      'chip.modes': 'Chế độ',
      'chip.modes.v': 'Phỏng vấn · Khách · Chat',
      'chip.audio': 'Âm thanh vào',
      'chip.audio.v': 'Hệ thống, mic, hoặc cả hai',
      'chip.key': 'Key của bạn',
      'chip.key.v': 'Ở trên thiết bị',
      'flow.eyebrow': 'Quy trình',
      'flow.title': 'Một vòng. Mỗi cuộc gọi.',
      'flow.lead':
        'Từ nạp ngữ cảnh đến nói câu trả lời rồi kết thúc họp — cùng một đường, gọn hơn mỗi lần tái sử dụng thread.',
      'flow.1.t': 'Nạp ngữ cảnh một lần',
      'flow.2.t': 'Nghe theo cách cuộc gọi diễn ra',
      'flow.3.t': 'Nói một dòng tự nhiên',
      'flow.4.t': 'Kết thúc họp gọn gàng',
      'stealth.eyebrow': 'Stealth',
      'stealth.title': 'Bật công tắc và xem overlay biến khỏi màn hình chia sẻ.',
      'brand.eyebrow': 'Stealth cá nhân',
      'brand.title': 'Trông như Notes — không phải AI copilot.',
      'cost.eyebrow': 'Chi phí tháng thực',
      'cost.title': 'Tính toán trước khi đăng ký $150.',
      'pricing.eyebrow': 'Giá',
      'pricing.title': 'Gói rõ ràng. Vẫn chỉ là một phần tools $150.',
      'pricing.lead':
        'BYOK hoặc Hosted — tháng hoặc năm. Team 3 chỗ. Chỉ một cuộc gọi? Single Session Pass. Hủy bất cứ lúc nào.',
      'pricing.paid': 'Đã nhận thanh toán.',
      'pricing.paid.help':
        'Mở app Kalfi → Settings → Account. Dùng cùng email checkout để đặt mật khẩu (lần đầu) hoặc đăng nhập. Gói tự mở khóa.',
      'pricing.dl': 'Tải Kalfi',
      'pricing.monthly': 'Hàng tháng',
      'pricing.annual': 'Hàng năm',
      'pricing.save': 'Tiết kiệm tới 29%',
      'aff.codeLabel': 'Mã đối tác / voucher',
      'aff.apply': 'Áp dụng',
      'aff.currencyLabel': 'Hiện giá bằng',
      'aff.hint': 'Thanh toán vẫn bằng USD qua Wise. Tiền tệ khác chỉ là ước tính.',
      'plan.byok.desc':
        'App đầy đủ. Bạn trả usage model trực tiếp cho OpenAI hoặc OpenRouter.',
      'plan.byok.cta': 'Bắt đầu BYOK',
      'plan.hosted.desc':
        'Không cần tài khoản provider. Chat + phiên âm với hạn mức tháng hợp lý.',
      'plan.hosted.cta': 'Đăng ký Hosted',
      'plan.team.desc':
        'Ba chỗ Hosted trên một hóa đơn — cho agency và coach phỏng vấn.',
      'plan.team.cta': 'Bắt đầu Team',
      'plan.pass.desc':
        'Chỉ cần một cuộc gọi? Không đăng ký. 2 giờ / 1 phiên — hết hạn sau 30 ngày nếu không dùng.',
      'plan.pass.cta': 'Lấy Session Pass',
      'plan.month': '/ tháng',
      'plan.yourKey': 'Key của bạn',
      'plan.ourAi': 'AI của chúng tôi',
      'plan.seats': '3 chỗ',
      'plan.oneCall': 'Một cuộc gọi',
      'plan.billed120': 'Thanh toán $120 / năm',
      'plan.billed180': 'Thanh toán $180 / năm',
      'compare.eyebrow': 'Thị trường',
      'compare.title': 'Các tab khác đang tính phí bao nhiêu.',
      'docs.eyebrow': 'Tài liệu',
      'docs.title': 'Cài đặt, thiết lập và dùng mỗi ngày.',
      'docs.cta': 'Mở docs',
      'faq.eyebrow': 'Câu hỏi',
      'faq.title': 'Những gì mọi người hỏi trước khi tải.',
      'dl.eyebrow': 'Nhận Kalfi',
      'dl.title': 'Cài đặt, dán key, vào cuộc gọi tiếp theo.',
      'dl.pro': 'Dùng Pro',
      'dl.releases': 'Tất cả bản phát hành',
      'dl.docs': 'Docs',
      'foot.tag': 'Kalfi — AI desktop cho phỏng vấn và họp.',
      'foot.blog': 'Blog',
      'foot.source': 'Source',
      'foot.contact': 'Liên hệ',
      'checkout.note.wise':
        'Xác minh email, thanh toán Wise (USD), rồi Claim trong app với cùng email — không cần license key.',
      'checkout.note.polar':
        'Trước checkout chúng tôi xác minh email bằng mã một lần, rồi mở thanh toán với địa chỉ đó.',
      'gate.eyebrow': 'Checkout',
      'gate.title': 'Xác nhận email để thanh toán',
      'gate.title.continue': 'Tiếp tục checkout',
      'gate.lead':
        'Chúng tôi khóa hộp thư này cho checkout {plan} — cùng email bạn dùng trong app Kalfi.',
      'gate.lead.skip':
        'Email đã xác minh — tiếp tục với {email} (không cần mã mới ~48 giờ).',
      'gate.email': 'Email',
      'gate.code': 'Mã từ email',
      'gate.send': 'Gửi mã',
      'gate.continue': 'Tiếp tục thanh toán',
      'gate.resend': 'Gửi lại mã',
      'gate.otherEmail': 'Dùng email khác',
      'gate.sending': 'Đang gửi mã…',
      'gate.opening': 'Đang mở thanh toán…',
      'gate.checkInbox': 'Kiểm tra hộp thư — chạm Verify & continue hoặc dán mã tại đây.',
      'gate.sentTo': 'Đã gửi mã tới {email}. Dán bên dưới hoặc chạm Verify & continue trong email.',
      'gate.skipMsg': 'Vừa xác minh — không cần mã mới ~48 giờ.',
      'gate.verifying': 'Đang xác minh mã từ email…',
      'gate.invalidEmail': 'Nhập địa chỉ email hợp lệ.',
      'gate.pasteCode': 'Dán mã 6 số từ email.',
      'gate.invalidCode': 'Mã không hợp lệ hoặc đã hết hạn.',
      'wise.title': 'Thanh toán bằng Wise',
      'wise.status.pay': 'Trạng thái · Chờ thanh toán',
      'wise.status.review': 'Trạng thái · Đang xét duyệt',
      'wise.status.active': 'Trạng thái · Đã kích hoạt',
      'wise.progress.pay': 'Thanh toán',
      'wise.progress.review': 'Xét duyệt',
      'wise.progress.active': 'Kích hoạt',
      'wise.lead': 'Gửi {amount} USD cho {plan}.',
      'wise.ref': 'Mã tham chiếu (ghi vào memo Wise):',
      'wise.copy': 'Sao chép',
      'wise.copied': 'Đã sao chép',
      'wise.recipient': 'Người nhận Wise:',
      'wise.openPay': 'Mở thanh toán Wise',
      'wise.markPaid': 'Đã thanh toán — báo Kalfi',
      'wise.sending': 'Đang gửi…',
      'wise.hint':
        'Sau khi bạn báo, trạng thái thành Đang xét duyệt tại đây (và qua email). Rồi Claim / Login trong app với {email}.',
      'wise.review.title': 'Thanh toán đang xét duyệt',
      'wise.review.hint':
        'Đang xếp hàng kích hoạt — thường trong vài giờ. Trang này tự cập nhật.',
      'wise.review.keep':
        'Chúng tôi sẽ email {email} khi gói sẵn sàng. Giữ tab này mở — trạng thái tự cập nhật.',
      'wise.checking': 'Đang kiểm tra trạng thái…',
      'wise.active.title': 'Bạn đã vào',
      'wise.active.ready': 'Gói đã kích hoạt cho {email}. Không cần license key.',
      'wise.active.lead':
        'Mở Kalfi → Settings → Claim / Login bằng email đó (đặt mật khẩu lần đầu), rồi Sync plan.',
      'wise.download': 'Tải Kalfi',
      'status.awaiting': 'Chờ thanh toán',
      'status.awaiting.hint': 'Gửi Wise kèm mã tham chiếu, rồi chạm Đã thanh toán.',
      'status.review': 'Đang xét duyệt',
      'status.review.hint':
        'Đang xếp hàng kích hoạt — thường trong vài giờ. Trang này tự cập nhật.',
      'status.active': 'Đã kích hoạt',
      'status.active.hint': 'Gói sẵn sàng. Claim / Login trong app với cùng email.',
      'track.view': 'Xem trạng thái',
      'track.order': 'Đơn {ref}'
    }
  }

  var current = 'en'

  function normalize(lang) {
    if (!lang) return 'en'
    var base = String(lang).toLowerCase().split('-')[0]
    if (base === 'in') base = 'id'
    return SUPPORTED.indexOf(base) >= 0 ? base : 'en'
  }

  function detect() {
    try {
      var q = new URLSearchParams(location.search).get('lang')
      if (q) return normalize(q)
    } catch (e) {}
    try {
      var stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return normalize(stored)
    } catch (e) {}
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en'
    return normalize(nav)
  }

  function t(key, vars) {
    var table = STRINGS[current] || STRINGS.en
    var str = (table && table[key]) || (STRINGS.en && STRINGS.en[key]) || key
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.split('{' + k + '}').join(String(vars[k]))
      })
    }
    return str
  }

  function applyDom() {
    document.documentElement.lang = current === 'id' ? 'id' : current
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n')
      if (!key) return
      el.textContent = t(key)
    })
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html')
      if (!key) return
      el.innerHTML = t(key)
    })
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria')
      if (!key) return
      el.setAttribute('aria-label', t(key))
    })
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder')
      if (!key) return
      el.setAttribute('placeholder', t(key))
    })
    var title = t('meta.title')
    if (title && title !== 'meta.title') document.title = title
    var desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', t('meta.description'))
    syncSwitcher()
    try {
      document.dispatchEvent(new CustomEvent('kalfi:lang', { detail: { lang: current } }))
    } catch (e) {}
  }

  function syncSwitcher() {
    document.querySelectorAll('[data-lang-option]').forEach(function (btn) {
      var code = btn.getAttribute('data-lang-option')
      btn.classList.toggle('is-on', code === current)
      btn.setAttribute('aria-pressed', code === current ? 'true' : 'false')
    })
    document.querySelectorAll('[data-lang-current]').forEach(function (el) {
      el.textContent = current.toUpperCase()
    })
  }

  function setLang(lang, opts) {
    opts = opts || {}
    current = normalize(lang)
    try {
      localStorage.setItem(STORAGE_KEY, current)
    } catch (e) {}
    if (opts.updateUrl !== false) {
      try {
        var url = new URL(location.href)
        if (current === 'en') url.searchParams.delete('lang')
        else url.searchParams.set('lang', current)
        history.replaceState(null, '', url.pathname + url.search + url.hash)
      } catch (e) {}
    }
    applyDom()
  }

  function bindSwitcher(root) {
    if (!root) return
    root.addEventListener('click', function (ev) {
      var opt = ev.target.closest('[data-lang-option]')
      if (opt) {
        setLang(opt.getAttribute('data-lang-option'))
        var menu = root.querySelector('[data-lang-menu]')
        var trigger = root.querySelector('[data-lang-trigger]')
        if (menu) menu.hidden = true
        if (trigger) trigger.setAttribute('aria-expanded', 'false')
        return
      }
      var trigger = ev.target.closest('[data-lang-trigger]')
      if (trigger) {
        var menu = root.querySelector('[data-lang-menu]')
        if (!menu) return
        var open = menu.hidden
        menu.hidden = !open
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
      }
    })
    document.addEventListener('click', function (ev) {
      if (root.contains(ev.target)) return
      var menu = root.querySelector('[data-lang-menu]')
      var trigger = root.querySelector('[data-lang-trigger]')
      if (menu) menu.hidden = true
      if (trigger) trigger.setAttribute('aria-expanded', 'false')
    })
  }

  function init() {
    current = detect()
    applyDom()
    document.querySelectorAll('[data-lang-switch]').forEach(bindSwitcher)
  }

  global.KalfiI18n = {
    t: t,
    setLang: setLang,
    getLang: function () {
      return current
    },
    supported: SUPPORTED.slice(),
    labels: LABELS,
    apply: applyDom,
    init: init
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})(window)
