# Card & Thread Percakapan

| | |
|---|---|
| **ID Prefix** | `CARD` |
| **Status** | Terkunci |
| **Bergantung pada** | — |

## Ringkasan

Card adalah unit kerja sekaligus ruang percakapan. Card bukan sekadar judul: dia membawa instruksi awal, thread percakapan dengan agent, dan riwayat seluruh percobaan pengerjaan.

Agent **boleh bertanya balik**. Karena itu `in_progress` bukan satu-satunya state yang mungkin setelah agent berhenti — lihat [`board-lifecycle.md`](./board-lifecycle.md).

## Kebutuhan

- `CARD-01` — Card punya `title` dan `instruction` (instruksi awal untuk agent). `instruction` wajib tidak kosong sebelum card boleh dijalankan.
- `CARD-02` — Card menampilkan thread percakapan berisi pesan user, pesan agent, dan event sistem dalam satu urutan waktu.
- `CARD-03` — Agent boleh mengajukan pertanyaan; pertanyaan itu muncul di thread sebagai item yang menunggu jawaban user.
- `CARD-04` — User bisa menjawab dari UI, dan jawaban itu menjadi bagian dari percakapan agent yang sama bila agent mendukung pemuatan sesi.
- `CARD-05` — Satu card bisa punya banyak run. Riwayat run ditampilkan, bukan hanya run terakhir.
- `CARD-06` — Semua event yang berkaitan dengan card disimpan append-only, sehingga thread bisa dirender ulang setelah aplikasi restart.
- `CARD-07` — Card bisa dipindahkan antar project? **Tidak.** Card terikat pada satu project seumur hidupnya.
- `CARD-08` — Menghapus card yang sedang berjalan memerlukan konfirmasi eksplisit dan membatalkan run aktif.

## Model data

### Card

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | — |
| `project_id` | string | Project pemilik |
| `title` | string | Judul singkat |
| `instruction` | text | Instruksi awal; dikirim saat run dimulai |
| `status` | enum | `backlog` \| `in_progress` \| `blocked` \| `in_review` \| `done` |
| `position` | number | Urutan dalam kolom |
| `agent_id` | string \| null | Override agent; null berarti pakai default project |
| `created_at` / `updated_at` | timestamp | — |

### Run

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | — |
| `card_id` | string | — |
| `attempt_no` | int | Urutan percobaan pada card ini |
| `kind` | enum | `task` \| `resolve-conflict` \| `answer` |
| `agent_id` | string | Agent yang dipakai |
| `session_id` | string \| null | ID sesi ACP |
| `worktree_id` | string | Worktree yang dipakai |
| `status` | enum | `running` \| `finished` \| `interrupted` \| `cancelled` \| `failed` |
| `stop_reason` | string \| null | Nilai `stopReason` dari ACP |
| `started_at` / `ended_at` | timestamp | — |

`kind` penting untuk audit: run `resolve-conflict` menghasilkan perubahan yang **tidak berasal dari task asli**, dan harus bisa dibedakan saat review.

### CardEvent

Append-only. Menjadi sumber render thread.

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | — |
| `card_id` | string | — |
| `run_id` | string \| null | Null untuk event tingkat card (mis. dipindah kolom oleh user) |
| `type` | enum | `card_created`, `moved`, `run_started`, `message`, `tool_call`, `tool_call_update`, `plan`, `thought`, `permission_request`, `permission_decision`, `completion_reported`, `completion_inferred`, `conflict_detected`, `run_ended`, `review_frozen`, `merged`, `rejected`, `deleted` |
| `payload` | JSON | Isi event, bergantung `type` |
| `created_at` | timestamp | — |

Isi file **tidak pernah** disimpan di sini. Event `tool_call` menyimpan nama tool dan argumen, bukan isi file hasil. Isi kode selalu dibaca dari git.

## Thread: apa yang ditampilkan

| Sumber | Tampilan |
|---|---|
| Pesan user (instruksi / jawaban) | Gelembung pengguna |
| `agent_message_chunk` | Gelembung agent, streaming |
| `agent_thought_chunk` | Blok "thinking", dilipat default |
| `tool_call` / `tool_call_update` | Baris tool call dengan status |
| `plan` | Checklist rencana |
| Permission request & keputusannya | Baris audit: tool apa, keputusan apa, policy mana yang berlaku |
| Pelaporan selesai (eksplisit atau disimpulkan) | Badge pada pesan terakhir agent |
| Perpindahan kolom dan operasi git | Baris sistem |

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Card digeser ke In Progress dengan `instruction` kosong | Ditolak, card tidak berpindah (`CARD-01`) |
| Agent mengajukan beberapa pertanyaan sekaligus | Semua dirender; card tetap `blocked` sampai dijawab |
| User menjawab tapi agent tidak mendukung pemuatan sesi | Run baru dibuat dengan konteks ringkasan (lihat [`acp-client.md`](./acp-client.md)) |
| Card dihapus saat run berjalan | Konfirmasi → `session/cancel` → grace period → proses dimatikan paksa → worktree dihapus |
| Event stream terputus di tengah pesan | Pesan disimpan parsial dan ditandai tidak lengkap, bukan hilang |

## Keputusan terbuka

- `OD-06` — apakah pemilihan agent bisa di-override per card (field `agent_id` di atas sudah menyiapkannya, tapi keputusannya belum final).
- Apakah card boleh punya lampiran file atau gambar? Belum diputuskan.
- Apakah perlu sub-task atau checklist di dalam card? Untuk versi awal: tidak.

## Rujukan

- Transisi state: [`board-lifecycle.md`](./board-lifecycle.md)
- Pemetaan streaming: [`acp-client.md`](./acp-client.md)
- Sinyal selesai: [`completion-signal.md`](./completion-signal.md)
