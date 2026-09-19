# ADR 0002 — Strategi dependency per worktree (`OD-02`)

**Status:** Diterima

## Konteks

Setiap worktree adalah checkout terpisah dan secara default **tidak punya** `node_modules`, `vendor`, atau `.venv` sendiri. Ini konsekuensi praktis paling sering diremehkan: kalau dependency harus di-install ulang setiap kali, tiga card paralel bisa berarti tiga kali instalasi penuh (mempengaruhi `WS-09`, `SCHED`).

Pilihan di [`spec/workspace-isolation.md`](../spec/workspace-isolation.md): install ulang, symlink, package-manager store, atau install on-demand.

## Keputusan

- **Strategi: install on demand.** agent-o tidak otomatis meng-install dependency saat membuat worktree. Agent yang menjalankan install ketika dibutuhkan (mis. `npm install` di dalam worktree).
- **Agent boleh mengubah manifest dependency** (`package.json`, lockfile, dll). Karena itu **symlink dari checkout utama tidak dipakai** — symlink akan membuat perubahan agent merusak checkout utama user.
- **Konflik lockfile** (edge case 24): diserahkan ke run `resolve-conflict` dengan instruksi meregenerasi lockfile, bukan merge manual.
- agent-o menyediakan tombol aksi manual untuk menjalankan install bila user mau (bukan otomatis).

## Konsekuensi

- Isolasi penuh tercapai: tidak ada worktree yang berbagi state dependency.
- Waktu run tidak dapat diprediksi dan cenderung lebih lama pada run pertama tiap worktree.
- Disk membengkak seiring jumlah worktree paralel; dibatasi oleh WIP limit (`OD-05`).
- `WS-09` dipenuhi dengan "ketersediaan dependency = tanggung jawab agent", dan UI harus jujur menampilkan bahwa install bisa memakan waktu.

## Kebutuhan terkait

`WS-09`, `CONFLICT-*` (konflik lockfile), `SCHED-*`, edge case 24.
