# Sinyal Selesai & Fallback

| | |
|---|---|
| **ID Prefix** | `DONE` |
| **Status** | Terkunci |
| **Bergantung pada** | [`acp-client.md`](./acp-client.md), [`agent-registry.md`](./agent-registry.md) |

## Ringkasan

ACP hanya memberi tahu **turn selesai** (`stopReason`), bukan **task selesai**. Agent bisa berhenti karena pekerjaannya kelar, karena dia mau bertanya, karena dia menyerah, atau karena kehabisan token. Kalau sistem tidak bisa membedakan ini, card akan salah tempat.

Mekanisme utama yang dipilih adalah meminta agent melaporkan statusnya sendiri lewat briefing. Tapi ini **advisory** — tidak ada jaminan di protokol. Karena itu dokumen ini juga mendefinisikan jaring pengaman yang **wajib** ada. Tanpa jaring itu, satu agent yang tidak patuh akan membuat card nyangkut permanen di `in_progress` tanpa kamu sadari.

## Batasan protokol yang mendasari dokumen ini

**ACP tidak memiliki field system prompt.** Instruksi pelaporan dikirim sebagai bagian dari `session/prompt` pertama, bersamaan dengan instruksi card. Agent bebas mengabaikannya, dan sebagian harness punya system prompt sendiri yang bisa menimpa permintaan client.

Ini bukan detail implementasi — ini alasan mengapa seluruh bagian fallback di bawah bersifat wajib, bukan tambahan opsional.

## Kebutuhan

- `DONE-01` — Briefing setiap run meminta agent mengakhiri balasannya dengan blok status terstruktur yang bisa dibaca mesin.
- `DONE-02` — Sistem mem-parse blok status dari pesan terakhir agent pada setiap turn akhir.
- `DONE-03` — Blok status mengklasifikasikan hasil menjadi minimal: selesai, butuh keputusan manusia, dan gagal.
- `DONE-04` — Bila blok status tidak ditemukan, sistem menentukan hasil dari `stopReason` dan ada-tidaknya perubahan file.
- `DONE-05` — Hasil yang disimpulkan tanpa blok status ditandai **"belum terverifikasi"** di UI, sehingga kamu tahu agent tidak mengikuti protokol.
- `DONE-06` — Agent yang berulang kali tidak mengikuti protokol pelaporan diberi catatan tingkat kepatuhan pada card-nya.
- `DONE-07` — Pelaporan eksplisit maupun hasil kesimpulan dicatat sebagai `CardEvent` dengan jenis yang berbeda.
- `DONE-08` — Card tidak pernah berpindah ke `in_review` tanpa minimal satu commit di atas `base_sha`.

## Format briefing

Dikirim bersama instruksi card pada `session/prompt` pertama:

````
Kalau tugas ini sudah selesai, akhiri balasan terakhirmu dengan blok berikut:

```json
{ "agent_o": "done", "summary": "<ringkasan singkat>", "changed_files": ["<path>"] }
```

Kalau kamu butuh keputusan manusia sebelum bisa lanjut, akhiri dengan:

```json
{ "agent_o": "question", "question": "<pertanyaan yang butuh jawaban>" }
```

Kalau kamu tidak bisa melanjutkan, akhiri dengan:

```json
{ "agent_o": "failed", "reason": "<alasan>" }
```
````

Blok ini harus berada di **akhir pesan terakhir** dan merupakan JSON valid di dalam fenced code block. Parser hanya melihat pesan terakhir dari turn yang baru berakhir, bukan seluruh percakapan, agar blok lama dari turn sebelumnya tidak salah dibaca.

## Tabel keputusan

| Blok status | Ada perubahan file? | `stopReason` | Hasil |
|---|---|---|---|
| `done` | Ya | apa pun | → `in_review` |
| `done` | Tidak | apa pun | → `blocked` — "agent melapor selesai tapi tidak ada perubahan" |
| `question` | — | apa pun | → `blocked`, pertanyaan dirender sebagai pesan yang menunggu jawaban |
| `failed` | — | apa pun | → `blocked` dengan alasan dari agent |
| tidak ada | Ya | `end_turn` | → `in_review` dengan badge **belum terverifikasi** |
| tidak ada | Tidak | `end_turn` | → `blocked` |
| tidak ada | — | `refusal` | → `blocked` |
| tidak ada | — | `cancelled` | → `blocked` |
| tidak ada | — | `max_tokens` | → `blocked` |
| tidak ada | — | `max_turn_requests` | → `blocked` |
| tidak ada | — | proses mati | → `blocked`, run `interrupted` |

## Kenapa jaring pengaman ini tidak bisa dilewati

Skenario yang membuat jaring ini wajib: sebuah harness ACP populer memakai system prompt miliknya sendiri dan mengabaikan instruksi tambahan dari client. Tanpa fallback, setiap card yang dijalankan dengan harness itu akan **selamanya** berada di `in_progress` — slot WIP tidak pernah dilepas, board perlahan membeku, dan tidak ada pesan error yang menjelaskan kenapa. Ini mode kegagalan terburuk di seluruh sistem karena tampak seperti "agent masih bekerja".

## Pelacakan kepatuhan

Setiap kali penyimpulan fallback terpakai, itu sinyal bahwa agent tidak mengikuti protokol. Dihitung per card dan per agent:

| Metrik | Dipakai untuk |
|---|---|
| Rasio run tanpa blok status | Badge "agent tidak patuh protokol" pada card dan pada entri agent |
| Jumlah card yang berakhir `blocked` karena "tidak ada perubahan" | Menandakan masalah kualitas instruksi, bukan masalah agent |

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Blok JSON ada tapi tidak valid | Dianggap tidak ada blok; fallback dipakai, event mencatat parse error |
| Blok muncul di tengah pesan, bukan di akhir | Diabaikan; hanya blok di akhir pesan terakhir yang dihitung |
| Blok muncul dari turn lama | Diabaikan; parser hanya membaca turn yang baru berakhir |
| Agent mengirim blok `done` tapi bekerja tanpa commit | → `blocked` (`DONE-08`) |
| Agent mengirim `question` tapi juga sudah mengubah file | Card tetap `blocked`; perubahan dipertahankan di worktree |
| Blok JSON sangat besar (agent menempelkan file) | Parser membatasi ukuran; kelebihan diabaikan dan dicatat |

## Keputusan terbuka

- Apakah perlu bentuk pelaporan tambahan, misalnya `partial` untuk progres yang belum selesai? Usulan: tidak untuk versi awal.
- Apakah sistem boleh memaksa verifikasi deterministik (mis. menjalankan test project) sebagai gate tambahan sebelum `in_review`? Ini akan sangat memperkuat sinyal, tapi menambah waktu run dan mengasumsikan project punya test — belum diputuskan.
- Ambang berapa kali penyimpulan fallback sebelum agent ditandai "tidak patuh"? Usulan: 3.

## Rujukan

- Handshake dan `stopReason`: [`acp-client.md`](./acp-client.md)
- Transisi yang dipicu: [`board-lifecycle.md`](./board-lifecycle.md)
- Capability per agent: [`agent-registry.md`](./agent-registry.md)
