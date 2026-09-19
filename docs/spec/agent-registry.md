# Registry Agent & Capability

| | |
|---|---|
| **ID Prefix** | `AGENT` |
| **Status** | Terkunci |
| **Bergantung pada** | [`acp-client.md`](./acp-client.md) untuk handshake |

## Ringkasan

"Agent agnostik" berarti agent-o tidak terikat pada satu harness. Apa pun yang berbicara ACP bisa didaftarkan: OpenCode, Claude Code, Gemini CLI, Goose, atau harness lain.

Tetapi agnostik **bukan** jaminan perilaku seragam. Cakupan implementasi ACP berbeda-beda antar agent: ada yang mengirim `session/request_permission` per tool, ada yang hanya per turn, ada yang tidak pernah mengirimnya karena punya sandbox sendiri. Karena itu modelnya adalah: **kemampuan dideteksi lewat handshake, bukan diasumsikan.** Fitur yang tidak didukung dimatikan secara terang-terangan.

## Kebutuhan

- `AGENT-01` — User bisa mendaftarkan agent baru dengan menentukan command dan argumen untuk menjalankan prosesnya.
- `AGENT-02` — Saat didaftarkan dan setiap kali diaktifkan, agent-o menjalankan handshake `initialize` dan menyimpan hasilnya sebagai capability map.
- `AGENT-03` — Fitur agent-o yang bergantung pada kemampuan tertentu harus dimatikan dengan pesan jelas bila capability-nya tidak tersedia.
- `AGENT-04` — Agent dengan masalah autentikasi ditandai `needs_auth` dan tidak boleh dipakai untuk menjalankan card.
- `AGENT-05` — Agent bisa diaktifkan dan dinonaktifkan tanpa menghapus riwayat run yang memakainya.
- `AGENT-06` — Setiap agent punya batas konkurensi sendiri yang bisa lebih ketat daripada WIP limit project.
- `AGENT-07` — Status kesehatan agent (bisa di-spawn, bisa handshake, terautentikasi) ditampilkan di UI dan diperbarui saat handshake gagal.
- `AGENT-08` — Riwayat run menyimpan `agent_id` dan versi capability yang dipakai, sehingga hasil lama tetap bisa ditafsirkan setelah agent diperbarui.
- `AGENT-09` — Kredensial tidak disimpan oleh agent-o. Autentikasi didelegasikan ke mekanisme harness masing-masing.

## Model data

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | — |
| `name` | string | Nama tampilan, mis. "OpenCode" |
| `command` | string | Executable, mis. `opencode` |
| `args` | string[] | Argumen, mis. `["acp"]` |
| `env` | map | Environment tambahan |
| `max_concurrency` | int | Batas card bersamaan untuk agent ini |
| `capabilities` | JSON | Hasil `initialize`, disimpan apa adanya |
| `auth_method` | string \| null | Metode yang dipilih bila `authMethods` menyediakan lebih dari satu |
| `health` | enum | `ok` \| `needs_auth` \| `spawn_failed` \| `handshake_failed` \| `disabled` |
| `enabled` | bool | — |
| `last_checked_at` | timestamp | — |

## Capability map

Hasil `initialize` diterjemahkan menjadi daftar fitur yang boleh dipakai:

| Fitur agent-o | Bergantung pada | Kalau tidak didukung |
|---|---|---|
| Melanjutkan card `blocked` tanpa kehilangan konteks | `agentCapabilities.loadSession` | Mulai run baru dengan ringkasan konteks sebagai prompt |
| Menampilkan gambar atau konteks kaya di prompt | `promptCapabilities` | Hanya teks yang dikirim |
| Approval manual per aksi di UI | Agent mengirim `session/request_permission` | Semua request jatuh ke policy statis; opsi "tanya user" tidak ditawarkan |
| Melaporkan status selesai secara eksplisit | Kepatuhan agent pada briefing | Pakai fallback `stopReason` (lihat [`completion-signal.md`](./completion-signal.md)) |

## Terjemahan capability

Perlu ditegaskan: **tidak ada satu pun fitur agent-o yang dijamin oleh protokol.** Yang dijamin hanyalah bahwa agent bisa dimulai, menyelesaikan handshake, dan merespons `session/prompt`. Semua di atas itu adalah hasil deteksi. UI harus menampilkan ini sebagai fakta, misalnya dengan badge "agent ini tidak mendukung permintaan izin — semua aksi mengikuti policy project".

## Hasil spike Fase 0

Capability yang benar-benar teramati dari dua harness berbeda pada spike ACP (lihat [ADR 0000](../adr/0000-acp-spike.md)). Ini contoh nyata bahwa capability map harus diisi dari handshake, bukan diasumsikan:

| Capability | contoh agent SDK | harness minimal |
|---|---|---|
| `loadSession` | `false` | `true` |
| `promptCapabilities` | tidak di-advertise | `{image:false, audio:false, embeddedContext:false}` |
| `authMethods` | `null` | `[]` |
| Permission request granular | ada | **tidak ada** |
| Memakai `fs/*` milik client | tidak | ya |

Konsekuensi: `harness-b-minimal` tidak bisa menawarkan opsi "tanya user" — semua aksinya jatuh ke policy statis; sedangkan `sdk-example-agent` tidak mendukung pemuatan sesi sehingga card `blocked` harus dilanjutkan dengan run baru + ringkasan konteks.

> Catatan: kedua harness pada spike adalah implementasi lokal/referensi, bukan produk nyata. Tabel capability untuk OpenCode/Claude Code/Gemini CLI/Goose diisi saat harness nyata didaftarkan (Fase 5).


## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Command tidak ditemukan di PATH | `health = spawn_failed`, pesan menyebut command yang dicari |
| Proses start lalu langsung mati | `health = handshake_failed`, log mentah dilampirkan |
| Handshake timeout | Dianggap gagal setelah ambang waktu; proses dimatikan |
| `authMethods` tidak kosong dan `authenticate` gagal | `health = needs_auth`; card yang memakai agent ini tidak bisa dijalankan |
| Agent mengubah perilaku setelah diperbarui | Handshake ulang memperbarui capability; run lama tetap merujuk capability yang tersimpan |
| Dua agent memakai executable dan direktori kerja yang sama | Diizinkan, tapi masing-masing punya proses dan sesi sendiri |
| Agent tidak merespons `session/new` | `handshake_failed`; agent tidak bisa dipakai |

## Keputusan terbuka

- `OD-06` — apakah agent bisa di-override per card, atau hanya default di level project.
- Apakah agent-o boleh mencoba menjalankan unduhan otomatis untuk agent yang belum terpasang? Usulan: tidak, cukup tampilkan perintah instalasinya.
- Bagaimana menampilkan dan membandingkan "kepatuhan protokol" antar agent (mis. agent yang sering mengabaikan permintaan laporan selesai)?
- Apakah daftar agent punya preset bawaan yang bisa dipilih sekali klik, atau user mengetik command sendiri? Preset lebih ramah, tapi harus dipelihara.

## Rujukan

- Handshake dan lifecycle sesi: [`acp-client.md`](./acp-client.md)
- Efek ke konkurensi: [`scheduler.md`](./scheduler.md)
- Fallback sinyal selesai: [`completion-signal.md`](./completion-signal.md)
