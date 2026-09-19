# ADR 0004 — Perilaku saat aplikasi restart (`OD-04`)

**Status:** Diterima

## Konteks

Proses agent adalah subprocess agent-o. Kalau agent-o berhenti, seluruh proses agent ikut mati. Sesuai [`spec/persistence-recovery.md`](../spec/persistence-recovery.md), pemulihan didesain dengan asumsi **pekerjaan yang sedang berjalan pasti hilang**; yang diselamatkan adalah state board dan hasil kerja parsial di worktree.

Pilihan: selalu `blocked`, atau resume otomatis bila agent mendukung `loadSession`.

## Keputusan

- Saat start, seluruh run berstatus `running` ditandai `interrupted`, dan card terkait dipindahkan ke `blocked` dengan alasan "aplikasi ditutup saat run berjalan" (`PERSIST-05`, `PERSIST-06`).
- **Tidak ada resume otomatis** di versi awal (`PERSIST-08`). User memutuskan lanjut (`session/load` bila didukung, jika tidak run baru dengan ringkasan konteks) atau buang.
- Worktree yang terinterupsi **dipertahankan** (`PERSIST-07`).
- Card dengan run `queued` dikembalikan ke `blocked` saat start; user memutuskan.

## Konsekuensi

- Aman dan eksplisit: tidak ada proses yang "diam-diam jalan lagi" dengan state agent yang mungkin sudah kacau.
- Konsekuensi yang harus diterima: menjalankan 5 card paralel lalu restart berarti 5 card menunggu keputusan user.
- UI harus menampilkan alasan interupsi dengan jelas, dan menawarkan tombol "Lanjut" (resume) atau "Buang".
- Resume otomatis tetap mungkin ditambahkan kelak tanpa perubahan skema — status `interrupted` sudah membedakan run yang layak di-resume.

## Kebutuhan terkait

`PERSIST-05`, `PERSIST-06`, `PERSIST-07`, `PERSIST-08`, `NFR-18`, `NFR-20`.
