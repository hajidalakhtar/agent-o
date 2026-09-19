# Klien ACP

| | |
|---|---|
| **ID Prefix** | `ACP` |
| **Status** | Terkunci |
| **Bergantung pada** | — |

## Ringkasan

agent-o berperan sebagai **client** dalam Agent Client Protocol. Ini bukan integrasi satu arah: sebagai client, agent-o bertanggung jawab menyediakan **filesystem dan terminal** bagi agent, sekaligus menerima dan membalas permintaan izin.

Konsekuensi arsitekturnya besar. Setiap pembacaan file, penulisan file, dan eksekusi command yang dilakukan agent melewati agent-o. Ini yang membuat penegakan permission bisa terpusat — dan juga yang membuat kesalahan di lapisan ini langsung berdampak ke disk user.

> Nama method dan field di dokumen ini mengacu pada spesifikasi ACP. Sebelum implementasi, verifikasi nama persisnya terhadap versi protokol yang di-advertise agent lewat `initialize`. Jangan hardcode nama dari dokumen ini.

## Kebutuhan

- `ACP-01` — Transport adalah JSON-RPC 2.0 di atas stdio, satu proses agent per sesi.
- `ACP-02` — Client mengimplementasikan method yang dibutuhkan untuk membuka sesi dan mengirim prompt, serta menangani seluruh notifikasi dan request yang datang dari agent.
- `ACP-03` — Handshake `initialize` dilakukan sebelum sesi apa pun dibuka, dan hasilnya disimpan sebagai capability map.
- `ACP-04` — Direktori kerja sesi diarahkan ke **worktree card**, bukan ke folder project.
- `ACP-05` — Client menyediakan operasi baca/tulis file untuk agent, dan setiap operasi melewati permission gate.
- `ACP-06` — Client menyediakan operasi terminal untuk agent, dan setiap command diklasifikasi sebelum dieksekusi.
- `ACP-07` — Client membalas setiap permintaan izin dari agent, baik dari policy otomatis maupun dari keputusan user.
- `ACP-08` — Pembatalan (`session/cancel`) diikuti grace period sebelum proses dimatikan paksa.
- `ACP-09` — Seluruh output non-protokol pada stdout dan stderr proses agent disimpan sebagai log mentah per run.
- `ACP-10` — Satu run memegang tepat satu `session_id`; tidak ada sesi yang dipakai bersama antar card.

## Lifecycle sesi

```
spawn proses
    │
    ├─ initialize ────────────▶ simpan capability + authMethods
    │
    ├─ authenticate (opsional) ▶ sesuai metode yang tersedia
    │
    ├─ session/new(cwd = worktree, mcpServers = [])
    │
    ├─ session/prompt(briefing + instruction)  ◀── turn 1
    │       │
    │       ├─ session/update × N  ──▶ streaming ke UI + CardEvent
    │       ├─ session/request_permission ──▶ permission gate
    │       ├─ session/load (bila didukung) ──▶ lanjutkan card `blocked`
    │       │
    │       └─ selesai dengan stopReason
    │
    ├─ session/cancel (bila user stop atau aplikasi menutup)
    │
    └─ matikan proses
```

Proses agent **dimatikan** setiap kali card tidak berada di `in_progress`. Menahan proses agent yang menganggur hanya membuang memori dan berisiko membuat state agent melenceng dari state board.

## Pemetaan notifikasi ke UI

| Update dari agent | Tampilan |
|---|---|
| `agent_message_chunk` | Gelembung pesan agent, streaming |
| `agent_thought_chunk` | Blok "thinking", dilipat default |
| `tool_call` / `tool_call_update` | Baris tool call dengan status pending/running/selesai/gagal |
| `plan` | Checklist rencana agent |
| `user_message_chunk` | Echo instruksi yang dikirim |

Setiap update disimpan ke `CardEvent`, sehingga thread bisa dirender ulang setelah restart, bukan hanya dari memori.

## `stopReason` dan artinya

| `stopReason` | Arti | Tindakan awal |
|---|---|---|
| `end_turn` | Agent menyelesaikan gilirannya | Dievaluasi oleh logika sinyal selesai — **bukan otomatis dianggap selesai** |
| `max_tokens` | Kehabisan token | Card ke `blocked` dengan alasan jelas |
| `max_turn_requests` | Batas jumlah giliran tercapai | Card ke `blocked` |
| `refusal` | Agent menolak mengerjakan | Card ke `blocked` |
| `cancelled` | Dibatalkan oleh user | Card ke `blocked` |

`stopReason` hanya menandai **akhir turn**, bukan **akhir task**. Perbedaan inilah alasan [`completion-signal.md`](./completion-signal.md) ada.

## Menangani output non-protokol

Proses agent sering menulis hal lain ke stdout — banner startup, peringatan versi, log debug. Ini bisa merusak parser JSON-RPC. Penanganan:

- Setiap baris stdout yang bukan JSON-RPC valid ditulis ke log mentah run dan **tidak** dianggap error fatal.
- Kalau output non-protokol muncul dalam jumlah besar pada satu sesi, agent ditandai berisiko dan handshake-nya diulang.
- stderr selalu disimpan utuh; itulah satu-satunya petunjuk saat agent crash.

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Proses agent crash di tengah turn | Tidak ada `stopReason` → run `interrupted`, card ke `blocked`, log dilampirkan |
| Agent tidak pernah mengirim update apa pun | Timeout diam (dead air) → peringatan di UI, lalu card ke `blocked` bila berlanjut |
| Agent tidak merespons `session/prompt` | Timeout → proses dimatikan, run `failed` |
| Agent tidak mendukung `session/load` | Card `blocked` dilanjutkan dengan run baru memakai ringkasan konteks |
| Permintaan izin datang saat user tidak menonton | Bergantung pada policy dan `OD-01`/`OD-08` |
| Agent meminta menulis di luar worktree | Ditolak oleh gate; percobaan dicatat sebagai event di card |
| Agent meminta menjalankan operasi git remote | Ditolak secara default; dicatat sebagai event |
| Stream terputus saat pesan parsial | Pesan disimpan apa adanya dan ditandai tidak lengkap |
| Dua sesi aktif pada satu card | Dicegah di level orchestrator (`BOARD-03`) |

## Keputusan terbuka

- Ambang waktu: **handshake 30 detik, respons prompt 60 detik, dead air 2 menit, grace period 5 detik**. Diukur pada spike Fase 0: handshake nyata 0,38–0,39 detik, `session/new` 6–17 ms, turn contoh 11 ms–5 s (lihat [ADR 0000](../adr/0000-acp-spike.md)). Dead air diturunkan dari usulan awal 5 menit menjadi 2 menit.
- Apakah agent-o perlu mendukung `mcpServers` di `session/new` pada versi awal? Usulan: tidak, kirim array kosong.
- Apakah client perlu mengimplementasikan operasi terminal terpisah, atau cukup menyediakan eksekusi command? Bergantung pada apa yang benar-benar diminta agent di lapangan, dan ini harus diverifikasi lewat spike.

## Rujukan

- Registry dan capability: [`agent-registry.md`](./agent-registry.md)
- Permission gate: [`permissions.md`](./permissions.md)
- Aksi saat proses mati: [`persistence-recovery.md`](./persistence-recovery.md)
