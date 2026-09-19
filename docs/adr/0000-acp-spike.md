# ADR 0000 — Hasil spike ACP (Fase 0)

**Status:** Selesai — asumsi protokol terverifikasi
**Tanggal:** 2026-09-19
**Kode:** [`scripts/spike/`](../../scripts/spike/) (`run.mjs`, `harness-simple.mjs`), dijalankan dengan `npm run spike`

## Tujuan

Membuktikan atau membantah asumsi paling berbahaya sebelum arsitektur ditulis: bahwa agent ACP bisa dijalankan **headless**, digerakkan dari aplikasi biasa (bukan editor), dan mau memakai filesystem yang kita sediakan.

## Metode

Satu klien ACP (`scripts/spike/run.mjs`, memakai `@agentclientprotocol/sdk` v1.4.0) menjalankan satu prompt di satu direktori kerja sementara terhadap **dua implementasi agent berbeda** lewat stdio nyata:

| Harness | Implementasi | Perbedaan yang disengaja |
|---|---|---|
| `sdk-example-agent` | contoh agent bawaan SDK | mengirim `session/request_permission` per tool; `loadSession: false` |
| `harness-b-minimal` | harness tulisan sendiri | **tidak pernah** minta izin; memakai `fs/write_text_file` & `fs/read_text_file` milik client; `loadSession: true` |

Output non-protokol diuji lewat penanganan stderr/stdout di luar JSON-RPC (parser `ndJsonStream` tetap hidup).

## Hasil terukur

| Metrik | `sdk-example-agent` | `harness-b-minimal` |
|---|---|---|
| Handshake `initialize` | 390 ms | 382 ms |
| `protocolVersion` | 1 | 1 |
| `session/new` | 17 ms | 6 ms |
| `session/prompt` (turn penuh) | 5.024 ms | 11 ms |
| `stopReason` | `end_turn` | `end_turn` |
| Update streaming | 7 (3 pesan, 4 tool call) | 2 (2 pesan) |
| `session/request_permission` diterima | **1** (granular, per tool) | **0** |
| `fs/write_text_file` dari agent | 0 | **1** |
| `fs/read_text_file` dari agent | 0 | **1** |
| Agent benar-benar membuat file di worktree | tidak (simulator) | **ya** (`dari-harness-b.txt`) |
| Blok status `{"agent_o":"done"}` di akhir pesan | **tidak ada** | ada |
| Proses mati bersih | ya | ya |
| Output non-protokol di stderr | kosong | kosong |

### Tabel capability nyata per harness

| Capability | `sdk-example-agent` | `harness-b-minimal` |
|---|---|---|
| `loadSession` | `false` | `true` |
| `promptCapabilities` | tidak di-advertise | `{image:false, audio:false, embeddedContext:false}` |
| `authMethods` | `null` | `[]` |
| Permission request granular | ada | **tidak ada** |
| Memakai fs milik client | tidak | ya |

## Temuan

1. **Asumsi inti benar.** Agent ACP bisa dijalankan headless, digerakkan aplikasi non-editor, dan (pada harness yang mau) memakai `fs/*` yang kita sediakan. `initialize` + `session/new` + `session/prompt` + streaming bekerja penuh tanpa editor.
2. **Perbedaan capability nyata, bukan dugaan.** Dua implementasi yang sama-sama valid menghasilkan capability map yang berbeda. Fitur agent-o yang bergantung pada satu kemampuan **wajib** dideteksi lewat handshake (`NFR-22`, `NFR-23`).
3. **Permission granular tidak universal.** Satu harness mengirim permintaan izin per tool; satu lagi tidak pernah. Karena itu `OD-01`/`OD-08` tetap krusial: policy statis harus jadi jalur utama, dan opsi "tanya user" hanya ditawarkan bila harness memang mengirim `session/request_permission`.
4. **Sinyal selesai benar-benar rapuh — ini risiko terbesar yang terkonfirmasi.** `sdk-example-agent` **mengabaikan** instruksi pelaporan status di briefing: blok `{"agent_o":"done"}` tidak muncul meski prompt memintanya. Tanpa jaring fallback `DONE-04`, card itu akan menggantung di `in_progress` selamanya. Ini mengubah jaring fallback dari "penting" menjadi **terbukti wajib**.
5. **Proses mati bersih** dengan `SIGTERM` setelah koneksi ditutup; tidak ada proses yatim pada kedua harness.
6. **Output non-protokol tidak merusak parser.** Kedua harness tidak menulis ke stderr pada skenario ini; parser `ndJsonStream` menangani baris non-JSON di luar aliran pesan. Karena belum ada bukti positif (harness berisik), penanganan ini tetap diuji lagi saat harness nyata dipasang.

## Dampak ke spesifikasi

- **Timeout usulan (mengisi keputusan terbuka di [`../spec/acp-client.md`](../spec/acp-client.md)):** handshake 30 detik dan grace period 5 detik dipertahankan; respons prompt 60 detik cukup (turn contoh 5 detik). Dead air diturunkan dari 5 menit → **2 menit**, karena handshake nyata ternyata < 0,5 detik.
- **Capability map** mengisi tabel di [`../spec/agent-registry.md`](../spec/agent-registry.md).
- **`OD-01`/`OD-08`**: karena satu harness tidak punya permission granular, default `allow` di dalam worktree ([ADR 0001](./0001-od-01-default-permission-policy.md)) menjadi makin penting.

## Batasan yang harus jujur disebut

- Kedua harness adalah **implementasi lokal/referensi**, bukan produk nyata. Tabel capability ini memvalidasi **plumbing client agent-o**, bukan perilaku OpenCode/Claude Code/Gemini CLI/Goose.
- Gate roadmap Fase 0 meminta "minimal dua harness ACP berbeda"; itu terpenuhi secara implementasi, tetapi tabel capability untuk produk nyata **belum** ada dan harus diisi saat harness nyata dipasang (agent-registry Fase 5).
- Hanya `harness-b-minimal` yang menghasilkan perubahan file di worktree. Contoh agent SDK adalah simulator dan tidak menulis file.

## Kebutuhan terkait

`ACP-01`–`ACP-10`, `AGENT-01`, `AGENT-02`, `AGENT-03`, `DONE-01`, `DONE-04`, `DONE-05`, `NFR-22`, `NFR-23`, `NFR-24`, `OD-01`, `OD-08`.
